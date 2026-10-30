import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Copy,
  Check,
  Wand2,
  Film,
  Image as ImageIcon,
  Quote,
  Award,
  Upload,
  Sparkles,
  FileText,
  Loader2,
  MessageSquareCode,
  Zap,
  ExternalLink,
  FolderUp,
  Server,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { StoryScene, VaultItem } from '../types';

interface ScriptPromptStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  scenes: StoryScene[];
  vaultItems: VaultItem[];
  onParseRawScript: (
    rawScript: string,
    lang: 'en' | 'vi',
    runAutoPilotAfter?: boolean,
    characterHint?: string
  ) => Promise<void>;
  isParsingScript: boolean;
  onGenerateAIStory: (topic: string, lang: 'vi' | 'en', sceneCount: number) => Promise<void>;
  isGeneratingStory: boolean;
  onUploadFileForScene: (sceneId: string, file: File) => Promise<void>;
  onSmartBatchUploadFiles: (files: FileList) => Promise<void>;
  onUpdateScene: (sceneId: string, patch: Partial<StoryScene>) => void;
  isRunningAutoPilot: boolean;
  autoPilotStepText: string;
  proxyBaseUrl: string;
  onChangeProxyBaseUrl: (url: string) => void;
  proxyModel: string;
  onChangeProxyModel: (model: string) => void;
  onGenerateImageViaProxyForScene: (scene: StoryScene) => Promise<void>;
  generatingImageSceneId: string | null;
}

