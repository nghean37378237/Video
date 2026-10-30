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
    "gpt-6-astra"
  ).trim();
  const hasValidKey = Boolean(apiKey) && apiKey.length > 5;

  return {
    apiKey,
    baseUrl: rawBaseUrl,
    model,
    hasValidKey,
  };
}

async function callIntermediaryChatCompletion(options: {
  systemPrompt: string;
  userPrompt: string;
  customBaseUrl?: string;
  customModel?: string;
}) {
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

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      messages: [
        { role: "system", content: options.systemPrompt },
        { role: "user", content: options.userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `Lỗi từ API trung gian (${response.status}): ${errText.slice(0, 220)}`
    );
  }

  const data: any = await response.json();
  const content: string = data?.choices?.[0]?.message?.content || "";

  // Extract JSON array from markdown code block or raw string
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("Phản hồi từ API trung gian không đúng định dạng mảng JSON.");
  }

  return JSON.parse(jsonMatch[0]);
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
          "Detailed English prompt for AI Video Generation (Grok Video / Sora / Kling / Veo) describing camera motion, subject movement, and lip-sync speaking action if sceneType is 'video'",
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
- "videoMotionPrompt": string (Detailed English motion prompt for Grok Video / Sora / Kling)
- "archivalKeywords": string (English keywords for Google Images search)
- "motionEffect": "zoom-in" | "zoom-out" | "pan-left" | "pan-right" | "static"
- "colorFilter": "bw-vintage" | "sepia" | "color-warm" | "original"
- "frameStyle": "full-bleed" | "rounded-frame" | "cinema-letterbox"
- "durationSec": number (between 5 and 10)`;

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "25mb" }));

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

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: 25,
          messages: [{ role: "user", content: "Reply with: OK" }],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        res.status(400).json({
          ok: false,
          error: `Kết nối thất bại (${response.status}): ${errText.slice(0, 180)}`,
        });
        return;
      }

      const data: any = await response.json();
      const reply = data?.choices?.[0]?.message?.content || "OK";
      res.json({
        ok: true,
        message: `Kết nối TrollLLM / API Trung Gian thành công! Model "${cfg.model}" tại "${cfg.baseUrl}" đã sẵn sàng (Phản hồi: ${reply}).`,
      });
    } catch (error: any) {
      res.status(500).json({
        ok: false,
        error: error?.message || "Lỗi khi kiểm tra kết nối API trung gian.",
      });
    }
  });

  // 0b. Generate Scene Image Automatically (tries Proxy /images/generations if supported, otherwise uses Gemini 3.1 Flash Image 3:4)
  app.post("/api/proxy/generate-image", async (req, res) => {
    try {
      const { prompt, customBaseUrl, imageModel = "dall-e-3" } = req.body || {};
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
              prompt,
              n: 1,
              size: "1024x1024",
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

      // 2. Built-in Automatic 3:4 Documentary Image Generator via Gemini 3.1 Flash Image
      const ai = getGenAIClient();
      const enhancedPrompt = `${prompt}. Authentic 1960s archival documentary photograph, vertical 3:4 portrait composition, natural film grain, dramatic classic lighting, photorealistic historical capture, no text or watermarks.`;

      const genRes = await ai.models.generateContent({
        model: "gemini-3.1-flash-image-preview",
        contents: {
          parts: [{ text: enhancedPrompt }],
        },
        config: {
          imageConfig: {
            aspectRatio: "3:4",
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
        customBaseUrl,
        customModel,
        preferProxy = true,
      } = req.body;

      if (!topic || typeof topic !== "string") {
        res.status(400).json({ error: "Vui lòng nhập tên nhân vật, chủ đề hoặc kịch bản." });
        return;
      }

      const langInstruction =
        language === "en"
          ? "Write narrationText in dramatic, warm English documentary style (exact 'Life Legends' channel style: short punchy sentences, deep emotional storytelling), and translationText in Vietnamese."
          : "Write narrationText in dramatic, warm Vietnamese documentary storytelling style (phong cách kể chuyện truyền cảm hứng sâu sắc như kênh Life Legends), and translationText in English.";

      const prompt = `Create a ${sceneCount}-scene documentary story video script & production prompt sheet about: "${topic}".
