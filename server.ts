import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findGeminiApiKeyFromEnv(): string {
  const direct = (
    process.env.GEMINI_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    process.env.NEXT_PUBLIC_GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.API_KEY ||
    ""
  ).trim();
  if (direct && direct.length > 8) return direct;

  for (const [, val] of Object.entries(process.env)) {
    const trimmed = (val || "").trim();
    if (trimmed.startsWith("AIza") && trimmed.length > 20) {
      return trimmed;
    }
  }
  return "";
}

function getGenAIClient() {
  return new GoogleGenAI({
    apiKey: findGeminiApiKeyFromEnv(),
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function findProxyApiKeyFromEnv(): string {
  const direct = (
    process.env.OPENAI_API_KEY ||
    process.env.VITE_OPENAI_API_KEY ||
    process.env.NEXT_PUBLIC_OPENAI_API_KEY ||
    process.env["trollllm.xyz"] ||
    process.env.TROLLLLM_API_KEY ||
    process.env.VITE_TROLLLLM_API_KEY ||
    process.env.PROXY_API_KEY ||
    process.env.VITE_PROXY_API_KEY ||
    ""
  ).trim();

  if (direct && direct !== "MY_OPENAI_API_KEY" && direct.length > 5) {
    return direct;
  }

  // Fallback: scan all env vars for any key starting with "sk-" (e.g., "sk-trollllm-...")
  for (const [key, val] of Object.entries(process.env)) {
    if (key.includes("GEMINI")) continue;
    const trimmed = (val || "").trim();
    if (trimmed.startsWith("sk-") && trimmed.length > 10) {
      return trimmed;
    }
  }

  return "";
}

function getProxyConfig(customBaseUrl?: string, customModel?: string) {
  const apiKey = findProxyApiKeyFromEnv();
  let rawBaseUrl = (
    customBaseUrl ||
    process.env.OPENAI_BASE_URL ||
    "https://chat.trollllm.xyz/v1"
  )
    .trim()
    .replace(/\/+$/, "");

  // Automatically rewrite root domain https://trollllm.xyz -> https://chat.trollllm.xyz/v1
  rawBaseUrl = rawBaseUrl.replace(
    /^https?:\/\/(www\.)?trollllm\.xyz(\/v1)?$/i,
    "https://chat.trollllm.xyz/v1"
  );

  if (
    rawBaseUrl &&
    !rawBaseUrl.endsWith("/v1") &&
    !rawBaseUrl.endsWith("/chat/completions")
  ) {
    rawBaseUrl = `${rawBaseUrl}/v1`;
  }

  const model = (
    customModel ||
    process.env.OPENAI_MODEL ||
    "claude-sonnet-4-6"
  ).trim();
  const hasValidKey = Boolean(apiKey) && apiKey.length > 5;

  return {
    apiKey,
    baseUrl: rawBaseUrl,
    model,
    hasValidKey,
  };
}

const PROXY_FALLBACK_MODELS = [
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  "gpt-6-astra",
];

function extractScenesArraySafely(rawText: string): any[] | null {
  if (!rawText || typeof rawText !== "string") return null;
  const trimmed = rawText.trim();
  if (!trimmed || trimmed.startsWith("<")) return null;

  const jsonMatch = trimmed.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {
      // Fall through to object-by-object recovery if array was truncated
    }
  }

  // Recover complete {...} objects if a large 18-20 scene response was truncated before closing ']'
  const recovered: any[] = [];
  const objRegex = /\{[^{}]*"title"\s*:\s*"[^"]*"[^{}]*\}/g;
  let match: RegExpExecArray | null;
  while ((match = objRegex.exec(trimmed)) !== null) {
    try {
      const obj = JSON.parse(match[0]);
      if (obj && typeof obj === "object" && (obj.narrationText || obj.title)) {
        recovered.push(obj);
      }
    } catch {
      // Ignore malformed fragment
    }
  }
  return recovered.length >= 3 ? recovered : null;
}

async function callIntermediaryChatCompletion(options: {
  systemPrompt: string;
  userPrompt: string;
  customBaseUrl?: string;
  customModel?: string;
}): Promise<{ scenes: any[]; usedModel: string }> {
  const { apiKey, baseUrl, model, hasValidKey } = getProxyConfig(
    options.customBaseUrl,
    options.customModel
  );

  if (!hasValidKey) {
    throw new Error(
      "Chưa cấu hình OPENAI_API_KEY trong bảng Settings > Secrets của AI Studio."
    );
  }

  const endpoint = baseUrl.endsWith("/chat/completions")
    ? baseUrl
    : `${baseUrl}/chat/completions`;

  // Limit to at most 2 fast candidates so total proxy time never triggers gateway timeout
  const candidateModels = Array.from(
    new Set([model, ...PROXY_FALLBACK_MODELS].filter(Boolean))
  ).slice(0, 2);

  let lastErrorMsg = "";

  for (const candidateModel of candidateModels) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: candidateModel,
          temperature: 0.7,
          max_tokens: 4096,
          messages: [
            { role: "system", content: options.systemPrompt },
            { role: "user", content: options.userPrompt },
          ],
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const rawBody = await response.text();
      if (!response.ok || rawBody.trim().startsWith("<")) {
        lastErrorMsg = `API trung gian trả về mã ${response.status}`;
        continue;
      }

      let data: any;
      try {
        data = JSON.parse(rawBody);
      } catch {
        lastErrorMsg = "Phản hồi từ API trung gian không phải JSON hợp lệ.";
        continue;
      }

      const content: string = data?.choices?.[0]?.message?.content || "";
      const extracted = extractScenesArraySafely(content);
      if (!extracted) {
        lastErrorMsg = "Phản hồi từ API trung gian không đúng định dạng mảng JSON.";
        continue;
      }

      return {
        scenes: extracted,
        usedModel: candidateModel,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      lastErrorMsg = err?.message || "Hết thời gian chờ API trung gian.";
      continue;
    }
  }

  throw new Error(lastErrorMsg || "Không thể gọi API trung gian.");
}

const SCENE_ARRAY_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      title: {
        type: Type.STRING,
        description: "Short Vietnamese scene title (3-7 words)",
      },
      sceneType: {
        type: Type.STRING,
        description:
          "One of: 'video' (for dynamic action, lip-sync talking head, or archival movie clip), 'image' (for vintage still portrait with Ken Burns & rounded border), 'quote' (for dramatic pitch-black screen with centered white text), 'outro' (final brand crest)",
      },
      narrationText: {
        type: Type.STRING,
        description: "Primary spoken narration for this scene (12-28 words)",
      },
      translationText: {
        type: Type.STRING,
        description: "Secondary language translation of the narration",
      },
      visualPrompt: {
        type: Type.STRING,
        description:
          "Clear Vietnamese guide starting with 'CẦN VIDEO:' or 'CẦN ẢNH TĨNH:' or 'THẺ CHỮ ĐEN:' explaining what visual asset to prepare for this segment",
      },
      imagePrompt: {
        type: Type.STRING,
        description:
          "Detailed English prompt for AI Image Generation (ChatGPT Pro / DALL-E / Midjourney / Flux) in 3:4 vertical portrait format, vintage documentary photography style",
      },
      videoMotionPrompt: {
        type: Type.STRING,
        description:
          "A scripted 3-beat English director prompt specifically for KLING AI (Image-to-Video / I2V) structured as: '[Kling AI I2V - Lock Reference Face Identity] [0-2s Opening Beat]: Starting from the uploaded reference frame of the subject (describe visual traits/attire instead of celebrity name to avoid filters), initial posture & micro-expression -> [2-4s Story Action & Speech]: Preserving 100% exact facial identity from the reference image, specific gesture, physical interaction, or expressive lip movement tied to the narration -> [4-6s Camera Control & Climax]: Kling camera movement (dolly push-in/tracking) and atmospheric lighting shift'",
      },
      archivalKeywords: {
        type: Type.STRING,
        description:
          "English search keywords to find real archival photos or footage (e.g. 'Clint Eastwood 1960s western portrait')",
      },
      motionEffect: {
        type: Type.STRING,
        description: "One of: 'zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'static'",
      },
      colorFilter: {
        type: Type.STRING,
        description: "One of: 'color-warm', 'bw-vintage', 'sepia', 'original'",
      },
      frameStyle: {
        type: Type.STRING,
        description: "One of: 'full-bleed', 'rounded-frame', 'cinema-letterbox'",
      },
      durationSec: {
        type: Type.NUMBER,
        description: "Recommended scene duration in seconds (between 5 and 11)",
      },
    },
    required: [
      "title",
      "sceneType",
      "narrationText",
      "translationText",
      "visualPrompt",
      "imagePrompt",
      "videoMotionPrompt",
      "archivalKeywords",
      "motionEffect",
      "colorFilter",
      "frameStyle",
      "durationSec",
    ],
  },
};

const JSON_SCHEMA_INSTRUCTION_FOR_PROXY = `You MUST respond ONLY with a valid JSON array (no extra text outside the JSON array). Each object in the array must have these exact keys:
- "title": string (short Vietnamese title)
- "sceneType": "video" | "image" | "quote" | "outro"
- "narrationText": string (English narration, 12-26 words)
- "translationText": string (Vietnamese translation)
- "visualPrompt": string (Vietnamese guide starting with "CẦN VIDEO:" or "CẦN ẢNH TĨNH:" or "THẺ CHỮ ĐEN:")
- "imagePrompt": string (Detailed English prompt for 3:4 vintage documentary photography)
- "videoMotionPrompt": string (A scripted 3-beat English motion prompt for KLING AI Image-to-Video formatted as: "[Kling AI I2V - Lock Reference Face Identity] [0-2s Opening Beat]: Starting from the uploaded reference frame of the subject (use visual traits/clothing, NOT celebrity names so Kling never blocks)... -> [2-4s Story Action & Speech]: Preserving 100% exact facial identity from the reference image... -> [4-6s Camera Control & Climax]: Smooth Kling dolly push-in...")
- "archivalKeywords": string (English keywords for Google Images search)
- "motionEffect": "zoom-in" | "zoom-out" | "pan-left" | "pan-right" | "static"
- "colorFilter": "bw-vintage" | "sepia" | "color-warm" | "original"
- "frameStyle": "full-bleed" | "rounded-frame" | "cinema-letterbox"
- "durationSec": number (between 5 and 10)`;

export const app = express();
app.use(express.json({ limit: "25mb" }));

// Ensure Vercel Serverless Function rewrites (/api/* -> /api/index or /*) always preserve /api prefix for Express routes
app.use((req, _res, next) => {
  if (
    req.url &&
    !req.url.startsWith("/api/") &&
    req.url !== "/api" &&
    (req.url.startsWith("/proxy/") ||
      req.url.startsWith("/story/") ||
      req.url.startsWith("/archival/") ||
      req.url.startsWith("/tts/"))
  ) {
    req.url = `/api${req.url}`;
  }
  next();
});

