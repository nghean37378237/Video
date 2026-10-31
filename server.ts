import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getGenAIClient() {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
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
    process.env["trollllm.xyz"] ||
    process.env.TROLLLLM_API_KEY ||
    process.env.PROXY_API_KEY ||
    ""
  ).trim();

  if (direct && direct !== "MY_OPENAI_API_KEY" && direct.length > 5) {
    return direct;
  }

  // Fallback: scan all env vars for any key starting with "sk-" (e.g., "sk-trollllm-...")
  for (const [key, val] of Object.entries(process.env)) {
    if (key === "GEMINI_API_KEY") continue;
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
  "gemini-3-8-flash",
  "deepseek-v4-flash",
];

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

  const candidateModels = Array.from(
    new Set([model, ...PROXY_FALLBACK_MODELS].filter(Boolean))
  );

  let lastErrorMsg = "";

  for (const candidateModel of candidateModels) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: candidateModel,
        temperature: 0.7,
        messages: [
          { role: "system", content: options.systemPrompt },
          { role: "user", content: options.userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      lastErrorMsg = `Lỗi từ API trung gian (${response.status}): ${errText.slice(0, 220)}`;
      // If model has no compatible credits (402) or model not found/unavailable, try next model family
      if (
        response.status === 402 ||
        response.status === 404 ||
        response.status === 400 ||
        response.status === 429 ||
        response.status >= 500
      ) {
        continue;
      }
      throw new Error(lastErrorMsg);
    }

    const data: any = await response.json();
    const content: string = data?.choices?.[0]?.message?.content || "";

    // Extract JSON array from markdown code block or raw string
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      lastErrorMsg = "Phản hồi từ API trung gian không đúng định dạng mảng JSON.";
      continue;
    }

    return {
      scenes: JSON.parse(jsonMatch[0]),
      usedModel: candidateModel,
    };
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