${langInstruction}

Follow the exact viral "Life Legends" video formula:
1. Scene 1 MUST be 'video' (a captivating hook where the character speaks/moves or performs a signature action, 5-9 seconds).
2. To minimize manual video work, use ONLY 3 or 4 'video' scenes (for Grok Video generation), 4 or 5 'image' scenes (vintage still photo with 'rounded-frame' border, film dust, and slow Ken Burns zoom), and ${
        includeQuotes
          ? "2 'quote' intertitle scenes (pitch-black screen with centered white italic text at major turning points in the story)"
          : "visual scenes"
      }.
3. Final scene MUST be 'outro' (closing crest "${channelTitle} — ${channelSubtitle}").
4. For every 'video' and 'image' scene, provide a high-detail English 'imagePrompt' (3:4 vertical portrait, period-accurate archival photography) AND a 'videoMotionPrompt' (for Grok Video describing the exact motion/lip-sync).`;

      const proxyCfg = getProxyConfig(customBaseUrl, customModel);

      if (preferProxy && proxyCfg.hasValidKey) {
        try {
          const proxyScenes = await callIntermediaryChatCompletion({
            systemPrompt: `You are an expert documentary scriptwriter for the 'Life Legends' channel. ${JSON_SCHEMA_INSTRUCTION_FOR_PROXY}`,
            userPrompt: prompt,
            customBaseUrl,
            customModel,
          });
          res.json({ scenes: proxyScenes, usedProvider: `API Trung Gian (${proxyCfg.model})` });
          return;
        } catch (proxyErr: any) {
          console.warn("Proxy API failed, falling back to Gemini:", proxyErr?.message);
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
      console.error("Story generation error:", error);
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
        channelTitle = "LIFE LEGENDS",
        channelSubtitle = "THEIR LEGACY. YOUR INSPIRATION.",
        customBaseUrl,
        customModel,
        preferProxy = true,
      } = req.body;

      if (!rawScript || typeof rawScript !== "string") {
        res.status(400).json({ error: "Vui lòng dán nội dung kịch bản cần phân tích." });
        return;
      }

      const prompt = `You are a senior documentary video director for the "Life Legends" channel.
The user has provided the following script/story text:
"""
${rawScript}
"""