export const ScriptPromptStudioModal: React.FC<ScriptPromptStudioModalProps> = ({
  isOpen,
  onClose,
  scenes,
  vaultItems,
  onParseRawScript,
  isParsingScript,
  onGenerateAIStory,
  isGeneratingStory,
  onUploadFileForScene,
  onSmartBatchUploadFiles,
  onUpdateScene,
  isRunningAutoPilot,
  autoPilotStepText,
  proxyBaseUrl,
  onChangeProxyBaseUrl,
  proxyModel,
  onChangeProxyModel,
  onGenerateImageViaProxyForScene,
  generatingImageSceneId,
}) => {
  const [activeTab, setActiveTab] = useState<
    'checklist' | 'proxy-api' | 'chatgpt-bridge' | 'paste-script'
  >('proxy-api');
  const [rawScriptInput, setRawScriptInput] = useState(
    `A circus performer. A nightclub singer. A king. A gunfighter. Yul Brynner lived more lives than most men could ever dream of.\n\nThe shaved head, the piercing eyes, that slow confident walk. He didn't need to raise his voice. He just stood there, and the scene was his.\n\nBut his story didn't begin in Hollywood. It began far away, in Vladivostok, Russia, on July eleventh, nineteen twenty.\n\nAs a boy, he moved to China, then to France. New countries, new languages, and a restless young heart that never stood still.`
  );
  const [scriptCharacterHint, setScriptCharacterHint] = useState('Yul Brynner');
  const [scriptLang, setScriptLang] = useState<'en' | 'vi'>('en');
  const [chatGptCharacter, setChatGptCharacter] = useState('Clint Eastwood');
  const [chatGptLang, setChatGptLang] = useState<'en' | 'vi'>('en');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Proxy status state
  const [proxyKeyConfigured, setProxyKeyConfigured] = useState<boolean>(false);
  const [isTestingProxy, setIsTestingProxy] = useState<boolean>(false);
  const [isFetchingModels, setIsFetchingModels] = useState<boolean>(false);
  const [availableModels, setAvailableModels] = useState<string[]>([
    'gpt-6-astra',
    'gpt-6-sol',
    'gpt-6-luna',
    'gpt-6.1-sol',
    'gpt-6.1-terra',
    'gpt-5.6-sol',
    'claude-sonnet-4-6',
    'claude-opus-4-6',
    'deepseek-v4-pro',
    'deepseek-v4-flash',
    'gemini-3-8-flash',
  ]);
  const [proxyTestResult, setProxyTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const sceneFileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const batchFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/proxy/status')
      .then((r) => r.json())
      .then((data) => {
        setProxyKeyConfigured(Boolean(data.configured));
        if (data.baseUrl && !proxyBaseUrl) onChangeProxyBaseUrl(data.baseUrl);
        if (data.model && !proxyModel) onChangeProxyModel(data.model);
      })
      .catch(() => {});
  }, [isOpen]);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleFetchProxyModels = async () => {
    setIsFetchingModels(true);
    setProxyTestResult(null);
    try {
      const res = await fetch('/api/proxy/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customBaseUrl: proxyBaseUrl }),
      });
      const data = await res.json();
      if (res.ok && data.ok && Array.isArray(data.models)) {
        setProxyKeyConfigured(true);
        setAvailableModels(data.models);
        if (data.models.length > 0 && !data.models.includes(proxyModel)) {
          const preferred =
            data.models.find((m: string) => m.includes('gpt-6-astra')) ||
            data.models.find((m: string) => m.includes('gpt-')) ||
            data.models.find((m: string) => m.includes('claude-')) ||
            data.models[0];
          if (preferred) onChangeProxyModel(preferred);
        }
        setProxyTestResult({
          ok: true,
          message: `Đã tải thành công ${data.models.length} model từ https://chat.trollllm.xyz/v1! Hãy bấm chọn model bên dưới.`,
        });
      } else {
        setProxyTestResult({
          ok: false,
          message: data.error || 'Không thể lấy danh sách model.',
        });
      }
    } catch (err: any) {
      setProxyTestResult({
        ok: false,
        message: err?.message || 'Lỗi kết nối máy chủ.',
      });
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleTestProxyConnection = async () => {
    setIsTestingProxy(true);
    setProxyTestResult(null);
    try {
      const res = await fetch('/api/proxy/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customBaseUrl: proxyBaseUrl,
          customModel: proxyModel,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setProxyKeyConfigured(true);
        setProxyTestResult({ ok: true, message: data.message });
      } else {
        setProxyTestResult({
          ok: false,
          message: data.error || 'Không thể kết nối API trung gian.',
        });
      }
    } catch (err: any) {
      setProxyTestResult({
        ok: false,
        message: err?.message || 'Lỗi kết nối máy chủ.',
      });
    } finally {
      setIsTestingProxy(false);
    }
  };

  const buildChatGptPrompt = () => {
    const langNote =
      chatGptLang === 'en'
        ? 'Viết lời bình (Narration) bằng Tiếng Anh chuẩn giọng kể chuyện trầm ấm, câu ngắn gọn giàu nhịp điệu như kênh "Life Legends", kèm dịch nghĩa Tiếng Việt.'
        : 'Viết lời bình (Narration) bằng Tiếng Việt trầm ấm, giàu cảm xúc điện ảnh như kênh "Life Legends", kèm bản Tiếng Anh.';

    return `Tôi đang sản xuất video kể chuyện dọc (tỷ lệ 3:4, thời lượng ~2.5 phút) chuẩn kênh "Life Legends" bằng bộ 3 công cụ: ChatGPT Pro (viết kịch bản & vẽ ảnh), Grok (tạo video chuyển động), và LegendCut Studio (tự động ghép phim, đọc thuyết minh & làm phụ đề vàng).

Hãy viết kịch bản tối ưu hóa công sức nhất (10 phân cảnh) về nhân vật: "${chatGptCharacter}".
${langNote}

QUY TẮC TỐI ƯU HÓA ĐỂ TÔI ÍT PHẢI LÀM TAY NHẤT:
1. Trong 10 phân cảnh:
   - Chỉ dùng ĐÚNG 3-4 cảnh là [CẦN VIDEO - Tạo bằng Grok]: Cảnh #01 (Mở đầu gây ấn tượng), 1-2 cảnh giữa video, và Cảnh áp chót (Kết thúc cảm xúc).
   - 4-5 cảnh là [CẦN ẢNH TĨNH - Vẽ bằng ChatGPT hoặc tìm Google]: Ảnh chân dung cổ điển (App của tôi sẽ tự động làm hiệu ứng Zoom Ken Burns + Khung bo tròn + Bụi phim nên không cần làm video).
   - 2 cảnh là [THẺ CHỮ ĐEN - Quote Intertitle] và 1 cảnh cuối là [LOGO KẾT - Life Legends] (App của tôi tự động dựng 100%).
2. Ở cuối câu trả lời, hãy gom riêng cho tôi:
   - DANH SÁCH 4 PROMPT TẠO VIDEO GROK (bằng Tiếng Anh ngắn gọn, súc tích chuẩn Grok) để tôi copy làm 1 lượt trên Grok.
   - Và hãy hỏi tôi: "Bạn có muốn tôi (ChatGPT Pro) vẽ luôn 4 bức ảnh tĩnh tỷ lệ 3:4 cổ điển cho các cảnh [CẦN ẢNH TĨNH] ngay bây giờ không?"`;
  };

  const copyOnlyGrokVideoPrompts = () => {
    const videoScenes = scenes.filter((s) => s.sceneType === 'video');
    const text = videoScenes
      .map(
        (sc) =>
          `[CẢNH #${String(sc.order).padStart(2, '0')} - ${sc.title}]\n` +
          `• Prompt Ảnh Gốc (nếu dùng Image-to-Video trên Grok): ${sc.imagePrompt || sc.visualPrompt}\n` +
          `• Prompt Chuyển Động Grok Video: ${sc.videoMotionPrompt || sc.imagePrompt || sc.visualPrompt}\n` +
          `• Lời thoại của cảnh (${sc.durationSec}s): "${sc.narrationText}"`
      )
      .join('\n\n-----------------------------------\n\n');

    copyToClipboard(text, 'copy-grok-only');
  };

  const copyOnlyChatGptImagePrompts = () => {
    const imgScenes = scenes.filter((s) => s.sceneType === 'image' || s.sceneType === 'video');
    const header = `Hãy vẽ lần lượt cho tôi các bức ảnh tỷ lệ dọc 3:4 (phong cách nhiếp ảnh phim tư liệu cổ điển thập niên 1950s-1970s) theo danh sách phân cảnh dưới đây:\n\n`;
    const body = imgScenes
      .map(
        (sc) =>
          `Ảnh Cảnh #${String(sc.order).padStart(2, '0')} (${
            sc.sceneType === 'video'
              ? 'Dùng làm ảnh gốc đưa qua Grok tạo Video'
              : 'Ảnh tĩnh đóng khung bo tròn'
          }):\n${sc.imagePrompt || sc.visualPrompt}`
      )
      .join('\n\n');

    copyToClipboard(header + body, 'copy-chatgpt-images');
  };

  const videoScenesCount = scenes.filter((s) => s.sceneType === 'video').length;
  const imageScenesCount = scenes.filter((s) => s.sceneType === 'image').length;
  const quoteScenesCount = scenes.filter((s) => s.sceneType === 'quote').length;

  const [isBatchGeneratingImages, setIsBatchGeneratingImages] = useState<boolean>(false);
  const [batchImageProgress, setBatchImageProgress] = useState<string>('');

  const handleBatchGenerateAllImages = async () => {
    if (isBatchGeneratingImages) return;
    const targetScenes = scenes.filter((s) => s.sceneType === 'image' || s.sceneType === 'video');
    if (targetScenes.length === 0) return;

    setIsBatchGeneratingImages(true);
    try {
      for (let i = 0; i < targetScenes.length; i++) {
        const sc = targetScenes[i];
        setBatchImageProgress(`Đang tự vẽ ảnh ${i + 1}/${targetScenes.length}...`);
        await onGenerateImageViaProxyForScene(sc);
      }
    } finally {
      setIsBatchGeneratingImages(false);
      setBatchImageProgress('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-6xl h-[90vh] bg-[#0B0F17] border border-slate-700/90 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5 border-b border-slate-800 bg-[#111827]">
          <div>
            <h2 className="text-base font-bold text-slate-100">
              Trạm Kết Nối API Trung Gian (TrollLLM.xyz / YesScale / OpenRouter) & Bảng Phân Cảnh
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Chỉ cần làm <strong>{videoScenesCount} đoạn Video ngắn trên Grok</strong> +{' '}
              <strong>{imageScenesCount} Ảnh tĩnh</strong> · Còn lại{' '}
              {quoteScenesCount + 1} cảnh Chữ Đen & Logo App tự dựng 100%!
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleBatchGenerateAllImages}
              disabled={isBatchGeneratingImages || Boolean(generatingImageSceneId)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              {isBatchGeneratingImages ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {batchImageProgress || 'Đang tự vẽ ảnh AI...'}
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  Tự Vẽ Hết Ảnh AI Ngay Trong App (1 Click)
                </>
              )}
            </button>

            <button
              onClick={copyOnlyGrokVideoPrompts}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/40 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              {copiedKey === 'copy-grok-only' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  Đã Copy {videoScenesCount} Prompt Grok!
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Gom Riêng {videoScenesCount} Prompt Cho Grok Video
                </>
              )}
            </button>

            <button
              onClick={copyOnlyChatGptImagePrompts}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              {copiedKey === 'copy-chatgpt-images' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  Đã Copy Lệnh Vẽ Ảnh Hàng Loạt!
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copy Lệnh Đem Sang Web ChatGPT Pro Vẽ
                </>
              )}
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Mode Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-2.5 border-b border-slate-800 bg-[#0F1623]">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setActiveTab('proxy-api')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'proxy-api'
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-slate-800/80 text-slate-300 hover:text-white'
              }`}
            >
              <Server className="w-3.5 h-3.5" />
              1. Kết Nối API TrollLLM.xyz (Đang Chọn)
            </button>

            <button
              onClick={() => setActiveTab('checklist')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'checklist'
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-slate-800/80 text-slate-300 hover:text-white'
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              2. Bảng Phân Cảnh & Prompt Grok / Ảnh ({scenes.length} cảnh)
            </button>

            <button
              onClick={() => setActiveTab('chatgpt-bridge')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'chatgpt-bridge'
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-slate-800/80 text-slate-300 hover:text-white'
              }`}
            >
              <MessageSquareCode className="w-3.5 h-3.5" />
              3. Copy Lệnh Cho Web ChatGPT Pro
            </button>

            <button
              onClick={() => setActiveTab('paste-script')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'paste-script'
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-slate-800/80 text-slate-300 hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              4. Dán Kịch Bản Có Sẵn → Tự Dựng A-Z
            </button>
          </div>

          <div>
            <input
              ref={batchFileInputRef}
              type="file"
              multiple
              accept="video/*,image/*"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  onSmartBatchUploadFiles(e.target.files);
                }
              }}
              className="hidden"
            />
            <button
              onClick={() => batchFileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg shadow transition-colors whitespace-nowrap shrink-0"
            >
              <FolderUp className="w-4 h-4" />
              Thả Tất Cả Video Grok & Ảnh Vào 1 Lần (Tự Khớp Cảnh!)
            </button>
          </div>
        </div>

        {/* Tab 1: Intermediary Proxy API Configuration & Live Tester */}
        {activeTab === 'proxy-api' && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-4xl mx-auto space-y-5">
              <div className="p-4 rounded-xl bg-[#111827] border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    <Server className="w-4 h-4 text-amber-400" />
                    Cấu Hình Sẵn Cho Trạm Trung Gian `https://chat.trollllm.xyz/v1`
                  </h3>
                  <span
                    className={`text-xs font-semibold flex items-center gap-1.5 ${
                      proxyKeyConfigured ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {proxyKeyConfigured ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Đã nhận OPENAI_API_KEY trong Secrets
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4" />
                        Chưa điền OPENAI_API_KEY trong Secrets
                      </>
                    )}
                  </span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  Đường dẫn cổng API chính thức của TrollLLM là{' '}
                  <strong className="text-amber-300 font-mono">https://chat.trollllm.xyz/v1</strong> (không phải `trollllm.xyz/v1`). Mình đã cập nhật sẵn đường dẫn chuẩn này và danh sách model (`gpt-6-astra`, `gpt-6-sol`, `claude-sonnet-4-6`...) cho bạn bên dưới!
                </p>

                <div className="p-3.5 rounded-lg bg-[#0B0F17] border border-slate-800 space-y-2">
                  <p className="text-xs font-semibold text-amber-400">
                    Bước 1: Đảm bảo trong bảng Secrets tên biến là `OPENAI_API_KEY`
                  </p>
                  <ol className="text-xs text-slate-300 space-y-1.5 list-decimal list-inside">
                    <li>
                      Trong mục <strong>Secrets</strong> của AI Studio: Ô <strong>Name</strong> điền chữ <code className="text-amber-300">OPENAI_API_KEY</code>.
                    </li>
                    <li>
                      Ô <strong>Value</strong>: Giữ nguyên mã <code className="text-amber-300">sk-trollllm-...</code> của bạn.
                    </li>
                  </ol>
                </div>

                {/* Step 2: Select Proxy Provider Base URL & Model */}
                <div className="space-y-3 pt-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-amber-400">
                      Bước 2: Đường Dẫn Chuẩn `https://chat.trollllm.xyz/v1` & Model:
                    </p>
                    <button
                      onClick={handleFetchProxyModels}
                      disabled={isFetchingModels}
                      className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/40 rounded-lg transition-colors"
                    >
                      {isFetchingModels ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Đang tải model từ chat.trollllm.xyz...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          Làm Mới Danh Sách Model Từ TrollLLM
                        </>
                      )}
                    </button>
                  </div>

                  {/* Quick Provider Presets */}
                  <div className="flex flex-wrap gap-2">
                    {[
                      {
                        label: '⭐ TrollLLM.xyz (chat.trollllm.xyz/v1)',
                        url: 'https://chat.trollllm.xyz/v1',
                        model: 'gpt-6-astra',
                      },
                      { label: 'YesScale.io', url: 'https://api.yescale.io/v1', model: 'gpt-4o' },
                      {
                        label: 'OpenRouter.ai',
                        url: 'https://openrouter.ai/api/v1',
                        model: 'openai/gpt-4o',
                      },
                      { label: '302.AI', url: 'https://api.302.ai/v1', model: 'gpt-4o' },
                      { label: 'xAI (Grok API)', url: 'https://api.x.ai/v1', model: 'grok-2-latest' },
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        onClick={() => {
                          onChangeProxyBaseUrl(preset.url);
                          onChangeProxyModel(preset.model);
                        }}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                          proxyBaseUrl === preset.url
                            ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-semibold'
                            : 'bg-[#0B0F17] border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Địa chỉ Base URL chuẩn của TrollLLM:
                      </label>
                      <input
                        type="text"
                        value={proxyBaseUrl}
                        onChange={(e) => onChangeProxyBaseUrl(e.target.value)}
                        placeholder="https://chat.trollllm.xyz/v1"
                        className="w-full px-3 py-2 text-xs font-mono bg-[#0B0F17] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Tên Model trên TrollLLM:
                      </label>
                      <input
                        type="text"
                        value={proxyModel}
                        onChange={(e) => onChangeProxyModel(e.target.value)}
                        placeholder="gpt-6-astra"
                        className="w-full px-3 py-2 text-xs font-mono bg-[#0B0F17] border border-slate-700 rounded-lg text-amber-300 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>

                  {/* If models were fetched from TrollLLM, show clickable chips */}
                  {availableModels.length > 0 && (
                    <div className="p-3 rounded-lg bg-[#0B0F17] border border-slate-800 space-y-2">
                      <p className="text-xs font-semibold text-sky-300">
                        Danh sách Model tài khoản TrollLLM của bạn hỗ trợ (Bấm vào để chọn):
                      </p>
                      <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                        {availableModels.map((m) => (
                          <button
                            key={m}
                            onClick={() => onChangeProxyModel(m)}
                            className={`px-2.5 py-1 text-[11px] font-mono rounded border transition-colors ${
                              proxyModel === m
                                ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                                : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-amber-500/60'
                            }`}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2">
                    <button
                      onClick={handleTestProxyConnection}
                      disabled={isTestingProxy}
                      className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-lg transition-colors"
                    >
                      {isTestingProxy ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Đang kiểm tra kết nối tới {proxyBaseUrl}...
                        </>
                      ) : (
                        <>
                          <Zap className="w-4 h-4 fill-current" />
                          Bước 3: Bấm Kiểm Tra Kết Nối TrollLLM.xyz
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => setActiveTab('checklist')}
                      className="text-xs font-semibold text-amber-400 hover:text-amber-300 underline underline-offset-2"
                    >
                      Sang Bảng Phân Cảnh & Vẽ Ảnh Qua API Trung Gian →
                    </button>
                  </div>

                  {proxyTestResult && (
                    <div
                      className={`p-3 rounded-lg border text-xs ${
                        proxyTestResult.ok
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                          : 'bg-rose-500/15 border-rose-500/40 text-rose-200'
                      }`}
                    >
                      {proxyTestResult.message}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Scene-by-Scene Production Sheet */}
        {activeTab === 'checklist' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-amber-500/30 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-amber-300">
                  Mẹo Bớt Làm Tay 90% Khi Ghép File Từ Grok & ChatGPT / API Trung Gian:
                </p>
                <p className="text-xs text-slate-300">
                  Bạn có thể bấm nút <strong>"Vẽ Ảnh Qua API Trung Gian"</strong> ở từng cảnh, hoặc tải các file Video từ <strong>Grok</strong> và Ảnh về máy rồi bấm nút <strong>"Thả Tất Cả Video Grok & Ảnh Vào 1 Lần"</strong> ở góc trên: App sẽ <strong>tự động đưa các file Video vào đúng các cảnh CẦN VIDEO</strong> và <strong>đưa các file Ảnh vào đúng các cảnh CẦN ẢNH TĨNH</strong>!
                </p>
              </div>
            </div>

            {scenes.map((scene, idx) => {
              const assignedVaultItem = vaultItems.find((v) => v.id === scene.mediaId);
              const isVisualScene = scene.sceneType === 'video' || scene.sceneType === 'image';
              const googleImgSearchUrl = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(
                scene.archivalKeywords || `${scene.title} vintage photo`
              )}`;

              return (
                <div
                  key={scene.id}
                  className="rounded-xl border border-slate-800 bg-[#111827]/90 p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs font-mono-tabular font-bold text-amber-400">
                        CẢNH #{String(idx + 1).padStart(2, '0')} ({scene.durationSec}s)
                      </span>
                      <span aria-hidden="true" className="text-slate-600">
                        ·
                      </span>
                      {scene.sceneType === 'video' && (
                        <span className="text-xs font-bold text-sky-400 flex items-center gap-1">
                          <Film className="w-3.5 h-3.5" />
                          CẦN VIDEO GROK (Tạo 1 clip 5-6s trên Grok hoặc dùng Ảnh tĩnh thay thế)
                        </span>
                      )}
                      {scene.sceneType === 'image' && (
                        <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                          <ImageIcon className="w-3.5 h-3.5" />
                          CHỈ CẦN ẢNH TĨNH (App tự Zoom Ken Burns & Bo viền)
                        </span>
                      )}
                      {scene.sceneType === 'quote' && (
                        <span className="text-xs font-bold text-amber-300 flex items-center gap-1">
                          <Quote className="w-3.5 h-3.5" />
                          THẺ CHỮ ĐEN TỰ ĐỘNG (App tự dựng 100%)
                        </span>
                      )}
                      {scene.sceneType === 'outro' && (
                        <span className="text-xs font-bold text-amber-400 flex items-center gap-1">
                          <Award className="w-3.5 h-3.5" />
                          LOGO KẾT TỰ ĐỘNG (App tự dựng 100%)
                        </span>
                      )}
                    </div>

                    {isVisualScene && (
                      <div className="flex flex-wrap items-center gap-2">
                        {/* 1-Click Generate Image via Intermediary Proxy API (DALL-E 3) */}
                        <button
                          onClick={() => onGenerateImageViaProxyForScene(scene)}
                          disabled={generatingImageSceneId === scene.id}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 rounded-md transition-colors whitespace-nowrap shrink-0"
                        >
                          {generatingImageSceneId === scene.id ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Đang vẽ qua API...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3 h-3" />
                              Vẽ Ảnh Qua API Trung Gian
                            </>
                          )}
                        </button>

                        <a
                          href={googleImgSearchUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0"
                        >
                          <ExternalLink className="w-3 h-3 text-amber-400" />
                          Tìm Ảnh Google
                        </a>

                        <input
                          ref={(el) => {
                            sceneFileInputRefs.current[scene.id] = el;
                          }}
                          type="file"
                          accept="video/*,image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) onUploadFileForScene(scene.id, file);
                          }}
                          className="hidden"
                        />

                        <button
                          onClick={() => sceneFileInputRefs.current[scene.id]?.click()}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md transition-colors whitespace-nowrap shrink-0"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          {assignedVaultItem && assignedVaultItem.sourceTag === 'uploaded'
                            ? `Đã gắn: ${assignedVaultItem.name.slice(0, 14)}`
                            : scene.sceneType === 'video'
                            ? 'Bỏ Video Grok Vào Cảnh Này'
                            : 'Bỏ Ảnh Vào Cảnh Này'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Script Text Row */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="p-2.5 rounded-lg bg-[#0B0F17] border border-slate-800/80">
                      <span className="block text-[11px] font-medium text-slate-400 mb-1">
                        Lời bình Tiếng Anh (Tự động nhảy chữ vàng):
                      </span>
                      <p className="text-xs text-slate-100 leading-relaxed">
                        {scene.narrationText}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-[#0B0F17] border border-slate-800/80">
                      <span className="block text-[11px] font-medium text-slate-400 mb-1">
                        Nghĩa / Lời bình Tiếng Việt:
                      </span>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {scene.translationText || '—'}
                      </p>
                    </div>
                  </div>

                  {/* Prompts Row for Visual Scenes */}
                  {isVisualScene && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-1">
                      <div className="p-3 rounded-lg bg-[#090D14] border border-slate-800 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-emerald-400">
                            Prompt Vẽ Ảnh (Dán vào ChatGPT Pro / Grok Image)
                          </span>
                          <button
                            onClick={() =>
                              copyToClipboard(
                                scene.imagePrompt || scene.visualPrompt || '',
                                `img-${scene.id}`
                              )
                            }
                            className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors"
                          >
                            {copiedKey === `img-${scene.id}` ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                Đã Copy
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                Copy Prompt Ảnh
                              </>
                            )}
                          </button>
                        </div>
                        <p className="text-xs text-slate-300 font-mono leading-relaxed select-all">
                          {scene.imagePrompt || scene.visualPrompt}
                        </p>
                      </div>

                      <div className="p-3 rounded-lg bg-[#090D14] border border-slate-800 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-sky-400">
                            {scene.sceneType === 'video'
                              ? 'Prompt Tạo Video Chuyển Động Trên GROK'
                              : 'Gợi ý Chuyển Động & Từ Khóa Tìm Ảnh Thật'}
                          </span>
                          <button
                            onClick={() =>
                              copyToClipboard(
                                scene.videoMotionPrompt || scene.archivalKeywords || '',
                                `vid-${scene.id}`
                              )
                            }
                            className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors"
                          >
                            {copiedKey === `vid-${scene.id}` ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                Đã Copy
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                Copy Prompt Grok Video
                              </>
                            )}
                          </button>
                        </div>
                        <p className="text-xs text-slate-300 font-mono leading-relaxed select-all">
                          {scene.videoMotionPrompt ||
                            'Dùng ảnh tĩnh — App tự động tạo chuyển động Ken Burns.'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Tab 3: ChatGPT Pro + Grok Master Bridge */}
        {activeTab === 'chatgpt-bridge' && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-4xl mx-auto space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Tên Nhân Vật hoặc Câu Chuyện muốn làm:
                  </label>
                  <input
                    type="text"
                    value={chatGptCharacter}
                    onChange={(e) => setChatGptCharacter(e.target.value)}
                    placeholder="VD: Clint Eastwood, John Wayne, Lý Tiểu Long, Michael Landon..."
                    className="w-full px-3 py-2 text-xs bg-[#111827] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Ngôn ngữ kịch bản:
                  </label>
                  <select
                    value={chatGptLang}
                    onChange={(e) => setChatGptLang(e.target.value as 'en' | 'vi')}
                    className="w-full px-3 py-2 text-xs bg-[#111827] border border-slate-700 rounded-lg text-slate-100"
                  >
                    <option value="en">Tiếng Anh + Dịch Việt</option>
                    <option value="vi">Tiếng Việt + Dịch Anh</option>
                  </select>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#111827] border border-slate-800 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-amber-400">
                    Siêu Lệnh (Mega-Prompt) Tối Ưu Cho ChatGPT Pro & Grok:
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => copyToClipboard(buildChatGptPrompt(), 'chatgpt-prompt')}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg transition-colors"
                    >
                      {copiedKey === 'chatgpt-prompt' ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          Đã Copy! Hãy Dán Vào ChatGPT Pro
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          1. Copy Câu Lệnh Đưa Vào ChatGPT Pro
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => {
                        setScriptCharacterHint(chatGptCharacter);
                        setActiveTab('paste-script');
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded-lg transition-colors"
                    >
                      2. Sang Ô Dán Kịch Bản Từ ChatGPT Pro →
                    </button>
                  </div>
                </div>

                <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed bg-[#0B0F17] p-3.5 rounded-lg border border-slate-800/90 max-h-64 overflow-y-auto select-all">
                  {buildChatGptPrompt()}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Paste Script -> 1-Click Auto Build */}
        {activeTab === 'paste-script' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="max-w-4xl mx-auto space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Tên Nhân Vật Chính (Để App tự động tìm ảnh thật trên mạng điền vào các cảnh):
                  </label>
                  <input
                    type="text"
                    value={scriptCharacterHint}
                    onChange={(e) => setScriptCharacterHint(e.target.value)}
                    placeholder="VD: Clint Eastwood, Yul Brynner, John Wayne..."
                    className="w-full px-3 py-2 text-xs bg-[#111827] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Ngôn ngữ phụ đề & giọng đọc:
                  </label>
                  <select
                    value={scriptLang}
                    onChange={(e) => setScriptLang(e.target.value as 'en' | 'vi')}
                    className="w-full px-3 py-2 text-xs bg-[#111827] border border-slate-700 rounded-lg text-slate-100"
                  >
                    <option value="en">Tiếng Anh (Chuẩn Life Legends)</option>
                    <option value="vi">Tiếng Việt</option>
                  </select>
                </div>
              </div>

              <textarea
                rows={9}
                value={rawScriptInput}
                onChange={(e) => setRawScriptInput(e.target.value)}
                placeholder="Dán nội dung kịch bản vào đây..."
                className="w-full p-4 text-xs bg-[#111827] border border-slate-700 rounded-xl text-slate-100 leading-relaxed focus:outline-none focus:border-amber-500"
              />

              <div className="flex flex-wrap items-center justify-end gap-3">
                <button
                  onClick={async () => {
                    await onParseRawScript(rawScriptInput, scriptLang, false, scriptCharacterHint);
                    setActiveTab('checklist');
                  }}
                  disabled={isParsingScript || isRunningAutoPilot || !rawScriptInput.trim()}
                  className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700 font-semibold text-xs rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  {isParsingScript ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Đang chia đoạn & xuất Prompt...
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4 text-amber-400" />
                      Chỉ Chia Đoạn & Xuất Prompt Grok / Ảnh
                    </>
                  )}
                </button>

                <button
                  onClick={async () => {
                    await onParseRawScript(rawScriptInput, scriptLang, true, scriptCharacterHint);
                    onClose();
                  }}
                  disabled={isParsingScript || isRunningAutoPilot || !rawScriptInput.trim()}
                  className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-lg shadow-md transition-colors whitespace-nowrap shrink-0"
                >
                  {isRunningAutoPilot || isParsingScript ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {autoPilotStepText || 'Đang dựng tự động...'}
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 fill-current" />
                      Dựng Tự Động A → Z Từ Kịch Bản Này (Tìm Ảnh + Giọng Đọc + Ghép Phim)
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