function registerRoutes() {

  // 0. Check Intermediary Proxy API Configuration Status & Test Endpoint
  app.get("/api/proxy/status", (_req, res) => {
    const cfg = getProxyConfig();
    res.json({
      configured: cfg.hasValidKey,
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
        res.status(400).json({
          ok: false,
          error:
            "Chưa điền OPENAI_API_KEY trong bảng Settings > Secrets của AI Studio.",
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

      if (!cfg.hasValidKey) {
        res.status(400).json({
          ok: false,
          error:
            "Chưa tìm thấy OPENAI_API_KEY. Hãy mở bảng Settings > Secrets của AI Studio và dán API Key từ https://trollllm.xyz/ vào biến OPENAI_API_KEY.",
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

  // 1. Generate Documentary Storyboard & Prompts (Uses Intermediary API if configured, else Gemini)
  app.post("/api/story/generate", async (req, res) => {
    try {
      const {
        topic,
        language = "en",
        sceneCount = 10,
        includeQuotes = true,
        channelTitle = "LIFE LEGENDS",
        channelSubtitle = "THEIR LEGACY. YOUR INSPIRATION.",
        aspectRatio = "3:4",
        customBaseUrl,
        customModel,
        preferProxy = true,
      } = req.body;

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

      const langInstruction =
        language === "en"
          ? "Write narrationText in dramatic, warm English documentary style (exact 'Life Legends' channel style: short punchy sentences, deep emotional storytelling), and translationText in Vietnamese."
          : "Write narrationText in dramatic, warm Vietnamese documentary storytelling style (phong cách kể chuyện truyền cảm hứng sâu sắc như kênh Life Legends), and translationText in English.";

      const targetSceneCount = Math.max(4, Math.min(20, Number(sceneCount) || 10));
      const videoSceneQuota =
        targetSceneCount >= 20
          ? "6"
          : targetSceneCount >= 18
          ? "5 or 6"
          : targetSceneCount >= 16
          ? "5"
          : targetSceneCount >= 14
          ? "4 or 5"
          : targetSceneCount >= 10
          ? "3 or 4"
          : "2 or 3";
      const quoteSceneQuota = includeQuotes
        ? targetSceneCount >= 18
          ? "3 or 4 'quote' intertitle scenes (pitch-black screen with centered white italic text at major turning points in the story)"
          : targetSceneCount >= 14
          ? "2 or 3 'quote' intertitle scenes (pitch-black screen with centered white italic text at major turning points in the story)"
          : "2 'quote' intertitle scenes (pitch-black screen with centered white italic text at major turning points in the story)"
        : "visual scenes";
      const imageSceneQuota =
        targetSceneCount >= 20
          ? "9 or 10"
          : targetSceneCount >= 18
          ? "8 or 9"
          : targetSceneCount >= 16
          ? "7 or 8"
          : targetSceneCount >= 14
          ? "6 or 7"
          : targetSceneCount >= 10
          ? "4 or 5"
          : "3 or 4";

      const prompt = `Create an EXACTLY ${targetSceneCount}-scene documentary story video script & production prompt sheet about: "${topic}" (return a JSON array with exactly ${targetSceneCount} scene objects).
${langInstruction}

Follow the exact viral "Life Legends" video formula for ${targetSceneCount} scenes with SMOOTH CHRONOLOGICAL & EMOTIONAL ORDERING:
1. Smooth Story Arc (#01 -> #${targetSceneCount}):
   - Scene #1 MUST be 'video' (a captivating hook where the character speaks/moves or performs a signature action, 5-9 seconds).
   - Scenes #2 to #${targetSceneCount - 1} MUST flow in a seamless chronological progression: Early Youth & Humble Beginnings -> Career Breakthrough -> Peak Iconic Roles -> Personal Struggles / Hidden Truths -> Enduring Legacy & Life Philosophy. Each scene's narration must bridge naturally into the next scene.
   - Across the ${targetSceneCount} scenes, use ${videoSceneQuota} 'video' scenes (for Kling AI Image-to-Video generation), ${imageSceneQuota} 'image' scenes (vintage still photo with slow Ken Burns zoom), and ${quoteSceneQuota}.
   - Final scene (#${targetSceneCount}) MUST be 'outro' (closing crest "${channelTitle} — ${channelSubtitle}").
2. CRITICAL FOR FULL-FRAME KLING AI VIDEO & IMAGE PROMPTS: Every 'video' and 'image' scene MUST have:
   - 'frameStyle': "full-bleed" (filling 100% of the frame edge-to-edge).
   - 'archivalKeywords': MUST begin with the exact full name of the main character "${topic}" followed by the specific year/era or role of that scene (e.g. "${topic} 1955 portrait", "${topic} 1966 film").
   - 'imagePrompt': High-detail English prompt for Kling AI / ChatGPT Pro to draw the character accurately at that exact life stage in ${ratioDesc}, edge-to-edge full-bleed composition filling 100% of the frame, no black bars, no borders.
   - 'videoMotionPrompt': A richly scripted 3-beat English director's motion prompt specifically for KLING AI Image-to-Video (I2V). Refer to the character as "the subject in the reference frame" + their attire/visual appearance, and explicitly include "[Kling AI I2V - Lock Reference Face Identity] [0-2s Opening Beat]: Starting from the uploaded reference frame of the subject, ... -> [2-4s Story Action & Speech]: Preserving 100% exact facial identity from the reference image, ... -> [4-6s Camera Control & Climax]: Smooth Kling dolly push-in..." in full-screen ${ratioDesc} filling 100% of the frame.`;

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
      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: SCENE_ARRAY_SCHEMA,
        },
      });

      const text = response.text || "[]";
      const scenes = JSON.parse(text.trim());
      res.json({ scenes, usedProvider: "Gemini AI" });
    } catch (error: any) {
      res.status(500).json({
        error: error?.message || "Không thể tạo kịch bản bằng AI. Vui lòng thử lại.",
      });
    }
  });

  // 2. Parse User's Pasted Script into Video/Image Segments + Prompts
  app.post("/api/story/parse-script", async (req, res) => {
    try {
      const {
        rawScript,
        language = "en",
        sceneCount = 0,
        channelTitle = "LIFE LEGENDS",
        channelSubtitle = "THEIR LEGACY. YOUR INSPIRATION.",
        aspectRatio = "3:4",
        customBaseUrl,
        customModel,
        preferProxy = true,
      } = req.body;

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

      const requestedSceneCount = Number(sceneCount) > 0 ? Math.max(4, Math.min(20, Number(sceneCount))) : 0;
      const countDirective = requestedSceneCount
        ? `Break this script down into EXACTLY ${requestedSceneCount} smooth, chronologically ordered sequential scenes (where Scene #${requestedSceneCount} is the final 'outro' brand crest, and Scenes #1 to #${requestedSceneCount - 1} cover the full story in seamless narrative order)`
        : `Break this script down into smooth, chronologically ordered sequential scenes (each 12-28 words of narration, keeping the user's core script faithfully)`;

      const prompt = `You are a senior documentary video director for the "Life Legends" channel.
The user has provided the following script/story text:
"""
${rawScript}
"""

${countDirective} and decide for EACH segment whether the user should provide:
- 'video' (CẦN VIDEO KLING AI: use for 3-5 key scenes like the opening hook, mid-story action, and closing shot; set frameStyle to 'full-bleed')
- 'image' (CẦN ẢNH TĨNH: archival portrait with Ken Burns zoom; set frameStyle to 'full-bleed')
- 'quote' (THẺ CHỮ ĐEN: 2-3 dramatic turning-point sentences rendered as white italic text on a pitch-black screen — no image/video needed)
- 'outro' (Final scene: "${channelTitle} - ${channelSubtitle}" brand crest)

For every scene, ensure smooth chronological transitions from one scene to the next, and generate:
1. 'visualPrompt' in Vietnamese clearly stating "CẦN VIDEO:" or "CẦN ẢNH TĨNH:" or "THẺ CHỮ ĐEN TỰ ĐỘNG".
2. 'imagePrompt' in English (ready to copy into Kling AI / ChatGPT Pro / Midjourney / Flux, explicitly specifying the character's exact age/era in this scene, full-frame ${ratioDesc}, edge-to-edge full-bleed composition filling 100% of the frame, no borders).
3. 'videoMotionPrompt' in English: Write a scripted 3-beat mini-story motion prompt specifically for KLING AI Image-to-Video (I2V). To avoid celebrity name blocks while preserving 100% facial likeness from the uploaded photo, refer to the person as "the subject in the reference frame" + their visual traits, structured as "[Kling AI I2V - Lock Reference Face Identity] [0-2s Opening Beat]: ... -> [2-4s Story Action & Speech]: Preserving 100% exact facial identity from the reference image, ... -> [4-6s Camera Control & Climax]: ..." in full-screen ${ratioDesc}.
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
      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: SCENE_ARRAY_SCHEMA,
        },
      });

      const text = response.text || "[]";
      const scenes = JSON.parse(text.trim());
      res.json({ scenes, usedProvider: "Gemini AI" });
    } catch (error: any) {
      console.error("Script parse error:", error);
      res.status(500).json({
        error: error?.message || "Không thể phân tích kịch bản. Vui lòng thử lại.",
      });
    }
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

  async function resolveImageToDataUrlOrDirect(url: string): Promise<string> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2800);
      const imgRes = await fetch(url, {
        headers: { "User-Agent": WIKI_USER_AGENT },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (imgRes.ok) {
        const cType = imgRes.headers.get("content-type") || "image/jpeg";
        if (cType.includes("jpeg") || cType.includes("png") || cType.includes("webp")) {
          const buf = await imgRes.arrayBuffer();
          if (buf.byteLength > 3500) {
            return `data:${cType};base64,${Buffer.from(buf).toString("base64")}`;
          }
        }
      }
    } catch {
      // Fall back to direct CORS URL
    }
    return url;
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
    // If surname is distinctive (>= 5 chars), accept surname match when accompanied by another token or standalone portrait
    if (lastToken.length >= 5 && normalized.includes(lastToken)) {
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

  // Helper: Search Wikimedia Commons & Wikipedia for STRICTLY VERIFIED real historical photos of the subject
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

    // Always anchor every query with the subject's name so Wikimedia never returns random off-topic photos
    if (
      subjectFullPhrase &&
      !cleanQuery.toLowerCase().includes(subjectTokens[subjectTokens.length - 1] || "")
    ) {
      candidateQueries.push(`${subjectFullPhrase} ${cleanQuery}`.slice(0, 65));
    } else {
      candidateQueries.push(cleanQuery.slice(0, 65));
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
      width: number;
      height: number;
      year: number | null;
    }[] = [];

    // Strictly ban collages, montages, plaques, graves, maps, buildings, signatures, and non-portrait items
    const bannedTitleWords =
      /\b(collage|montage|grid|logo|icon|map|signature|autograph|flag|coat_of_arms|diagram|chart|stamp|plaque|grave|tombstone|memorial|statue|sculpture|wax|caricature|cartoon|drawing|sketch|svg|lego|building|house|hotel|street|exterior|theater|theatre|cinema|book|magazine|newspaper|document|certificate|award|trophy|walk_of_fame|star_on)\b/i;

    for (const q of candidateQueries) {
      if (candidates.length >= limit) break;

      // 1. Search Wikipedia PageImages API first for exact verified biography/film portraits
      try {
        const wpUrl = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
          q
        )}&gsrlimit=8&prop=pageimages&piprop=thumbnail|name&pithumbsize=860&format=json`;
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
            if ((page?.thumbnail?.width || 0) < 240 || (page?.thumbnail?.height || 0) < 240) {
              continue;
            }
            // Strictly verify that the Wikipedia page or image filename belongs to the character
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
              title: pageTitle.slice(0, 44),
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

      // 2. Search Wikimedia Commons bitmap photographs with strict subject identity verification
      try {
        const commonsUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
          `filetype:bitmap ${q}`
        )}&gsrnamespace=6&gsrlimit=${Math.min(
          40,
          limit * 4 + 8
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
            if ((info?.width || 0) < 250 || (info?.height || 0) < 250) continue;

            // Reject extreme horizontal banners or tiny icons
            const aspect = (info?.width || 1) / Math.max(1, info?.height || 1);
            if (aspect > 2.3 || aspect < 0.35) continue;

            // CRITICAL: Only accept photos whose filename/title explicitly matches the character's identity!
            if (!doesTitleMatchSubjectIdentity(cleanTitle, subjectTokens)) {
              continue;
            }

            usedSourceUrls.add(thumbUrl);
            if (titleKey) usedTitleKeys.add(titleKey);
            candidates.push({
              title: cleanTitle.slice(0, 44),
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

    // Resolve candidate thumbnails in parallel
    const resolved = await Promise.all(
      candidates.slice(0, limit).map(async (c) => {
        const dataUrl = await resolveImageToDataUrlOrDirect(c.thumbUrl);
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

  // 3. Auto-Fetch Real Historical Archival Photos from Wikimedia Commons & Wikipedia
  app.post("/api/archival/fetch-photos", async (req, res) => {
    try {
      const { query, limit = 8 } = req.body;
      if (!query || typeof query !== "string") {
        res.status(400).json({ error: "Vui lòng nhập tên nhân vật cần tìm ảnh tư liệu." });
        return;
      }

      const photos = await searchRealArchivalPhotos(
        query,
        Number(limit) || 8,
        new Set(),
        query
      );
      res.json({ photos, searchedQuery: query });
    } catch (error: any) {
      console.error("Archival photo fetch error:", error);
      res.status(500).json({
        error: error?.message || "Không thể tự động tải ảnh tư liệu lịch sử.",
        photos: [],
      });
    }
  });

  // 3b. Automatically Match & Fetch Verified Real Historical Photos Per Scene in Smooth Chronological Order
  // Never assigns random/off-topic or duplicate photos: if a verified photo isn't available for a scene, leaves it unassigned so the app provides a Standard Kling AI Prompt instead!
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
        { title: string; dataUrl: string; width: number; height: number; year?: number | null }
      > = {};
      const allPhotos: {
        sceneId: string;
        title: string;
        dataUrl: string;
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

      // Step 1: Gather a verified pool of unique real photos of the main character across chronological queries
      const verifiedPool: {
        title: string;
        dataUrl: string;
        sourceUrl: string;
        width: number;
        height: number;
        year: number | null;
      }[] = [];

      if (cleanTopic) {
        const basePhotos = await searchRealArchivalPhotos(
          cleanTopic,
          Math.max(8, visualScenes.length + 4),
          usedUrls,
          cleanTopic,
          usedTitleKeys
        );
        verifiedPool.push(...basePhotos);
      }

      // Also check scene-specific archivalKeywords (strictly verified against cleanTopic)
      for (const sc of visualScenes) {
        if (verifiedPool.length >= visualScenes.length + 3) break;
        const kw = String(sc.archivalKeywords || "").trim();
        if (kw && kw.toLowerCase() !== cleanTopic.toLowerCase()) {
          const found = await searchRealArchivalPhotos(
            kw,
            2,
            usedUrls,
            cleanTopic || kw,
            usedTitleKeys
          );
          verifiedPool.push(...found);
        }
      }

      // Step 2: Sort verified photos in smooth chronological order (earliest year -> latest year)
      // Photos with known years are ordered chronologically; undated portraits are distributed smoothly
      const datedPhotos = verifiedPool
        .filter((p) => p.year !== null)
        .sort((a, b) => (a.year || 0) - (b.year || 0));
      const undatedPhotos = verifiedPool.filter((p) => p.year === null);

      const orderedVerifiedPhotos = [...datedPhotos, ...undatedPhotos].slice(
        0,
        visualScenes.length
      );

      // Step 3: Assign verified photos smoothly across visual scenes in chronological order.
      // If we have fewer verified real photos than visual scenes, distribute them evenly across key scenes
      // and leave the remaining scenes UNASSIGNED (no random or repeated photos!) so the user gets a Standard Kling AI Prompt for them.
      if (orderedVerifiedPhotos.length > 0) {
        if (orderedVerifiedPhotos.length >= visualScenes.length) {
          for (let i = 0; i < visualScenes.length; i++) {
            const sc = visualScenes[i];
            const photo = orderedVerifiedPhotos[i];
            matchedBySceneId[sc.id] = {
              title: photo.year ? `${photo.title} (${photo.year})` : photo.title,
              dataUrl: photo.dataUrl,
              width: photo.width,
              height: photo.height,
              year: photo.year,
            };
            allPhotos.push({
              sceneId: sc.id,
              title: matchedBySceneId[sc.id].title,
              dataUrl: photo.dataUrl,
              width: photo.width,
              height: photo.height,
              year: photo.year,
            });
          }
        } else {
          // Assign the N verified photos in strict chronological order to the first N matching eras/scenes without repeating any photo
          for (let pIdx = 0; pIdx < orderedVerifiedPhotos.length; pIdx++) {
            const targetSceneIdx =
              orderedVerifiedPhotos.length === 1
                ? 0
                : Math.min(
                    visualScenes.length - 1,
                    Math.round(
                      (pIdx * (visualScenes.length - 1)) /
                        Math.max(1, orderedVerifiedPhotos.length - 1)
                    )
                  );
            // Find the first unassigned scene at or after targetSceneIdx
            let chosenIdx = targetSceneIdx;
            while (
              chosenIdx < visualScenes.length &&
              matchedBySceneId[visualScenes[chosenIdx].id]
            ) {
              chosenIdx++;
            }
            if (chosenIdx >= visualScenes.length) {
              chosenIdx = visualScenes.findIndex((s) => !matchedBySceneId[s.id]);
            }
            if (chosenIdx >= 0 && chosenIdx < visualScenes.length) {
              const sc = visualScenes[chosenIdx];
              const photo = orderedVerifiedPhotos[pIdx];
              matchedBySceneId[sc.id] = {
                title: photo.year ? `${photo.title} (${photo.year})` : photo.title,
                dataUrl: photo.dataUrl,
                width: photo.width,
                height: photo.height,
                year: photo.year,
              };
              allPhotos.push({
                sceneId: sc.id,
                title: matchedBySceneId[sc.id].title,
                dataUrl: photo.dataUrl,
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
  const GEMINI_TTS_MODELS = ["gemini-3.8-flash-lite-tts", "gemini-3.8-flash-tts"] as const;

  // 4. Generate Single Scene TTS Voiceover (Respects Locked Engine & Language so voice never drifts mid-project)
  app.post("/api/tts/generate", async (req, res) => {
    try {
      const {
        text,
        voiceName = "Charon",
        language,
        preferredEngine,
        style = "STRICT VOICE LOCK: Speak with a consistent, deep, warm, calm documentary narrator voice. Maintain identical pitch, measured pacing, and steady studio gravitas.",
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

      // Only attempt Gemini TTS if not explicitly locked to 'standard-locked'
      if (preferredEngine !== "standard-locked") {
        const now = Date.now();
        const availableModels = GEMINI_TTS_MODELS.filter(
          (m) => !ttsModelCooldownUntil[m] || ttsModelCooldownUntil[m] <= now
        );

        if (availableModels.length > 0) {
          const ai = getGenAIClient();
          for (const ttsModel of availableModels) {
            try {
              const response = await ai.models.generateContent({
                model: ttsModel,
                contents: [
                  {
                    role: "user",
                    parts: [
                      {
                        text: cleanText,
                        speechMetadata: {
                          style,
                        },
                      } as any,
                    ],
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
                const payload = {
                  audioDataUrl: `data:audio/wav;base64,${validWavBuffer.toString("base64")}`,
                  engine: "gemini-tts",
                };
                if (ttsAudioCache.size > 150) {
                  const oldestKey = ttsAudioCache.keys().next().value;
                  if (oldestKey) ttsAudioCache.delete(oldestKey);
                }
                ttsAudioCache.set(cacheKey, payload);
                res.json(payload);
                return;
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
                  Date.now() + (isDailyQuota ? 30 * 60 * 1000 : 65 * 1000);
              }
            }
          }
        }
      }

      // Guaranteed Consistent Stream with locked language so voice never changes language mid-video
      const fallbackDataUrl = await generateFallbackMp3Tts(cleanText, forcedLang);
      if (fallbackDataUrl) {
        const payload = {
          audioDataUrl: fallbackDataUrl,
          engine: "standard-locked",
        };
        if (ttsAudioCache.size > 150) {
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
  // Uses either 1 single continuous Gemini TTS studio take sliced into scenes, OR 100% locked standard stream for ALL scenes.
  app.post("/api/tts/generate-batch", async (req, res) => {
    try {
      const {
        items = [],
        voiceName = "Charon",
        language = "vi",
        preferredEngine,
        style = "STRICT VOICE LOCK: Speak with a consistent, deep, warm, calm documentary narrator voice from beginning to end. Maintain identical vocal pitch, steady cadence, and unchanging studio warmth.",
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

      // Attempt 1: Single-Pass Full-Script Gemini TTS (1 API call for the entire video!)
      // Because all scenes are spoken in ONE continuous recording, voice timbre, pitch, and cadence are 100% identical from start to finish, and it never hits the 3-RPM limit mid-video!
      if (preferredEngine !== "standard-locked") {
        const now = Date.now();
        const availableModels = GEMINI_TTS_MODELS.filter(
          (m) => !ttsModelCooldownUntil[m] || ttsModelCooldownUntil[m] <= now
        );

        if (availableModels.length > 0) {
          const combinedScript = validItems.map((it) => it.text).join(" ... ");
          const ai = getGenAIClient();

          for (const ttsModel of availableModels) {
            try {
              const response = await ai.models.generateContent({
                model: ttsModel,
                contents: [
                  {
                    role: "user",
                    parts: [
                      {
                        text: combinedScript,
                        speechMetadata: {
                          style,
                        },
                      } as any,
                    ],
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

              if (base64Audio && base64Audio.length > 200) {
                const rawBuffer = Buffer.from(base64Audio, "base64");
                const slicedWavs = sliceContinuousPcmIntoSceneWavs(
                  rawBuffer,
                  validItems.map((it) => it.text),
                  24000
                );

                const resultsBySceneId: Record<string, { audioDataUrl: string; engine: string }> = {};
                validItems.forEach((it, idx) => {
                  resultsBySceneId[it.id] = {
                    audioDataUrl: slicedWavs[idx],
                    engine: "gemini-single-pass",
                  };
                });

                res.json({
                  resultsBySceneId,
                  engineUsed: "gemini-single-pass",
                });
                return;
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
                  Date.now() + (isDailyQuota ? 30 * 60 * 1000 : 65 * 1000);
              }
            }
          }
        }
      }

      // Attempt 2: 100% Uniform Standard-Locked Stream across EVERY scene in the video (Never mixes engines!)
      const resultsBySceneId: Record<string, { audioDataUrl: string; engine: string }> = {};
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
          if (ttsAudioCache.size > 150) {
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