Break this script down into sequential scenes (each 12-28 words of narration, keeping the user's core script faithfully) and decide for EACH segment whether the user should provide:
- 'video' (CẦN VIDEO GROK: use for only 3-4 key scenes like the opening hook, mid-story action, and closing shot)
- 'image' (CẦN ẢNH TĨNH: archival portrait with rounded vintage border 'rounded-frame' and Ken Burns zoom)
- 'quote' (THẺ CHỮ ĐEN: 2-3 dramatic turning-point sentences rendered as white italic text on a pitch-black screen — no image/video needed)
- 'outro' (Final scene: "${channelTitle} - ${channelSubtitle}" brand crest)

For every scene, generate:
1. 'visualPrompt' in Vietnamese clearly stating "CẦN VIDEO:" or "CẦN ẢNH TĨNH:" or "THẺ CHỮ ĐEN TỰ ĐỘNG".
2. 'imagePrompt' in English (ready to copy into ChatGPT Pro / Midjourney, 3:4 portrait aspect ratio).
3. 'videoMotionPrompt' in English (ready to copy into Grok Video to animate the image into a video clip).
4. 'archivalKeywords' in English for searching real historical photos/clips.
5. Both English and Vietnamese text in 'narrationText' and 'translationText' (primary language: ${language}).`;

      const proxyCfg = getProxyConfig(customBaseUrl, customModel);

      if (preferProxy && proxyCfg.hasValidKey) {
        try {
          const proxyScenes = await callIntermediaryChatCompletion({
            systemPrompt: `You are an expert documentary director for the 'Life Legends' channel. ${JSON_SCHEMA_INSTRUCTION_FOR_PROXY}`,
            userPrompt: prompt,
            customBaseUrl,
            customModel,
          });
          res.json({ scenes: proxyScenes, usedProvider: `API Trung Gian (${proxyCfg.model})` });
          return;
        } catch (proxyErr: any) {
          console.warn("Proxy API parse failed, falling back to Gemini:", proxyErr?.message);
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

  // 3. Auto-Fetch Real Historical Archival Photos from Wikimedia Commons
  app.post("/api/archival/fetch-photos", async (req, res) => {
    try {
      const { query, limit = 8 } = req.body;
      if (!query || typeof query !== "string") {
        res.status(400).json({ error: "Vui lòng nhập tên nhân vật cần tìm ảnh tư liệu." });
        return;
      }

      const cleanQuery = query
        .replace(/[—–-].*$/, "")
        .replace(/\(.*?\)/g, "")
        .trim()
        .slice(0, 50);

      const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
        `filetype:bitmap ${cleanQuery}`
      )}&gsrnamespace=6&gsrlimit=${Math.min(
        15,
        Number(limit) + 4
      )}&prop=imageinfo&iiprop=url|dimensions|mime&iiurlwidth=760&format=json`;

      const wikiRes = await fetch(searchUrl, {
        headers: {
          "User-Agent": "LegendCutStudio/1.0 (Documentary Video Assembler; contact@example.com)",
        },
      });

      if (!wikiRes.ok) {
        throw new Error(`Wikimedia search status ${wikiRes.status}`);
      }

      const wikiData: any = await wikiRes.json();
      const pages = wikiData?.query?.pages ? Object.values(wikiData.query.pages) : [];

      const photos: {
        title: string;
        dataUrl: string;
        width: number;
        height: number;
      }[] = [];

      for (const page of pages as any[]) {
        if (photos.length >= limit) break;
        const info = page?.imageinfo?.[0];
        const thumbUrl = info?.thumburl || info?.url;
        const mime = info?.mime || "image/jpeg";
        if (!thumbUrl || (!mime.includes("jpeg") && !mime.includes("png"))) continue;

        try {
          const imgRes = await fetch(thumbUrl, {
            headers: {
              "User-Agent":
                "LegendCutStudio/1.0 (Documentary Video Assembler; contact@example.com)",
            },
          });
          if (!imgRes.ok) continue;
          const arrayBuffer = await imgRes.arrayBuffer();
          const base64 = Buffer.from(arrayBuffer).toString("base64");
          const contentType = imgRes.headers.get("content-type") || "image/jpeg";
          const cleanTitle = String(page.title || "Archival Photo")
            .replace(/^File:/i, "")
            .replace(/\.[^/.]+$/, "")
            .replace(/_/g, " ");

          photos.push({
            title: cleanTitle.slice(0, 42),
            dataUrl: `data:${contentType};base64,${base64}`,
            width: info.thumbwidth || info.width || 720,
            height: info.thumbheight || info.height || 960,
          });
        } catch {
          // Skip individual image failure
        }
      }

      res.json({ photos, searchedQuery: cleanQuery });
    } catch (error: any) {
      console.error("Archival photo fetch error:", error);
      res.status(500).json({
        error: error?.message || "Không thể tự động tải ảnh tư liệu lịch sử.",
        photos: [],
      });
    }
  });

  // 4. Generate Documentary TTS Voiceover
  app.post("/api/tts/generate", async (req, res) => {
    try {
      const {
        text,
        voiceName = "Charon",
        style = "Deep, warm, calm documentary storyteller voice with emotional gravitas",
      } = req.body;

      if (!text || typeof text !== "string") {
        res.status(400).json({ error: "Thiếu nội dung lời thoại cần tạo giọng đọc." });
        return;
      }

      const ai = getGenAIClient();
      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash-lite-tts",
        contents: [
          {
            role: "user",
            parts: [
              {
                text,
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

      const base64Audio =
        response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

      if (!base64Audio) {
        res.status(500).json({ error: "Không nhận được dữ liệu âm thanh từ mô hình TTS." });
        return;
      }

      res.json({
        audioDataUrl: `data:audio/wav;base64,${base64Audio}`,
      });
    } catch (error: any) {
      console.error("TTS generation error:", error);
      res.status(500).json({
        error: error?.message || "Lỗi khi tạo giọng đọc AI.",
      });
    }
  });

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

startServer();