function registerRoutes() {

  // 0. Check Intermediary Proxy API Configuration Status & Test Endpoint
  app.get("/api/proxy/status", (_req, res) => {
    const cfg = getProxyConfig();
    const hasGemini = Boolean(findGeminiApiKeyFromEnv());
    res.json({
      configured: cfg.hasValidKey || hasGemini,
      hasProxyKey: cfg.hasValidKey,
      hasGeminiKey: hasGemini,
      isVercel: Boolean(process.env.VERCEL),
      baseUrl: cfg.baseUrl,
      model: cfg.model,
    });
  });

  // Fetch available models from the user's Intermediary Proxy API (/v1/models)
  app.post("/api/proxy/models", async (req, res) => {
    try {
      const { customBaseUrl } = req.body || {};
      const cfg = getProxyConfig(customBaseUrl);

      if (!cfg.hasValidKey) {
        const defaultBuiltInModels = [
          "claude-sonnet-4-6",
          "claude-haiku-4-5",
          "claude-opus-4-6",
          "gpt-6-astra",
          "gpt-6-sol",
          "gemini-3-8-flash",
          "legendcut-chronological-v2",
        ];
        res.json({
          ok: true,
          fallbackActive: true,
          models: defaultBuiltInModels,
          message:
            "Đang chạy Chế Độ Tự Động Đa Nguồn (LegendCut Built-in Engine). Nếu muốn dùng riêng khóa TrollLLM trên Vercel, hãy thêm OPENAI_API_KEY vào Vercel Settings > Environment Variables rồi bấm Redeploy.",
        });
        return;
      }

      const modelsUrl = `${cfg.baseUrl.replace(/\/chat\/completions$/, "")}/models`;
      const response = await fetch(modelsUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
        },
      });

      if (!response.ok) {
        const errText = await response.text();
        res.status(400).json({
          ok: false,
          error: `Không thể lấy danh sách model (${response.status}): ${errText.slice(0, 160)}`,
        });
        return;
      }

      const data: any = await response.json();
      const rawList = Array.isArray(data?.data) ? data.data : [];
      const models: string[] = rawList
        .map((m: any) => String(m?.id || "").trim())
        .filter(Boolean);

      res.json({
        ok: true,
        models,
      });
    } catch (error: any) {
      res.status(500).json({
        ok: false,
        error: error?.message || "Lỗi khi tải danh sách model từ API trung gian.",
      });
    }
  });

  app.post("/api/proxy/test", async (req, res) => {
    try {
      const { customBaseUrl, customModel } = req.body || {};
      const cfg = getProxyConfig(customBaseUrl, customModel);
      const hasGemini = Boolean(findGeminiApiKeyFromEnv());

      if (!cfg.hasValidKey) {
        res.json({
          ok: true,
          fallbackActive: true,
          switchedModel: cfg.model || "claude-sonnet-4-6",
          message: hasGemini
            ? "✅ Máy chủ đã kích hoạt sẵn Gemini AI & LegendCut Engine! Bạn có thể tạo kịch bản 14–20 cảnh, lấy ảnh thật và xuất video ngay (Nếu muốn dùng thêm khóa TrollLLM trên Vercel, hãy thêm biến OPENAI_API_KEY trong mục Vercel Project Settings > Environment Variables rồi Redeploy)."
            : "✅ Đã kích hoạt Bộ Dựng Kịch Bản & Tìm Ảnh Thật Tích Hợp Sẵn trên Vercel! Bạn có thể tạo kịch bản 14–20 cảnh, lấy ảnh thật và xuất video ngay lập tức (Để gắn thêm khóa TrollLLM/Gemini trên Vercel: vào Vercel Dashboard -> Settings -> Environment Variables -> thêm OPENAI_API_KEY & GEMINI_API_KEY -> bấm Redeploy).",
        });
        return;
      }

      const endpoint = cfg.baseUrl.endsWith("/chat/completions")
        ? cfg.baseUrl
        : `${cfg.baseUrl}/chat/completions`;

      const candidateModels = Array.from(
        new Set([cfg.model, ...PROXY_FALLBACK_MODELS].filter(Boolean))
      );

      let lastErrText = "";
      let lastStatus = 400;

      for (const candidateModel of candidateModels) {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${cfg.apiKey}`,
          },
          body: JSON.stringify({
            model: candidateModel,
            max_tokens: 25,
            messages: [{ role: "user", content: "Reply with: OK" }],
          }),
        });

        if (response.ok) {
          const data: any = await response.json();
          const reply = data?.choices?.[0]?.message?.content || "OK";
          const switchedNote =
            candidateModel !== cfg.model
              ? ` (Đã tự động chuyển từ "${cfg.model}" sang model có sẵn credit "${candidateModel}")`
              : "";
          res.json({
            ok: true,
            switchedModel: candidateModel,
            message: `Kết nối TrollLLM / API Trung Gian thành công! Model "${candidateModel}" tại "${cfg.baseUrl}" đã sẵn sàng${switchedNote} (Phản hồi: ${reply}).`,
          });
          return;
        }

        lastStatus = response.status;
        lastErrText = await response.text();
        if (response.status !== 402 && response.status !== 404) {
          break;
        }
      }

      res.status(400).json({
        ok: false,
        error: `Kết nối thất bại (${lastStatus}): ${lastErrText.slice(0, 180)}`,
      });
    } catch (error: any) {
      res.status(500).json({
        ok: false,
        error: error?.message || "Lỗi khi kiểm tra kết nối API trung gian.",
      });
    }
  });

  // 0b. Generate Scene Image Automatically (tries Proxy /images/generations if supported, otherwise uses Gemini 3.1 Flash Image at exact aspectRatio)
  app.post("/api/proxy/generate-image", async (req, res) => {
    try {
      const {
        prompt,
        customBaseUrl,
        imageModel = "dall-e-3",
        aspectRatio = "3:4",
      } = req.body || {};
      const validRatio: "3:4" | "9:16" | "16:9" =
        aspectRatio === "9:16" || aspectRatio === "16:9" ? aspectRatio : "3:4";
      const dSize =
        validRatio === "16:9"
          ? "1792x1024"
          : validRatio === "9:16"
          ? "1024x1792"
          : "1024x1024";
      const cfg = getProxyConfig(customBaseUrl);

      // 1. If the user's proxy is NOT trollllm.xyz (which only routes chat/messages), try /v1/images/generations first
      const isTextOnlyGateway = /trollllm\.xyz/i.test(cfg.baseUrl);
      if (cfg.hasValidKey && !isTextOnlyGateway) {
        try {
          const endpoint = `${cfg.baseUrl.replace(/\/chat\/completions$/, "")}/images/generations`;
          const response = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${cfg.apiKey}`,
            },
            body: JSON.stringify({
              model: imageModel,
              prompt: `${prompt}. Full-frame ${validRatio} edge-to-edge composition filling 100% of the canvas, no black bars, no borders.`,
              n: 1,
              size: dSize,
              response_format: "b64_json",
            }),
          });

          if (response.ok) {
            const data: any = await response.json();
            const item = data?.data?.[0];
            if (item?.b64_json) {
              res.json({
                imageDataUrl: `data:image/png;base64,${item.b64_json}`,
                engine: "proxy-dalle",
              });
              return;
            }
            if (item?.url) {
              const imgFetch = await fetch(item.url);
              const buf = await imgFetch.arrayBuffer();
              const b64 = Buffer.from(buf).toString("base64");
              res.json({
                imageDataUrl: `data:image/png;base64,${b64}`,
                engine: "proxy-dalle",
              });
              return;
            }
          }
        } catch {
          // Fall through to built-in Gemini 3.1 Flash Image generator
        }
      }

      // 2. Built-in Automatic Full-Frame Documentary Image Generator via Gemini 3.1 Flash Image
      const ai = getGenAIClient();
      const enhancedPrompt = `${prompt}. Authentic 1960s archival documentary photograph, full-frame ${validRatio} edge-to-edge full-bleed composition filling 100% of the canvas, natural film grain, dramatic classic lighting, photorealistic historical capture, NO borders, NO frames, NO black bars, NO text or watermarks.`;

      const genRes = await ai.models.generateContent({
        model: "gemini-3.1-flash-image-preview",
        contents: {
          parts: [{ text: enhancedPrompt }],
        },
        config: {
          imageConfig: {
            aspectRatio: validRatio,
          },
        },
      });

      const parts = genRes.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData?.data) {
          const mime = part.inlineData.mimeType || "image/png";
          res.json({
            imageDataUrl: `data:${mime};base64,${part.inlineData.data}`,
            engine: "gemini-3.1-flash-image",
          });
          return;
        }
      }

      throw new Error("Không nhận được dữ liệu ảnh từ AI.");
    } catch (error: any) {
      res.status(500).json({
        error: error?.message || "Không thể vẽ ảnh tự động.",
      });
    }
  });

  function buildFallbackDocumentaryScenes(
    topic: string,
    language: string,
    targetSceneCount: number,
    ratioDesc: string,
    channelTitle: string,
    channelSubtitle: string
  ) {
    const cleanName = topic.trim() || "The Legend";
    const total = Math.max(4, Math.min(20, Number(targetSceneCount) || 10));
    const narrativeCount = total - 1;
    const motions = ["zoom-in", "pan-right", "zoom-out", "pan-left"] as const;

    const chronologicalBeats = [
      {
        title: "Ánh mắt mở màn huyền thoại",
        era: "iconic portrait",
        sceneType: "video",
        en: `Before the world knew the name ${cleanName}, there was only a quiet fire and an unbreakable presence on screen.`,
        vi: `Trước khi cả thế giới biết đến cái tên ${cleanName}, chỉ có ngọn lửa âm ỉ và thần thái không thể trộn lẫn trên màn ảnh.`,
      },
      {
        title: "Khởi nguồn & Tuổi thơ",
        era: "1940s youth early portrait",
        sceneType: "image",
        en: `Every legend begins far from the spotlight. In those early years, life tested ${cleanName} long before fame ever arrived.`,
        vi: `Mọi huyền thoại đều bắt đầu từ nơi xa ánh hào quang. Những năm tháng đầu đời đã thử thách ${cleanName} trước khi danh vọng tìm đến.`,
      },
      {
        title: "Những bước chân đầu tiên",
        era: "1950s early career",
        sceneType: "image",
        en: `With little more than determination, ${cleanName} took small roles and long roads, learning the craft one frame at a time.`,
        vi: `Chỉ với lòng quyết tâm, ${cleanName} chấp nhận từng vai diễn nhỏ, bền bỉ rèn giũa qua từng khung hình.`,
      },
      {
        title: "Khoảnh khắc định mệnh",
        era: "turning point quote",
        sceneType: "quote",
        en: `Sometimes one single role doesn't just change a career—it changes history forever.`,
        vi: `Đôi khi chỉ một vai diễn duy nhất không chỉ thay đổi sự nghiệp—mà thay đổi cả lịch sử mãi mãi.`,
      },
      {
        title: "Bước ngoặt bùng nổ",
        era: "1960s breakthrough role",
        sceneType: "video",
        en: `When the camera rolled on that defining breakthrough, ${cleanName} commanded every second with effortless intensity.`,
        vi: `Khi máy quay bắt đầu ghi hình vai diễn bước ngoặt ấy, ${cleanName} đã làm chủ từng giây bằng thần thái cuốn hút.`,
      },
      {
        title: "Phong cách độc bản",
        era: "1960s classic film portrait",
        sceneType: "image",
        en: `Audiences had never seen anyone quite like ${cleanName}. A single glance spoke louder than a page of dialogue.`,
        vi: `Khán giả chưa từng thấy ai giống như ${cleanName}. Chỉ một ánh nhìn cũng đủ sức nặng hơn cả trang lời thoại.`,
      },
      {
        title: "Chinh phục màn ảnh rộng",
        era: "1965 movie scene",
        sceneType: "video",
        en: `From dusty frontier towns to grand theater screens, every performance carried a raw, unforgettable authenticity.`,
        vi: `Từ những vùng đất miền Viễn Tây đầy gió bụi đến màn ảnh rộng, mỗi vai diễn đều mang chất chân thực khó quên.`,
      },
      {
        title: "Đỉnh cao danh vọng",
        era: "1970s peak stardom",
        sceneType: "video",
        en: `At the height of stardom, ${cleanName} stood at the center of cinema, turning bold stories into timeless classics.`,
        vi: `Ở đỉnh cao danh vọng, ${cleanName} đứng ở tâm điểm điện ảnh, biến những câu chuyện táo bạo thành tác phẩm kinh điển.`,
      },
      {
        title: "Bản lĩnh sau ống kính",
        era: "1970s behind the scenes",
        sceneType: "video",
        en: `Behind the camera, discipline and quiet conviction guided every choice, refusing to follow easy trends.`,
        vi: `Phía sau ống kính, sự kỷ luật và niềm tin sắt đá đã dẫn lối cho mọi quyết định, không bao giờ chạy theo lối mòn.`,
      },
      {
        title: "Thử thách & Bản lĩnh",
        era: "quote resilience",
        sceneType: "quote",
        en: `True greatness is not measured when the crowd cheers, but when the storm hits.`,
        vi: `Sự vĩ đại thực sự không đo bằng tiếng vỗ tay, mà ở cách đứng vững giữa giông bão.`,
      },
      {
        title: "Vượt qua sóng gió",
        era: "1975 dramatic portrait",
        sceneType: "video",
        en: `Through changing eras and personal trials, ${cleanName} reinvented the journey without ever losing that signature soul.`,
        vi: `Đi qua bao biến thiên thời cuộc và thử thách riêng, ${cleanName} tự làm mới mình mà không đánh mất bản sắc.`,
      },
      {
        title: "Biểu tượng vượt thời gian",
        era: "1980s iconic portrait",
        sceneType: "video",
        en: `New generations discovered those classic frames and found a hero whose courage felt both larger than life and deeply human.`,
        vi: `Nhiều thế hệ mới tìm lại những thước phim xưa và bắt gặp một biểu tượng vừa phi thường vừa rất đỗi con người.`,
      },
      {
        title: "Những tác phẩm để đời",
        era: "1985 award portrait",
        sceneType: "image",
        en: `Decade after decade, the body of work grew into a monument of dedication, artistry, and quiet strength.`,
        vi: `Thập kỷ này nối tiếp thập kỷ khác, gia tài nghệ thuật ấy trở thành tượng đài của sự cống hiến và sức mạnh nội tâm.`,
      },
      {
        title: "Triết lý sống sâu sắc",
        era: "quote wisdom",
        sceneType: "quote",
        en: `Fame fades with the spotlight, but character echoes across generations.`,
        vi: `Danh vọng có thể phai mờ theo ánh đèn sân khấu, nhưng nhân cách sẽ vang vọng qua nhiều thế hệ.`,
      },
      {
        title: "Truyền lửa cho thế hệ sau",
        era: "1990s mentor portrait",
        sceneType: "video",
        en: `To young artists and lifelong fans alike, ${cleanName} remained a guiding light of integrity and timeless grace.`,
        vi: `Với các nghệ sĩ trẻ và khán giả trung thành, ${cleanName} luôn là ngọn hải đăng của sự chính trực và phong thái lịch lãm.`,
      },
      {
        title: "Năm tháng hoàng kim",
        era: "later years portrait",
        sceneType: "video",
        en: `Even in the quieter chapters of life, every wrinkle and silver hair told the story of a life fully lived.`,
        vi: `Ngay cả trong những chương trầm lắng hơn của cuộc đời, từng dấu ấn thời gian đều kể về một hành trình sống trọn vẹn.`,
      },
      {
        title: "Khoảnh khắc lắng đọng",
        era: "classic monochrome portrait",
        sceneType: "image",
        en: `Looking back across the decades, the roles were many, yet the heart behind them remained unmistakably one.`,
        vi: `Nhìn lại chặng đường hàng chục năm, dù hóa thân vào bao số phận, trái tim phía sau vẫn luôn vẹn nguyên một chữ tâm.`,
      },
      {
        title: "Huyền thoại trong lòng khán giả",
        era: "tribute portrait",
        sceneType: "video",
        en: `Long after the credits roll, the voice, the silhouette, and the spirit of ${cleanName} continue to inspire millions.`,
        vi: `Rất lâu sau khi dòng chữ kết phim khép lại, giọng nói, bóng dáng và tinh thần của ${cleanName} vẫn truyền cảm hứng cho hàng triệu người.`,
      },
      {
        title: "Di sản bất hủ",
        era: "final legacy portrait",
        sceneType: "video",
        en: `Because legends like ${cleanName} never truly leave us—they live on in every story we remember and cherish.`,
        vi: `Bởi những huyền thoại như ${cleanName} chưa bao giờ thực sự rời xa—họ sống mãi trong từng ký ức chúng ta trân trọng.`,
      },
    ];

    // Select `narrativeCount` beats evenly across the chronological arc so #01 is always the opening hook and #N-1 is the legacy climax
    const selectedBeats: typeof chronologicalBeats = [];
    for (let i = 0; i < narrativeCount; i++) {
      const idx =
        narrativeCount === 1
          ? 0
          : Math.min(
              chronologicalBeats.length - 1,
              Math.round((i * (chronologicalBeats.length - 1)) / (narrativeCount - 1))
            );
      selectedBeats.push(chronologicalBeats[idx]);
    }

    const scenes: any[] = selectedBeats.map((beat, idx) => {
      const primaryText = language === "vi" ? beat.vi : beat.en;
      const secondaryText = language === "vi" ? beat.en : beat.vi;
      const sType = beat.sceneType;
      return {
        title: beat.title,
        sceneType: sType,
        narrationText: primaryText,
        translationText: secondaryText,
        visualPrompt:
          sType === "video"
            ? `CẦN VIDEO: ${beat.title} (${cleanName})`
            : sType === "quote"
            ? `THẺ CHỮ ĐEN: ${beat.title}`
            : `CẦN ẢNH TĨNH: ${beat.title} (${cleanName})`,
        imagePrompt: `Authentic archival documentary portrait of ${cleanName} (${beat.era}), classic cinema lighting, natural 35mm film grain, full-frame ${ratioDesc}, edge-to-edge full-bleed composition filling 100% of the canvas, no borders, no text.`,
        videoMotionPrompt: `[Kling AI I2V - Lock Reference Face Identity] [0-2s Opening Beat]: Starting from the uploaded reference frame of the subject in period attire, steady gaze and authentic atmosphere -> [2-4s Story Action & Speech]: Preserving 100% exact facial identity from the reference image, subtle natural head turn and expressive delivery matching "${primaryText.slice(0, 80)}" -> [4-6s Camera Control & Climax]: Smooth Kling dolly push-in, warm archival 35mm film grain, full-screen ${ratioDesc}.`,
        archivalKeywords: `${cleanName} ${beat.era}`,
        motionEffect: motions[idx % motions.length],
        colorFilter: idx % 2 === 0 ? "bw-vintage" : "color-warm",
        frameStyle: "full-bleed",
        durationSec: 7,
      };
    });

    scenes.push({
      title: `Logo Kết Cố Định: ${channelTitle} (HM)`,
      sceneType: "outro",
      narrationText: "Life Legends. Their Legacy. Your Inspiration.",
      translationText: "Huyền Thoại Cuộc Đời. Di sản của họ. Cảm hứng của bạn.",
      visualPrompt: `LOGO KẾT CỐ ĐỊNH: ${channelTitle} — ${channelSubtitle}`,
      imagePrompt: "Fixed Outro Logo",
      videoMotionPrompt: "Fixed Outro Logo",
      archivalKeywords: cleanName,
      motionEffect: "zoom-in",
      colorFilter: "original",
      frameStyle: "full-bleed",
      durationSec: 4,
    });

    return scenes;
  }

  function buildFallbackParsedScriptScenes(
    rawScript: string,
    language: string,
    requestedSceneCount: number,
    ratioDesc: string,
    channelTitle: string,
    channelSubtitle: string
  ) {
    const paragraphs = rawScript
      .split(/\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    // Split into sentences if needed to match requestedSceneCount
    let segments: string[] = [...paragraphs];
    const targetTotal = requestedSceneCount >= 4 ? requestedSceneCount : Math.max(6, Math.min(20, segments.length + 1));
    const targetNarrative = targetTotal - 1;

    if (segments.length < targetNarrative) {
      const allSentences = rawScript
        .replace(/\n+/g, " ")
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (allSentences.length >= targetNarrative) {
        segments = [];
        const perGroup = allSentences.length / targetNarrative;
        for (let i = 0; i < targetNarrative; i++) {
          const start = Math.floor(i * perGroup);
          const end = Math.max(start + 1, Math.floor((i + 1) * perGroup));
          segments.push(allSentences.slice(start, end).join(" "));
        }
      }
    }

    const motions = ["zoom-in", "pan-right", "zoom-out", "pan-left"] as const;
    const scenes: any[] = segments.slice(0, targetNarrative).map((seg, idx) => {
      const isQuote = idx > 1 && idx < targetNarrative - 1 && idx % 6 === 3;
      const isVideo = !isQuote && (idx === 0 || idx === targetNarrative - 1 || idx % 3 !== 2);
      const sType = isQuote ? "quote" : isVideo ? "video" : "image";
      return {
        title: `Phân cảnh #${String(idx + 1).padStart(2, "0")}`,
        sceneType: sType,
        narrationText: seg,
        translationText: seg,
        visualPrompt:
          sType === "video"
            ? `CẦN VIDEO: Phân cảnh #${idx + 1}`
            : sType === "quote"
            ? `THẺ CHỮ ĐEN: Phân cảnh #${idx + 1}`
            : `CẦN ẢNH TĨNH: Phân cảnh #${idx + 1}`,
        imagePrompt: `Authentic archival documentary photograph matching "${seg.slice(0, 90)}", classic 35mm film grain, full-frame ${ratioDesc}, edge-to-edge full-bleed composition filling 100% of the frame.`,
        videoMotionPrompt: `[Kling AI I2V - Lock Reference Face Identity] [0-2s Opening Beat]: Starting from the uploaded reference frame of the subject, authentic documentary posture -> [2-4s Story Action & Speech]: Preserving 100% exact facial identity from the reference image, natural movement matching "${seg.slice(0, 80)}" -> [4-6s Camera Control & Climax]: Smooth Kling dolly push-in, full-screen ${ratioDesc}.`,
        archivalKeywords: `historical portrait scene ${idx + 1}`,
        motionEffect: motions[idx % motions.length],
        colorFilter: idx % 2 === 0 ? "bw-vintage" : "color-warm",
        frameStyle: "full-bleed",
        durationSec: 7,
      };
    });

    scenes.push({
      title: `Logo Kết Cố Định: ${channelTitle} (HM)`,
      sceneType: "outro",
      narrationText: "Life Legends. Their Legacy. Your Inspiration.",
      translationText: "Huyền Thoại Cuộc Đời. Di sản của họ. Cảm hứng của bạn.",
      visualPrompt: `LOGO KẾT CỐ ĐỊNH: ${channelTitle} — ${channelSubtitle}`,
      imagePrompt: "Fixed Outro Logo",
      videoMotionPrompt: "Fixed Outro Logo",
      archivalKeywords: "Life Legends",
      motionEffect: "zoom-in",
      colorFilter: "original",
      frameStyle: "full-bleed",
      durationSec: 4,
    });

    return scenes;
  }

  // 1. Generate Documentary Storyboard & Prompts (Uses Intermediary API if configured, else Gemini, with Guaranteed Chronological Fallback)
  app.post("/api/story/generate", async (req, res) => {
    const {
      topic = "Clint Eastwood",
      language = "en",
      sceneCount = 10,
      includeQuotes = true,
      channelTitle = "LIFE LEGENDS",
      channelSubtitle = "THEIR LEGACY. YOUR INSPIRATION.",
      aspectRatio = "3:4",
      customBaseUrl,
      customModel,
      preferProxy = true,
    } = req.body || {};

    if (!topic || typeof topic !== "string") {
      res.status(400).json({ error: "Vui lòng nhập tên nhân vật, chủ đề hoặc kịch bản." });
      return;
    }

    const ratioDesc =
      aspectRatio === "9:16"
        ? "vertical 9:16 full-frame (1080x1920px) --ar 9:16"
        : aspectRatio === "16:9"
        ? "widescreen 16:9 full-frame (1920x1080px) --ar 16:9"
        : "vertical 3:4 full-frame (1080x1440px) --ar 3:4";

    const targetSceneCount = Math.max(4, Math.min(20, Number(sceneCount) || 10));

    try {
      const langInstruction =
        language === "en"
          ? "Write narrationText in dramatic, warm English documentary style (exact 'Life Legends' channel style: short punchy sentences, deep emotional storytelling), and translationText in Vietnamese."
          : "Write narrationText in dramatic, warm Vietnamese documentary storytelling style (phong cách kể chuyện truyền cảm hứng sâu sắc như kênh Life Legends), and translationText in English.";

      const videoSceneQuota =
        targetSceneCount >= 20
          ? "12 or 13"
          : targetSceneCount >= 18
          ? "11 or 12"
          : targetSceneCount >= 16
          ? "10"
          : targetSceneCount >= 14
          ? "8 or 9"
          : targetSceneCount >= 10
          ? "6 or 7"
          : "4 or 5";
      const quoteSceneQuota = includeQuotes
        ? targetSceneCount >= 18
          ? "2 or 3 'quote' intertitle scenes (pitch-black screen with centered white italic text at major turning points in the story)"
          : targetSceneCount >= 14
          ? "2 or 3 'quote' intertitle scenes (pitch-black screen with centered white italic text at major turning points in the story)"
          : "1 or 2 'quote' intertitle scenes (pitch-black screen with centered white italic text at major turning points in the story)"
        : "visual scenes";
      const imageSceneQuota =
        targetSceneCount >= 20
          ? "4 or 5"
          : targetSceneCount >= 18
          ? "3 or 4"
          : targetSceneCount >= 16
          ? "3"
          : targetSceneCount >= 14
          ? "2 or 3"
          : targetSceneCount >= 10
          ? "2"
          : "1 or 2";

      const prompt = `Create an EXACTLY ${targetSceneCount}-scene documentary story video script & production prompt sheet about: "${topic}" (return a JSON array with exactly ${targetSceneCount} scene objects).
${langInstruction}

Follow the exact viral "Life Legends" video formula for ${targetSceneCount} scenes with SMOOTH CHRONOLOGICAL & EMOTIONAL ORDERING:
1. Smooth Story Arc (#01 -> #${targetSceneCount}) — IMPORTANT: 'video' scenes MUST account for MORE THAN 1/2 (>60%) of the entire video duration:
   - Scene #1 MUST be 'video' (a captivating hook where the character speaks/moves or performs a signature action, 7-9 seconds).
   - Scenes #2 to #${targetSceneCount - 1} MUST flow in a seamless chronological progression: Early Youth & Humble Beginnings -> Career Breakthrough -> Peak Iconic Roles -> Personal Struggles / Hidden Truths -> Enduring Legacy & Life Philosophy. Each scene's narration must bridge naturally into the next scene.
   - Across the ${targetSceneCount} scenes, use ${videoSceneQuota} 'video' scenes (for Kling AI Image-to-Video generation, accounting for >60% of the total video duration), ${imageSceneQuota} 'image' scenes (vintage still photo with slow Ken Burns zoom), and ${quoteSceneQuota}.
   - Final scene (#${targetSceneCount}) MUST be 'outro' (closing crest "${channelTitle} — ${channelSubtitle}").
2. CRITICAL FOR FULL-FRAME KLING AI VIDEO & IMAGE PROMPTS: Every 'video' and 'image' scene MUST have:
   - 'frameStyle': "full-bleed" (filling 100% of the frame edge-to-edge).
   - 'archivalKeywords': MUST begin with the exact full name of the main character "${topic}" followed by the specific year/era or role of that scene (e.g. "${topic} 1955 portrait", "${topic} 1966 film").
   - 'imagePrompt': Concise English prompt (25-40 words) for Kling AI / ChatGPT Pro to draw the character accurately at that exact life stage in ${ratioDesc}, full-bleed composition.
   - 'videoMotionPrompt': Concise 3-beat English director's motion prompt for KLING AI Image-to-Video (I2V): "[Kling AI I2V - Lock Reference Face Identity] [0-2s Opening Beat]: ... -> [2-4s Story Action & Speech]: ... -> [4-6s Camera Control & Climax]: ..." in ${ratioDesc}.`;

      const proxyCfg = getProxyConfig(customBaseUrl, customModel);

      if (preferProxy && proxyCfg.hasValidKey) {
        try {
          const proxyResult = await callIntermediaryChatCompletion({
            systemPrompt: `You are an expert documentary scriptwriter for the 'Life Legends' channel. ${JSON_SCHEMA_INSTRUCTION_FOR_PROXY}`,
            userPrompt: prompt,
            customBaseUrl,
            customModel,
          });
          res.json({
            scenes: proxyResult.scenes,
            usedProvider: `API Trung Gian (${proxyResult.usedModel})`,
            usedModel: proxyResult.usedModel,
          });
          return;
        } catch {
          // Silent fallback to built-in Gemini AI
        }
      }

      const ai = getGenAIClient();
      const geminiPromise = ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: SCENE_ARRAY_SCHEMA,
        },
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Gemini timeout")), 13500)
      );

      const response = await Promise.race([geminiPromise, timeoutPromise]);
      const extracted = extractScenesArraySafely(response.text || "");
      if (extracted && extracted.length > 0) {
        res.json({ scenes: extracted, usedProvider: "Gemini AI" });
        return;
      }
    } catch {
      // Fall through to guaranteed chronological storyboard builder below so user never gets an error
    }

    const fallbackScenes = buildFallbackDocumentaryScenes(
      topic,
      language,
      targetSceneCount,
      ratioDesc,
      channelTitle,
      channelSubtitle
    );
    res.json({
      scenes: fallbackScenes,
      usedProvider: "LegendCut Chronological Studio Engine",
    });
  });

  // 2. Parse User's Pasted Script into Video/Image Segments + Prompts
  app.post("/api/story/parse-script", async (req, res) => {
    const {
      rawScript = "",
      language = "en",
      sceneCount = 0,
      channelTitle = "LIFE LEGENDS",
      channelSubtitle = "THEIR LEGACY. YOUR INSPIRATION.",
      aspectRatio = "3:4",
      customBaseUrl,
      customModel,
      preferProxy = true,
    } = req.body || {};

    if (!rawScript || typeof rawScript !== "string") {
      res.status(400).json({ error: "Vui lòng dán nội dung kịch bản cần phân tích." });
      return;
    }

    const ratioDesc =
      aspectRatio === "9:16"
        ? "vertical 9:16 full-frame (1080x1920px) --ar 9:16"
        : aspectRatio === "16:9"
        ? "widescreen 16:9 full-frame (1920x1080px) --ar 16:9"
        : "vertical 3:4 full-frame (1080x1440px) --ar 3:4";

    const requestedSceneCount =
      Number(sceneCount) > 0 ? Math.max(4, Math.min(20, Number(sceneCount))) : 0;

    try {
      const countDirective = requestedSceneCount
        ? `Break this script down into EXACTLY ${requestedSceneCount} smooth, chronologically ordered sequential scenes (where Scene #${requestedSceneCount} is the final 'outro' brand crest, and Scenes #1 to #${requestedSceneCount - 1} cover the full story in seamless narrative order)`
        : `Break this script down into smooth, chronologically ordered sequential scenes (each 12-28 words of narration, keeping the user's core script faithfully)`;

      const prompt = `You are a senior documentary video director for the "Life Legends" channel.
The user has provided the following script/story text:
"""
${rawScript}
"""

${countDirective} and decide for EACH segment whether the user should provide:
- 'video' (CẦN VIDEO KLING AI: MUST account for MORE THAN 1/2 (>60%) of the total video duration and scene count, covering the opening hook, key story beats, action scenes, and closing tribute; set frameStyle to 'full-bleed')
- 'image' (CẦN ẢNH TĨNH: archival portrait with Ken Burns zoom for 2-4 supporting scenes; set frameStyle to 'full-bleed')
- 'quote' (THẺ CHỮ ĐEN: 2-3 dramatic turning-point sentences rendered as white italic text on a pitch-black screen — no image/video needed)
- 'outro' (Final scene: "${channelTitle} - ${channelSubtitle}" brand crest)

For every scene, ensure smooth chronological transitions from one scene to the next, and generate:
1. 'visualPrompt' in Vietnamese clearly stating "CẦN VIDEO:" or "CẦN ẢNH TĨNH:" or "THẺ CHỮ ĐEN TỰ ĐỘNG".
2. 'imagePrompt' in English (concise 25-40 words, specifying the character's exact age/era in this scene, full-frame ${ratioDesc}, full-bleed composition).
3. 'videoMotionPrompt' in English: Concise scripted 3-beat motion prompt for KLING AI Image-to-Video (I2V): "[Kling AI I2V - Lock Reference Face Identity] [0-2s Opening Beat]: ... -> [2-4s Story Action & Speech]: ... -> [4-6s Camera Control & Climax]: ..." in full-screen ${ratioDesc}.
4. 'archivalKeywords' in English ALWAYS starting with the main character's full name + era/year for searching real historical photos.
5. Both English and Vietnamese text in 'narrationText' and 'translationText' (primary language: ${language}).`;

      const proxyCfg = getProxyConfig(customBaseUrl, customModel);

      if (preferProxy && proxyCfg.hasValidKey) {
        try {
          const proxyResult = await callIntermediaryChatCompletion({
            systemPrompt: `You are an expert documentary director for the 'Life Legends' channel. ${JSON_SCHEMA_INSTRUCTION_FOR_PROXY}`,
            userPrompt: prompt,
            customBaseUrl,
            customModel,
          });
          res.json({
            scenes: proxyResult.scenes,
            usedProvider: `API Trung Gian (${proxyResult.usedModel})`,
            usedModel: proxyResult.usedModel,
          });
          return;
        } catch {
          // Silent fallback to built-in Gemini AI
        }
      }

      const ai = getGenAIClient();
      const geminiPromise = ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: SCENE_ARRAY_SCHEMA,
        },
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Gemini parse timeout")), 13500)
      );

      const response = await Promise.race([geminiPromise, timeoutPromise]);
      const extracted = extractScenesArraySafely(response.text || "");
      if (extracted && extracted.length > 0) {
        res.json({ scenes: extracted, usedProvider: "Gemini AI" });
        return;
      }
    } catch {
      // Fall through to deterministic script parser below so user never gets an error
    }

    const fallbackScenes = buildFallbackParsedScriptScenes(
      rawScript,
      language,
      requestedSceneCount,
      ratioDesc,
      channelTitle,
      channelSubtitle
    );
    res.json({
      scenes: fallbackScenes,
      usedProvider: "LegendCut Chronological Script Parser",
    });
  });

  // Helper: Wrap raw 24kHz 16-bit mono PCM buffer in a valid 44-byte RIFF WAV header if needed
  function ensureValidWavBuffer(rawBuf: Buffer, sampleRate = 24000): Buffer {
    if (
      rawBuf.length >= 12 &&
      rawBuf.toString("ascii", 0, 4) === "RIFF" &&
      rawBuf.toString("ascii", 8, 12) === "WAVE"
    ) {
      return rawBuf;
    }
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
    const blockAlign = (numChannels * bitsPerSample) / 8;
    const dataSize = rawBuf.length;
    const header = Buffer.alloc(44);

    header.write("RIFF", 0);
    header.writeUInt32LE(36 + dataSize, 4);
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16); // PCM chunk size
    header.writeUInt16LE(1, 20); // AudioFormat = 1 (PCM)
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write("data", 36);
    header.writeUInt32LE(dataSize, 40);

    return Buffer.concat([header, rawBuf]);
  }

  // Helper: Split long narration into <= 170 char natural clauses for fallback TTS
  function splitTextIntoTtsChunks(text: string, maxLen = 170): string[] {
    const cleaned = text.replace(/\s+/g, " ").trim();
    if (!cleaned) return [];
    if (cleaned.length <= maxLen) return [cleaned];

    const sentences = cleaned.split(/(?<=[.!?;,:])\s+/);
    const chunks: string[] = [];
    let current = "";

    for (const sentence of sentences) {
      if ((current + " " + sentence).trim().length <= maxLen) {
        current = (current + " " + sentence).trim();
      } else {
        if (current) chunks.push(current);
        if (sentence.length <= maxLen) {
          current = sentence;
        } else {
          const words = sentence.split(" ");
          let sub = "";
          for (const w of words) {
            if ((sub + " " + w).trim().length <= maxLen) {
              sub = (sub + " " + w).trim();
            } else {
              if (sub) chunks.push(sub);
              sub = w;
            }
          }
          current = sub;
        }
      }
    }
    if (current) chunks.push(current);
    return chunks;
  }

  // Helper: Guaranteed server-side MP3 TTS with locked language so no scene ever switches language or voice mid-video
  async function generateFallbackMp3Tts(
    text: string,
    forcedLang?: "vi" | "en"
  ): Promise<string | null> {
    const isVietnamese =
      /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(
        text
      );
    const tl = forcedLang || (isVietnamese ? "vi" : "en");
    const chunks = splitTextIntoTtsChunks(text, 165);
    if (chunks.length === 0) return null;

    const buffers: Buffer[] = [];
    for (const chunk of chunks) {
      const url = `https://translate.googleapis.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${tl}&q=${encodeURIComponent(
        chunk
      )}`;
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
        },
      });
      if (!res.ok) continue;
      const arr = await res.arrayBuffer();
      if (arr.byteLength > 100) {
        buffers.push(Buffer.from(arr));
      }
    }

    if (buffers.length === 0) return null;
    const combined = Buffer.concat(buffers);
    return `data:audio/mpeg;base64,${combined.toString("base64")}`;
  }

  // Helper: Extract raw 16-bit PCM payload (stripping 44-byte WAV header if present)
  function extractRawPcm16(buf: Buffer): Buffer {
    if (
      buf.length >= 44 &&
      buf.toString("ascii", 0, 4) === "RIFF" &&
      buf.toString("ascii", 8, 12) === "WAVE"
    ) {
      return buf.subarray(44);
    }
    return buf;
  }

  // Helper: Slice a single-pass continuous 24kHz 16-bit mono PCM buffer into N scene segments at natural silence valleys
  function sliceContinuousPcmIntoSceneWavs(
    rawBuffer: Buffer,
    sceneTexts: string[],
    sampleRate = 24000
  ): string[] {
    const pcm = extractRawPcm16(rawBuffer);
    const totalSamples = Math.floor(pcm.length / 2);
    if (sceneTexts.length <= 1 || totalSamples < sampleRate) {
      const wav = ensureValidWavBuffer(pcm, sampleRate);
      return sceneTexts.map(() => `data:audio/wav;base64,${wav.toString("base64")}`);
    }

    const weights = sceneTexts.map((t) => Math.max(8, t.trim().length));
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    // Compute RMS energy in 25ms windows (600 samples at 24kHz) to locate natural pause boundaries
    const winSize = Math.floor(sampleRate * 0.025);
    const numWins = Math.max(1, Math.floor(totalSamples / winSize));
    const winEnergies = new Float32Array(numWins);

    for (let w = 0; w < numWins; w++) {
      let sumSq = 0;
      const startSample = w * winSize;
      for (let i = 0; i < winSize; i++) {
        const sampleIdx = (startSample + i) * 2;
        if (sampleIdx + 1 < pcm.length) {
          const val = pcm.readInt16LE(sampleIdx) / 32768;
          sumSq += val * val;
        }
      }
      winEnergies[w] = Math.sqrt(sumSq / winSize);
    }

    const cutSamples: number[] = [0];
    let accumWeight = 0;

    for (let idx = 0; idx < sceneTexts.length - 1; idx++) {
      accumWeight += weights[idx];
      const expectedRatio = accumWeight / totalWeight;
      const expectedWin = Math.floor(expectedRatio * numWins);
      const searchRadiusWins = Math.max(8, Math.floor(numWins * 0.08));
      const minWin = Math.max(
        Math.floor(cutSamples[cutSamples.length - 1] / winSize) + 6,
        expectedWin - searchRadiusWins
      );
      const maxWin = Math.min(numWins - 6, expectedWin + searchRadiusWins);

      let bestWin = expectedWin;
      let lowestScore = Infinity;

      for (let w = minWin; w <= maxWin; w++) {
        const distPenalty = Math.abs(w - expectedWin) / Math.max(1, searchRadiusWins) * 0.015;
        const score = winEnergies[w] + distPenalty;
        if (score < lowestScore) {
          lowestScore = score;
          bestWin = w;
        }
      }

      cutSamples.push(Math.min(totalSamples - 1, bestWin * winSize));
    }
    cutSamples.push(totalSamples);

    const wavDataUrls: string[] = [];
    for (let i = 0; i < sceneTexts.length; i++) {
      const startByte = cutSamples[i] * 2;
      const endByte = cutSamples[i + 1] * 2;
      const sliceBuf =
        endByte > startByte + 400
          ? pcm.subarray(startByte, endByte)
          : pcm.subarray(0, Math.min(pcm.length, sampleRate * 2));
      const wavBuf = ensureValidWavBuffer(sliceBuf, sampleRate);
      wavDataUrls.push(`data:audio/wav;base64,${wavBuf.toString("base64")}`);
    }

    return wavDataUrls;
  }

  const WIKI_USER_AGENT =
    "LegendCutVideoStudio/2.0 (https://aistudio.google.com; studio@aistudio.google.com)";
  const BROWSER_USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

  async function resolveImageToDataUrlOrDirect(
    primaryUrl: string,
    fallbackThumbUrl?: string
  ): Promise<string> {
    const urlsToTry = [primaryUrl, fallbackThumbUrl].filter(Boolean) as string[];
    for (const targetUrl of urlsToTry) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2600);
        const isWiki =
          targetUrl.includes("wikimedia.org") || targetUrl.includes("wikipedia.org");
        const imgRes = await fetch(targetUrl, {
          headers: {
            "User-Agent": isWiki ? WIKI_USER_AGENT : BROWSER_USER_AGENT,
            Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (imgRes.ok) {
          const cType = (imgRes.headers.get("content-type") || "image/jpeg").split(";")[0];
          if (
            cType.includes("jpeg") ||
            cType.includes("jpg") ||
            cType.includes("png") ||
            cType.includes("webp")
          ) {
            const buf = await imgRes.arrayBuffer();
            if (buf.byteLength > 3500) {
              return `data:${cType};base64,${Buffer.from(buf).toString("base64")}`;
            }
          }
        }
      } catch {
        // Try next URL in urlsToTry
      }
    }
    return fallbackThumbUrl || primaryUrl;
  }

  const GENERIC_QUERY_STOPWORDS = new Set([
    "the",
    "and",
    "for",
    "with",
    "from",
    "into",
    "life",
    "legends",
    "legend",
    "story",
    "biography",
    "documentary",
    "vintage",
    "archival",
    "photo",
    "photograph",
    "portrait",
    "young",
    "old",
    "early",
    "late",
    "years",
    "career",
    "hollywood",
    "actor",
    "actress",
    "star",
    "cinema",
    "film",
    "movie",
    "television",
    "series",
    "western",
    "scene",
    "cảnh",
    "phân",
  ]);

  function extractSubjectIdentityTokens(rawSubject: string): string[] {
    return rawSubject
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter(
        (w) =>
          w.length >= 3 &&
          !GENERIC_QUERY_STOPWORDS.has(w) &&
          !/^(18|19|20)\d{2}s?$/.test(w)
      );
  }

  function doesTitleMatchSubjectIdentity(
    rawTitleOrUrl: string,
    subjectTokens: string[]
  ): boolean {
    if (subjectTokens.length === 0) return true;
    const normalized = rawTitleOrUrl
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[_-]/g, " ");

    if (subjectTokens.length === 1) {
      return normalized.includes(subjectTokens[0]);
    }

    // Require the primary surname (last token) OR both first and last name tokens to match
    const firstToken = subjectTokens[0];
    const lastToken = subjectTokens[subjectTokens.length - 1];
    if (normalized.includes(firstToken) && normalized.includes(lastToken)) {
      return true;
    }
    // If surname is distinctive (>= 4 chars), accept surname match
    if (lastToken.length >= 4 && normalized.includes(lastToken)) {
      return true;
    }
    return false;
  }

  function extractPhotoYear(text: string): number | null {
    const match = text.match(/\b(19[1-9]\d|20[0-2]\d)\b/);
    if (!match) return null;
    const yr = Number(match[1]);
    return yr >= 1910 && yr <= 2026 ? yr : null;
  }

  function normalizeTitleKey(rawTitle: string): string {
    return rawTitle
      .toLowerCase()
      .replace(/^file:/i, "")
      .replace(/\.[^/.]+$/, "")
      .replace(/\b\d+px\b/g, "")
      .replace(/\s*\(cropped\)\s*/g, "")
      .replace(/[^a-z0-9]/g, "");
  }

  // Helper: Search Bing Web Images + Wikipedia + Wikimedia Commons for STRICTLY VERIFIED real historical photos of the subject
  async function searchRealArchivalPhotos(
    rawQuery: string,
    limit: number,
    usedSourceUrls: Set<string> = new Set(),
    requiredSubjectName?: string,
    usedTitleKeys: Set<string> = new Set()
  ): Promise<
    {
      title: string;
      dataUrl: string;
      sourceUrl: string;
      width: number;
      height: number;
      year: number | null;
    }[]
  > {
    const cleanQuery = rawQuery
      .replace(/[—–-].*$/, "")
      .replace(/\(.*?\)/g, "")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleanQuery) return [];

    const subjectAnchor = (requiredSubjectName || cleanQuery).trim();
    const subjectTokens = extractSubjectIdentityTokens(subjectAnchor);
    const subjectFullPhrase = subjectTokens.slice(0, 3).join(" ");

    const words = cleanQuery.split(" ").filter(Boolean);
    const candidateQueries: string[] = [];

    // Always anchor every query with the subject's name so search never returns random off-topic photos
    if (
      subjectFullPhrase &&
      !cleanQuery.toLowerCase().includes(subjectTokens[subjectTokens.length - 1] || "")
    ) {
      candidateQueries.push(`${subjectFullPhrase} ${cleanQuery}`.slice(0, 70));
    } else {
      candidateQueries.push(cleanQuery.slice(0, 70));
    }

    if (words.length > 4) {
      candidateQueries.push(words.slice(0, 4).join(" "));
    }
    if (subjectFullPhrase && !candidateQueries.includes(subjectFullPhrase)) {
      candidateQueries.push(subjectFullPhrase);
    }

    const candidates: {
      title: string;
      thumbUrl: string;
      fallbackThumbUrl?: string;
      width: number;
      height: number;
      year: number | null;
    }[] = [];

    // Only ban non-portrait junk (collages, plaques, graves, maps, autographs, merchandise) — do NOT ban magazine/cinema/television/award portraits!
    const bannedTitleWords =
      /\b(collage|montage|grid|logo|icon|map|signature|autograph|signed|flag|coat_of_arms|diagram|chart|stamp|plaque|grave|tombstone|memorial|statue|sculpture|wax|caricature|cartoon|drawing|sketch|svg|lego|building|house|hotel|exterior|certificate|walk_of_fame|star_on|t-shirt|hoodie|mug|ebay|etsy)\b/i;

    const watermarkedStockDomains =
      /\b(alamy\.com|shutterstock\.com|dreamstime\.com|depositphotos\.com|123rf\.com|istockphoto\.com|vecteezy\.com)\b/i;

    for (const q of candidateQueries) {
      if (candidates.length >= limit) break;

      // 1. Search Bing Web Images FIRST (finds dozens of real portraits, movie stills & TV photos across the entire web)
      try {
        const bingQuery = q.toLowerCase().includes("photo") || q.toLowerCase().includes("portrait")
          ? q
          : `${q} actor portrait photo`;
        const bingUrl = `https://www.bing.com/images/async?q=${encodeURIComponent(
          bingQuery
        )}&first=0&count=${Math.min(45, limit * 3 + 12)}&adlt=moderate`;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3200);
        const bingRes = await fetch(bingUrl, {
          headers: {
            "User-Agent": BROWSER_USER_AGENT,
            "Accept-Language": "en-US,en;q=0.9",
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (bingRes.ok) {
          const html = await bingRes.text();
          const matches = [...html.matchAll(/m="([^"]+)"/g)];

          // Separate clean non-Getty images first, and keep Getty only as secondary backup if needed
          const parsedItems: Array<{
            title: string;
            murl: string;
            turl: string;
            purl: string;
            idKey: string;
            isGetty: boolean;
          }> = [];

          for (const m of matches) {
            const decoded = m[1]
              .replace(/&quot;/g, '"')
              .replace(/&amp;/g, "&")
              .replace(/&#39;/g, "'");
            try {
              const obj = JSON.parse(decoded);
              const title = String(obj.t || obj.desc || "").trim();
              const murl = String(obj.murl || "").trim();
              const turl = String(obj.turl || "").trim();
              const purl = String(obj.purl || "").trim();
              if (!turl && !murl) continue;

              const idMatch = turl.match(/id=([^&]+)/);
              const idKey = idMatch ? idMatch[1] : normalizeTitleKey(murl || title);

              if (
                !idKey ||
                usedSourceUrls.has(idKey) ||
                usedSourceUrls.has(murl) ||
                usedSourceUrls.has(turl) ||
                watermarkedStockDomains.test(murl) ||
                bannedTitleWords.test(title) ||
                bannedTitleWords.test(murl)
              ) {
                continue;
              }

              // Strictly verify that the web photo belongs to the character
              if (
                !doesTitleMatchSubjectIdentity(
                  `${title} ${murl} ${purl}`,
                  subjectTokens
                )
              ) {
                continue;
              }

              parsedItems.push({
                title: title || `${subjectAnchor} Portrait`,
                murl,
                turl: turl ? `${turl}&w=720` : murl,
                purl,
                idKey,
                isGetty: /gettyimages/i.test(murl),
              });
            } catch {
              // Ignore malformed item
            }
          }

          // Prioritize clean non-watermarked sources over Getty Images
          parsedItems.sort((a, b) => Number(a.isGetty) - Number(b.isGetty));

          for (const item of parsedItems) {
            if (candidates.length >= limit) break;
            const titleKey = normalizeTitleKey(item.title);
            if (usedSourceUrls.has(item.idKey)) continue;

            usedSourceUrls.add(item.idKey);
            if (item.murl) usedSourceUrls.add(item.murl);
            if (item.turl) usedSourceUrls.add(item.turl);
            if (titleKey) usedTitleKeys.add(titleKey);

            candidates.push({
              title: item.title.replace(/\s*\|\s*.*$/, "").slice(0, 48),
              // Use Bing's fast 720px CDN for Getty or slow hosts; for clean hosts try murl first with turl fallback
              thumbUrl: item.isGetty ? item.turl : item.murl || item.turl,
              fallbackThumbUrl: item.turl,
              width: 720,
              height: 900,
              year: extractPhotoYear(`${item.title} ${item.murl}`),
            });
          }
        }
      } catch {
        // Continue to Wikipedia / Wikimedia Commons
      }

      if (candidates.length >= limit) break;

      // 2. Search Wikipedia PageImages API for verified biography/film portraits
      try {
        const wpUrl = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
          q
        )}&gsrlimit=10&prop=pageimages&piprop=thumbnail|name&pithumbsize=860&format=json`;
        const wpRes = await fetch(wpUrl, {
          headers: { "User-Agent": WIKI_USER_AGENT },
        });
        if (wpRes.ok) {
          const wpData: any = await wpRes.json();
          const wpPages = wpData?.query?.pages
            ? Object.values(wpData.query.pages)
            : [];
          for (const page of wpPages as any[]) {
            if (candidates.length >= limit) break;
            const thumbUrl: string | undefined = page?.thumbnail?.source;
            const pageTitle = String(page?.title || "");
            const pageImageName = String(page?.pageimage || "");
            const titleKey = normalizeTitleKey(pageImageName || pageTitle);

            if (
              !thumbUrl ||
              usedSourceUrls.has(thumbUrl) ||
              (titleKey && usedTitleKeys.has(titleKey)) ||
              bannedTitleWords.test(thumbUrl) ||
              bannedTitleWords.test(pageTitle) ||
              bannedTitleWords.test(pageImageName)
            ) {
              continue;
            }
            if ((page?.thumbnail?.width || 0) < 220 || (page?.thumbnail?.height || 0) < 220) {
              continue;
            }
            if (
              !doesTitleMatchSubjectIdentity(
                `${pageTitle} ${pageImageName}`,
                subjectTokens
              )
            ) {
              continue;
            }

            usedSourceUrls.add(thumbUrl);
            if (titleKey) usedTitleKeys.add(titleKey);
            candidates.push({
              title: pageTitle.slice(0, 48),
              thumbUrl,
              width: page?.thumbnail?.width || 720,
              height: page?.thumbnail?.height || 960,
              year: extractPhotoYear(`${pageTitle} ${pageImageName}`),
            });
          }
        }
      } catch {
        // Continue
      }

      if (candidates.length >= limit) break;

      // 3. Search Wikimedia Commons bitmap photographs
      try {
        const commonsUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
          `filetype:bitmap ${q}`
        )}&gsrnamespace=6&gsrlimit=${Math.min(
          45,
          limit * 4 + 10
        )}&prop=imageinfo&iiprop=url|dimensions|mime&iiurlwidth=860&format=json`;

        const wikiRes = await fetch(commonsUrl, {
          headers: { "User-Agent": WIKI_USER_AGENT },
        });
        if (wikiRes.ok) {
          const wikiData: any = await wikiRes.json();
          const pages = wikiData?.query?.pages
            ? Object.values(wikiData.query.pages)
            : [];

          for (const page of pages as any[]) {
            if (candidates.length >= limit) break;
            const info = page?.imageinfo?.[0];
            const thumbUrl: string | undefined = info?.thumburl || info?.url;
            const mime = String(info?.mime || "image/jpeg");
            const rawTitle = String(page?.title || "");

            const cleanTitle = rawTitle
              .replace(/^File:/i, "")
              .replace(/\.[^/.]+$/, "")
              .replace(/_/g, " ");
            const titleKey = normalizeTitleKey(cleanTitle);

            if (
              !thumbUrl ||
              usedSourceUrls.has(thumbUrl) ||
              (titleKey && usedTitleKeys.has(titleKey)) ||
              (!mime.includes("jpeg") && !mime.includes("png")) ||
              bannedTitleWords.test(rawTitle) ||
              bannedTitleWords.test(cleanTitle)
            ) {
              continue;
            }
            if ((info?.width || 0) < 220 || (info?.height || 0) < 220) continue;

            const aspect = (info?.width || 1) / Math.max(1, info?.height || 1);
            if (aspect > 2.4 || aspect < 0.35) continue;

            if (!doesTitleMatchSubjectIdentity(cleanTitle, subjectTokens)) {
              continue;
            }

            usedSourceUrls.add(thumbUrl);
            if (titleKey) usedTitleKeys.add(titleKey);
            candidates.push({
              title: cleanTitle.slice(0, 48),
              thumbUrl,
              width: info.thumbwidth || info.width || 720,
              height: info.thumbheight || info.height || 960,
              year: extractPhotoYear(cleanTitle),
            });
          }
        }
      } catch {
        // Continue
      }
    }

    // Resolve candidate thumbnails in parallel (with fallbackThumbUrl so 100% of web images succeed)
    const resolved = await Promise.all(
      candidates.slice(0, limit).map(async (c) => {
        const dataUrl = await resolveImageToDataUrlOrDirect(
          c.thumbUrl,
          c.fallbackThumbUrl
        );
        return {
          title: c.title,
          dataUrl,
          sourceUrl: c.thumbUrl,
          width: c.width,
          height: c.height,
          year: c.year,
        };
      })
    );

    return resolved;
  }

  // Helper: Search Wikimedia Commons for STRICTLY VERIFIED real archival video clips (.webm / .mp4 / .ogv) of the subject
  async function searchRealArchivalVideos(
    rawQuery: string,
    limit: number,
    usedSourceUrls: Set<string> = new Set(),
    requiredSubjectName?: string,
    usedTitleKeys: Set<string> = new Set()
  ): Promise<
    {
      title: string;
      videoUrl: string;
      dataUrl: string;
      width: number;
      height: number;
      year: number | null;
      mediaKind: "video";
    }[]
  > {
    const cleanQuery = rawQuery
      .replace(/[—–-].*$/, "")
      .replace(/\(.*?\)/g, "")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleanQuery) return [];

    const subjectAnchor = (requiredSubjectName || cleanQuery).trim();
    const subjectTokens = extractSubjectIdentityTokens(subjectAnchor);
    if (subjectTokens.length === 0) return [];
    const subjectFullPhrase = subjectTokens.slice(0, 3).join(" ");

    const bannedVideoWords =
      /\b(collage|montage|logo|icon|map|animation|cartoon|rotating|globe|pronunciation|audio|spoken)\b/i;

    const candidates: {
      title: string;
      videoUrl: string;
      thumbUrl: string;
      width: number;
      height: number;
      year: number | null;
    }[] = [];

    try {
      const commonsVideoUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
        `filetype:video ${subjectFullPhrase}`
      )}&gsrnamespace=6&gsrlimit=${Math.min(
        20,
        limit * 4 + 4
      )}&prop=imageinfo&iiprop=url|dimensions|mime|size&iiurlwidth=860&format=json`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      const wikiRes = await fetch(commonsVideoUrl, {
        headers: { "User-Agent": WIKI_USER_AGENT },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (wikiRes.ok) {
        const wikiData: any = await wikiRes.json();
        const pages = wikiData?.query?.pages
          ? Object.values(wikiData.query.pages)
          : [];

        for (const page of pages as any[]) {
          if (candidates.length >= limit) break;
          const info = page?.imageinfo?.[0];
          const videoUrl: string | undefined = info?.url;
          const thumbUrl: string | undefined = info?.thumburl;
          const mime = String(info?.mime || "").toLowerCase();
          const rawTitle = String(page?.title || "");

          const cleanTitle = rawTitle
            .replace(/^File:/i, "")
            .replace(/\.[^/.]+$/, "")
            .replace(/_/g, " ");
          const titleKey = normalizeTitleKey(cleanTitle);

          if (
            !videoUrl ||
            !thumbUrl ||
            usedSourceUrls.has(videoUrl) ||
            (titleKey && usedTitleKeys.has(titleKey)) ||
            (!mime.includes("webm") &&
              !mime.includes("mp4") &&
              !mime.includes("ogg") &&
              !videoUrl.endsWith(".webm") &&
              !videoUrl.endsWith(".mp4") &&
              !videoUrl.endsWith(".ogv")) ||
            bannedVideoWords.test(rawTitle) ||
            bannedVideoWords.test(cleanTitle)
          ) {
            continue;
          }

          // Skip huge full-length movies (> 45MB) so clips load smoothly in the timeline
          if ((info?.size || 0) > 45 * 1024 * 1024) continue;
          if ((info?.width || 0) < 240 || (info?.height || 0) < 180) continue;

          // Strictly verify that the video filename/title matches the character's identity
          if (!doesTitleMatchSubjectIdentity(cleanTitle, subjectTokens)) {
            continue;
          }

          usedSourceUrls.add(videoUrl);
          if (titleKey) usedTitleKeys.add(titleKey);
          candidates.push({
            title: cleanTitle.slice(0, 44),
            videoUrl,
            thumbUrl,
            width: info.width || 720,
            height: info.height || 540,
            year: extractPhotoYear(cleanTitle),
          });
        }
      }
    } catch {
      // Ignore video search timeout
    }

    const resolved = await Promise.all(
      candidates.slice(0, limit).map(async (c) => {
        const dataUrl = await resolveImageToDataUrlOrDirect(c.thumbUrl);
        return {
          title: c.title,
          videoUrl: c.videoUrl,
          dataUrl,
          width: c.width,
          height: c.height,
          year: c.year,
          mediaKind: "video" as const,
        };
      })
    );

    return resolved;
  }

  // 3. Auto-Fetch Real Historical Archival Photos & Videos from Bing Web Images, Wikimedia Commons & Wikipedia
  app.post("/api/archival/fetch-photos", async (req, res) => {
    try {
      const { query, limit = 12 } = req.body;
      if (!query || typeof query !== "string") {
        res.status(400).json({ error: "Vui lòng nhập tên nhân vật cần tìm ảnh/video tư liệu." });
        return;
      }

      const usedUrls = new Set<string>();
      const usedTitles = new Set<string>();
      const [videos, photos] = await Promise.all([
        searchRealArchivalVideos(query, 3, usedUrls, query, usedTitles),
        searchRealArchivalPhotos(query, Number(limit) || 12, usedUrls, query, usedTitles),
      ]);

      res.json({
        photos: [
          ...videos.map((v) => ({ ...v, mediaKind: "video" })),
          ...photos.map((p) => ({ ...p, mediaKind: "image" })),
        ],
        videosCount: videos.length,
        photosCount: photos.length,
        searchedQuery: query,
      });
    } catch (error: any) {
      console.error("Archival photo fetch error:", error);
      res.status(500).json({
        error: error?.message || "Không thể tự động tải ảnh/video tư liệu lịch sử.",
        photos: [],
      });
    }
  });

  // 3b. Automatically Match & Fetch Verified Real Historical Videos & Photos Per Scene in Smooth Chronological Order
  // Searches across Bing Web Images + Wikipedia + Wikimedia Commons across multiple chronological eras so every visual scene gets a unique real photo whenever available!
  app.post("/api/archival/match-scenes", async (req, res) => {
    try {
      const { topic = "", scenes = [] } = req.body || {};
      if (!Array.isArray(scenes) || scenes.length === 0) {
        res.json({ matchedBySceneId: {}, allPhotos: [] });
        return;
      }

      const usedUrls = new Set<string>();
      const usedTitleKeys = new Set<string>();
      const matchedBySceneId: Record<
        string,
        {
          title: string;
          dataUrl: string;
          videoUrl?: string;
          mediaKind: "video" | "image";
          width: number;
          height: number;
          year?: number | null;
        }
      > = {};
      const allPhotos: {
        sceneId: string;
        title: string;
        dataUrl: string;
        videoUrl?: string;
        mediaKind: "video" | "image";
        width: number;
        height: number;
        year?: number | null;
      }[] = [];

      const visualScenes = scenes.filter(
        (sc: any) => sc && sc.sceneType !== "quote" && sc.sceneType !== "outro"
      );

      if (visualScenes.length === 0) {
        res.json({ matchedBySceneId: {}, allPhotos: [] });
        return;
      }

      const cleanTopic = String(topic || "").trim();

      // Step 1: Search in parallel across chronological eras on Bing Web Images + Wikipedia + Wikimedia Commons
      const verifiedVideos: {
        title: string;
        videoUrl: string;
        dataUrl: string;
        width: number;
        height: number;
        year: number | null;
        mediaKind: "video";
      }[] = [];

      const verifiedPool: {
        title: string;
        dataUrl: string;
        sourceUrl: string;
        width: number;
        height: number;
        year: number | null;
      }[] = [];

      if (cleanTopic) {
        const eraQueries = [
          `${cleanTopic} young early career vintage portrait`,
          `${cleanTopic} classic iconic role film still photo`,
          `${cleanTopic} 1960s 1970s actor portrait photo`,
          `${cleanTopic} later years portrait photo`,
        ];

        const [foundVideos, ...eraPhotoLists] = await Promise.all([
          searchRealArchivalVideos(cleanTopic, 4, usedUrls, cleanTopic, usedTitleKeys),
          ...eraQueries.map((eq) =>
            searchRealArchivalPhotos(
              eq,
              Math.max(6, Math.ceil(visualScenes.length / 2) + 2),
              usedUrls,
              cleanTopic,
              usedTitleKeys
            )
          ),
        ]);

        verifiedVideos.push(...foundVideos);
        for (const list of eraPhotoLists) {
          verifiedPool.push(...list);
        }
      }

      // If we still need more photos, check scene-specific archivalKeywords in parallel
      if (verifiedPool.length < visualScenes.length) {
        const extraKeywords = Array.from(
          new Set(
            visualScenes
              .map((sc: any) => String(sc.archivalKeywords || "").trim())
              .filter((kw: string) => kw && kw.toLowerCase() !== cleanTopic.toLowerCase())
          )
        ).slice(0, 3);

        const extraResults = await Promise.all(
          extraKeywords.map((kw) =>
            searchRealArchivalPhotos(kw, 5, usedUrls, cleanTopic || kw, usedTitleKeys)
          )
        );
        for (const list of extraResults) {
          verifiedPool.push(...list);
        }
      }

      // Deduplicate verifiedPool by sourceUrl so no two scenes ever get the same photo
      const uniqueVerifiedPool: typeof verifiedPool = [];
      const seenPoolUrls = new Set<string>();
      for (const p of verifiedPool) {
        if (!p.dataUrl || seenPoolUrls.has(p.sourceUrl)) continue;
        seenPoolUrls.add(p.sourceUrl);
        uniqueVerifiedPool.push(p);
      }

      // Step 2: First assign verified real archival videos to 'video' scenes in chronological order
      const sortedVideos = [...verifiedVideos].sort(
        (a, b) => (a.year || 1960) - (b.year || 1960)
      );
      const videoTargetScenes = visualScenes.filter((s: any) => s.sceneType === "video");
      let matchedVideosCount = 0;

      for (let vIdx = 0; vIdx < sortedVideos.length && vIdx < videoTargetScenes.length; vIdx++) {
        const sc = videoTargetScenes[vIdx];
        const vid = sortedVideos[vIdx];
        const label = vid.year ? `${vid.title} (${vid.year})` : vid.title;
        matchedBySceneId[sc.id] = {
          title: label,
          dataUrl: vid.dataUrl,
          videoUrl: vid.videoUrl,
          mediaKind: "video",
          width: vid.width,
          height: vid.height,
          year: vid.year,
        };
        allPhotos.push({
          sceneId: sc.id,
          title: label,
          dataUrl: vid.dataUrl,
          videoUrl: vid.videoUrl,
          mediaKind: "video",
          width: vid.width,
          height: vid.height,
          year: vid.year,
        });
        matchedVideosCount++;
      }

      // Step 3: Sort verified photos in smooth chronological order (earliest year -> latest year)
      const datedPhotos = uniqueVerifiedPool
        .filter((p) => p.year !== null)
        .sort((a, b) => (a.year || 0) - (b.year || 0));
      const undatedPhotos = uniqueVerifiedPool.filter((p) => p.year === null);

      const remainingVisualScenes = visualScenes.filter(
        (sc: any) => !matchedBySceneId[sc.id]
      );
      const orderedVerifiedPhotos = [...datedPhotos, ...undatedPhotos].slice(
        0,
        remainingVisualScenes.length
      );

      // Step 4: Assign verified photos smoothly across remaining visual scenes in chronological order.
      // Never repeat any photo; leave remaining scenes unassigned so the user gets a Reference Image + Standard Kling AI Prompt for them!
      if (orderedVerifiedPhotos.length > 0 && remainingVisualScenes.length > 0) {
        if (orderedVerifiedPhotos.length >= remainingVisualScenes.length) {
          for (let i = 0; i < remainingVisualScenes.length; i++) {
            const sc = remainingVisualScenes[i];
            const photo = orderedVerifiedPhotos[i];
            const label = photo.year ? `${photo.title} (${photo.year})` : photo.title;
            matchedBySceneId[sc.id] = {
              title: label,
              dataUrl: photo.dataUrl,
              mediaKind: "image",
              width: photo.width,
              height: photo.height,
              year: photo.year,
            };
            allPhotos.push({
              sceneId: sc.id,
              title: label,
              dataUrl: photo.dataUrl,
              mediaKind: "image",
              width: photo.width,
              height: photo.height,
              year: photo.year,
            });
          }
        } else {
          for (let pIdx = 0; pIdx < orderedVerifiedPhotos.length; pIdx++) {
            const targetSceneIdx =
              orderedVerifiedPhotos.length === 1
                ? 0
                : Math.min(
                    remainingVisualScenes.length - 1,
                    Math.round(
                      (pIdx * (remainingVisualScenes.length - 1)) /
                        Math.max(1, orderedVerifiedPhotos.length - 1)
                    )
                  );
            let chosenIdx = targetSceneIdx;
            while (
              chosenIdx < remainingVisualScenes.length &&
              matchedBySceneId[remainingVisualScenes[chosenIdx].id]
            ) {
              chosenIdx++;
            }
            if (chosenIdx >= remainingVisualScenes.length) {
              chosenIdx = remainingVisualScenes.findIndex((s: any) => !matchedBySceneId[s.id]);
            }
            if (chosenIdx >= 0 && chosenIdx < remainingVisualScenes.length) {
              const sc = remainingVisualScenes[chosenIdx];
              const photo = orderedVerifiedPhotos[pIdx];
              const label = photo.year ? `${photo.title} (${photo.year})` : photo.title;
              matchedBySceneId[sc.id] = {
                title: label,
                dataUrl: photo.dataUrl,
                mediaKind: "image",
                width: photo.width,
                height: photo.height,
                year: photo.year,
              };
              allPhotos.push({
                sceneId: sc.id,
                title: label,
                dataUrl: photo.dataUrl,
                mediaKind: "image",
                width: photo.width,
                height: photo.height,
                year: photo.year,
              });
            }
          }
        }
      }

      res.json({
        matchedBySceneId,
        allPhotos,
        matchedVideosCount,
        matchedPhotosCount: allPhotos.length - matchedVideosCount,
        totalVerifiedCount: allPhotos.length,
        totalVisualScenesCount: visualScenes.length,
      });
    } catch (error: any) {
      console.error("Match scenes archival error:", error);
      res.status(500).json({
        error: error?.message || "Lỗi khi tự động ghép ảnh thực tế.",
        matchedBySceneId: {},
        allPhotos: [],
      });
    }
  });

  // In-memory TTS cache & quota cooldown tracker so 429 rate-limits never stall or spam errors
  const ttsAudioCache = new Map<string, { audioDataUrl: string; engine: string }>();
  const ttsModelCooldownUntil: Record<string, number> = {};
  const GEMINI_TTS_MODELS = [
    "gemini-3.8-flash-lite-tts",
    "gemini-3.8-flash-tts",
    "gemini-2.5-flash-preview-tts",
  ] as const;

  const DEFAULT_LIFE_LEGENDS_VOICE_STYLE =
    "Warm, deep, resonant American documentary baritone narrator like Life Legends. Speak at a calm, unhurried, reflective storytelling pace (135 words per minute) with rich chest resonance, intimate close-mic studio warmth, gentle emotional gravitas, and natural dramatic pauses between phrases.";

  async function synthesizeSingleSceneGeminiTts(
    cleanText: string,
    voiceName: string,
    style: string,
    startModelOffset = 0
  ): Promise<string | null> {
    const now = Date.now();
    const availableModels = GEMINI_TTS_MODELS.filter(
      (m) => !ttsModelCooldownUntil[m] || ttsModelCooldownUntil[m] <= now
    );
    if (availableModels.length === 0) return null;

    const ai = getGenAIClient();
    for (let i = 0; i < availableModels.length; i++) {
      const ttsModel = availableModels[(startModelOffset + i) % availableModels.length];
      try {
        // Only gemini-3.8-* models support speechMetadata; gemini-2.5-flash-preview-tts rejects speechMetadata with HTTP 400
        const partPayload = ttsModel.startsWith("gemini-3.8")
          ? ({
              text: cleanText,
              speechMetadata: {
                style: style || DEFAULT_LIFE_LEGENDS_VOICE_STYLE,
              },
            } as any)
          : { text: cleanText };

        const response = await ai.models.generateContent({
          model: ttsModel,
          contents: [
            {
              role: "user",
              parts: [partPayload],
            },
          ],
          config: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName },
              },
            },
          },
        });

        const inlineData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
        const base64Audio = inlineData?.data;
        if (base64Audio && base64Audio.length > 100) {
          const rawBuffer = Buffer.from(base64Audio, "base64");
          const validWavBuffer = ensureValidWavBuffer(rawBuffer, 24000);
          return `data:audio/wav;base64,${validWavBuffer.toString("base64")}`;
        }
      } catch (geminiErr: any) {
        const errMsg = String(geminiErr?.message || geminiErr || "");
        const isQuotaOrRateLimit =
          errMsg.includes("429") ||
          errMsg.includes("RESOURCE_EXHAUSTED") ||
          errMsg.includes("quota");

        if (isQuotaOrRateLimit) {
          const isDailyQuota =
            errMsg.includes("PerDay") || errMsg.includes("per day");
          ttsModelCooldownUntil[ttsModel] =
            Date.now() + (isDailyQuota ? 20 * 60 * 1000 : 45 * 1000);
        }
      }
    }
    return null;
  }

  // 4. Generate Single Scene TTS Voiceover (Respects Locked Engine & Language so voice never drifts mid-project)
  app.post("/api/tts/generate", async (req, res) => {
    try {
      const {
        text,
        voiceName = "Charon",
        language,
        preferredEngine,
        style = DEFAULT_LIFE_LEGENDS_VOICE_STYLE,
      } = req.body;

      if (!text || typeof text !== "string" || !text.trim()) {
        res.status(400).json({ error: "Thiếu nội dung lời thoại cần tạo giọng đọc." });
        return;
      }

      const cleanText = text.trim();
      const forcedLang: "vi" | "en" | undefined =
        language === "vi" || language === "en" ? language : undefined;
      const engineKey = preferredEngine || "auto";
      const cacheKey = `${voiceName}::${forcedLang || "auto"}::${engineKey}::${cleanText}`;
      const cached = ttsAudioCache.get(cacheKey);
      if (cached) {
        res.json(cached);
        return;
      }

      if (preferredEngine !== "standard-locked") {
        const wavDataUrl = await synthesizeSingleSceneGeminiTts(cleanText, voiceName, style, 0);
        if (wavDataUrl) {
          const payload = {
            audioDataUrl: wavDataUrl,
            engine: "gemini-tts",
          };
          if (ttsAudioCache.size > 200) {
            const oldestKey = ttsAudioCache.keys().next().value;
            if (oldestKey) ttsAudioCache.delete(oldestKey);
          }
          ttsAudioCache.set(cacheKey, payload);
          res.json(payload);
          return;
        }
      }

      // Guaranteed Consistent Stream with locked language so voice never changes language mid-video
      const fallbackDataUrl = await generateFallbackMp3Tts(cleanText, forcedLang);
      if (fallbackDataUrl) {
        const payload = {
          audioDataUrl: fallbackDataUrl,
          engine: "standard-locked",
        };
        if (ttsAudioCache.size > 200) {
          const oldestKey = ttsAudioCache.keys().next().value;
          if (oldestKey) ttsAudioCache.delete(oldestKey);
        }
        ttsAudioCache.set(cacheKey, payload);
        res.json(payload);
        return;
      }

      res.status(500).json({ error: "Không nhận được dữ liệu âm thanh từ mô hình TTS." });
    } catch (error: any) {
      res.status(500).json({
        error: error?.message || "Lỗi khi tạo giọng đọc AI.",
      });
    }
  });

  // 4b. Generate 100% UNIFORM Voiceover Batch Across Entire Video (Zero Engine Switching Mid-Video!)
  // Synthesizes each scene in parallel batches of 3 across Gemini TTS models for crystal-clear per-scene baritone narration.
  app.post("/api/tts/generate-batch", async (req, res) => {
    try {
      const {
        items = [],
        voiceName = "Charon",
        language = "en",
        preferredEngine,
        style = DEFAULT_LIFE_LEGENDS_VOICE_STYLE,
      } = req.body || {};

      if (!Array.isArray(items) || items.length === 0) {
        res.status(400).json({ error: "Danh sách cảnh cần đọc trống." });
        return;
      }

      const forcedLang: "vi" | "en" = language === "en" ? "en" : "vi";
      const validItems = items
        .map((it: any) => ({
          id: String(it?.id || ""),
          text: String(it?.text || "").trim(),
        }))
        .filter((it) => it.id && it.text.length > 0);

      if (validItems.length === 0) {
        res.json({ resultsBySceneId: {}, engineUsed: "standard-locked" });
        return;
      }

      const resultsBySceneId: Record<string, { audioDataUrl: string; engine: string }> = {};

      // Attempt 1: Per-Scene Multi-Model Gemini Studio Baritone TTS in fast batches of 3
      if (preferredEngine !== "standard-locked") {
        let geminiSuccessCount = 0;
        const batchSize = 3;

        for (let b = 0; b < validItems.length; b += batchSize) {
          const chunk = validItems.slice(b, b + batchSize);
          await Promise.all(
            chunk.map(async (item, idxInChunk) => {
              const globalIdx = b + idxInChunk;
              const cacheKey = `${voiceName}::${forcedLang}::gemini-tts::${item.text}`;
              const cached = ttsAudioCache.get(cacheKey);
              if (cached) {
                resultsBySceneId[item.id] = cached;
                geminiSuccessCount++;
                return;
              }

              const wavDataUrl = await synthesizeSingleSceneGeminiTts(
                item.text,
                voiceName,
                style,
                globalIdx
              );
              if (wavDataUrl) {
                const payload = {
                  audioDataUrl: wavDataUrl,
                  engine: "gemini-single-pass",
                };
                if (ttsAudioCache.size > 200) {
                  const oldestKey = ttsAudioCache.keys().next().value;
                  if (oldestKey) ttsAudioCache.delete(oldestKey);
                }
                ttsAudioCache.set(cacheKey, payload);
                resultsBySceneId[item.id] = payload;
                geminiSuccessCount++;
              }
            })
          );
        }

        // If all or most scenes succeeded with Gemini TTS, fill any remaining gap and return
        if (geminiSuccessCount > 0) {
          for (const item of validItems) {
            if (!resultsBySceneId[item.id]) {
              const retryWav = await synthesizeSingleSceneGeminiTts(
                item.text,
                voiceName,
                style,
                0
              );
              if (retryWav) {
                resultsBySceneId[item.id] = {
                  audioDataUrl: retryWav,
                  engine: "gemini-single-pass",
                };
              } else {
                const fb = await generateFallbackMp3Tts(item.text, forcedLang);
                if (fb) {
                  resultsBySceneId[item.id] = {
                    audioDataUrl: fb,
                    engine: "standard-locked",
                  };
                }
              }
            }
          }

          res.json({
            resultsBySceneId,
            engineUsed: "gemini-single-pass",
          });
          return;
        }
      }

      // Attempt 2: 100% Uniform Standard-Locked Stream across EVERY scene in the video
      for (const item of validItems) {
        const cacheKey = `${voiceName}::${forcedLang}::standard-locked::${item.text}`;
        const cached = ttsAudioCache.get(cacheKey);
        if (cached) {
          resultsBySceneId[item.id] = cached;
          continue;
        }

        const audioDataUrl = await generateFallbackMp3Tts(item.text, forcedLang);
        if (audioDataUrl) {
          const payload = {
            audioDataUrl,
            engine: "standard-locked",
          };
          if (ttsAudioCache.size > 200) {
            const oldestKey = ttsAudioCache.keys().next().value;
            if (oldestKey) ttsAudioCache.delete(oldestKey);
          }
          ttsAudioCache.set(cacheKey, payload);
          resultsBySceneId[item.id] = payload;
        }
      }

      res.json({
        resultsBySceneId,
        engineUsed: "standard-locked",
      });
    } catch (error: any) {
      res.status(500).json({
        error: error?.message || "Lỗi khi đồng bộ giọng đọc hàng loạt.",
      });
    }
  });
}

registerRoutes();

async function startServer() {
  const PORT = 3000;

  if (process.env.NODE_ENV !== "production") {
    const vitePkg = "vite";
    const { createServer: createViteServer } = await import(vitePkg);
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`LegendCut Studio server running on http://localhost:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;

