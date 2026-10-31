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
  Download,
  Maximize2,
} from 'lucide-react';
import { StoryScene, VaultItem } from '../types';
import {
  AspectRatioOption,
  buildFullFrameImagePrompt,
  buildFullFrameVideoPrompt,
  buildStandardKlingDrawPrompt,
  downloadFullFrameImageForGrok,
  generateScriptedVideoMotionPrompt,
  getAspectRatioSpec,
  getChronologicalStageInfo,
  KLING_NEGATIVE_PROMPT,
  VideoScriptStyle,
} from '../utils/fullFrameHelper';

interface ScriptPromptStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  scenes: StoryScene[];
  vaultItems: VaultItem[];
  aspectRatio?: AspectRatioOption;
  onParseRawScript: (
    rawScript: string,
    lang: 'en' | 'vi',
    runAutoPilotAfter?: boolean,
    characterHint?: string,
    targetSceneCount?: number
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
  aspectRatio = '3:4',
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
  >('checklist');
  const [sceneFilter, setSceneFilter] = useState<'all' | 'missing-photo' | 'has-photo'>('all');
  const [rawScriptInput, setRawScriptInput] = useState(
    `A circus performer. A nightclub singer. A king. A gunfighter. Yul Brynner lived more lives than most men could ever dream of.\n\nThe shaved head, the piercing eyes, that slow confident walk. He didn't need to raise his voice. He just stood there, and the scene was his.\n\nBut his story didn't begin in Hollywood. It began far away, in Vladivostok, Russia, on July eleventh, nineteen twenty.\n\nAs a boy, he moved to China, then to France. New countries, new languages, and a restless young heart that never stood still.`
  );
  const [scriptCharacterHint, setScriptCharacterHint] = useState('Yul Brynner');
  const [scriptLang, setScriptLang] = useState<'en' | 'vi'>('en');
  const [pasteSceneCount, setPasteSceneCount] = useState<number>(14);
  const [chatGptCharacter, setChatGptCharacter] = useState('Clint Eastwood');
  const [chatGptLang, setChatGptLang] = useState<'en' | 'vi'>('en');
  const [chatGptSceneCount, setChatGptSceneCount] = useState<number>(14);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [downloadingSceneId, setDownloadingSceneId] = useState<string | null>(null);

  const ratioSpec = getAspectRatioSpec(aspectRatio);

  // Proxy status state
  const [proxyKeyConfigured, setProxyKeyConfigured] = useState<boolean>(false);
  const [isTestingProxy, setIsTestingProxy] = useState<boolean>(false);
  const [isFetchingModels, setIsFetchingModels] = useState<boolean>(false);
  const [availableModels, setAvailableModels] = useState<string[]>([
    'claude-sonnet-4-6',
    'claude-haiku-4-5',
    'claude-opus-4-6',
    'gpt-6-astra',
    'gpt-6-sol',
    'gpt-6-luna',
    'gpt-6.1-sol',
    'gpt-5.6-sol',
    'deepseek-v4-pro',
    'deepseek-v4-flash',
    'gemini-3-8-flash',
  ]);
  const [proxyTestResult, setProxyTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const sceneFileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const batchFileInputRef = useRef<Record<string, HTMLInputElement | null> | any>(null);

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

  const handleDownloadFullFrameForGrok = async (
    scene: StoryScene,
    mediaUrl: string | undefined,
    mediaKind: 'image' | 'video' | 'audio' | undefined
  ) => {
    if (!mediaUrl || downloadingSceneId) return;
    setDownloadingSceneId(scene.id);
    try {
      await downloadFullFrameImageForGrok(
        mediaUrl,
        mediaKind,
        aspectRatio,
        `Canh-${String(scene.order).padStart(2, '0')}-KlingAI`
      );
    } finally {
      setDownloadingSceneId(null);
    }
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
            data.models.find((m: string) => m.includes('claude-sonnet-4-6')) ||
            data.models.find((m: string) => m.includes('claude-')) ||
            data.models.find((m: string) => m.includes('gpt-')) ||
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
        if (data.switchedModel && data.switchedModel !== proxyModel) {
          onChangeProxyModel(data.switchedModel);
        }
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

    const vidCount =
      chatGptSceneCount >= 20
        ? '6'
        : chatGptSceneCount >= 18
        ? '5-6'
        : chatGptSceneCount >= 16
        ? '5'
        : chatGptSceneCount >= 14
        ? '4-5'
        : '3-4';
    const quoteCount = chatGptSceneCount >= 18 ? '3-4' : chatGptSceneCount >= 14 ? '3' : '2';
    const imgCount =
      chatGptSceneCount >= 20
        ? '9-10'
        : chatGptSceneCount >= 18
        ? '8-9'
        : chatGptSceneCount >= 16
        ? '7-8'
        : chatGptSceneCount >= 14
        ? '6-7'
        : chatGptSceneCount >= 12
        ? '5-6'
        : '4-5';

    return `Tôi đang sản xuất video kể chuyện (${ratioSpec.labelVi}, dạng ${chatGptSceneCount} phân cảnh) chuẩn kênh "Life Legends" bằng bộ 3 công cụ: ChatGPT Pro (viết kịch bản & vẽ ảnh), Kling AI (tạo video chuyển động Image-to-Video không chặn người nổi tiếng), và LegendCut Studio (tự động ghép phim, đọc thuyết minh đồng nhất & làm phụ đề vàng + khóa cố định Logo kết LIFE LEGENDS - HM).

Hãy viết kịch bản tối ưu hóa công sức nhất (${chatGptSceneCount} phân cảnh) về nhân vật: "${chatGptCharacter}".
${langNote}

QUY TẮC TỐI ƯU HÓA & KỊCH BẢN CHUYỂN ĐỘNG KLING AI 3 NHỊP FULL KHUNG (${ratioSpec.ratio} - ${ratioSpec.width}x${ratioSpec.height}px):
1. Trong ${chatGptSceneCount} phân cảnh:
   - Chỉ dùng ĐÚNG ${vidCount} cảnh là [CẦN VIDEO - Tạo bằng Kling AI Image-to-Video]: Cảnh #01 (Mở đầu gây ấn tượng), các cảnh cao trào giữa video, và Cảnh áp chót (Kết thúc cảm xúc). Mỗi cảnh Video phải có:
     + Prompt Ảnh Gốc Full Khung (${ratioSpec.ratio}, ${ratioSpec.width}x${ratioSpec.height}px, tràn viền 100%, không viền đen).
     + Prompt Chuyển Động Kling AI (Image-to-Video) viết theo KỊCH BẢN DIỄN XUẤT 3 NHỊP THỜI GIAN và KHÔNG nhắc tên người nổi tiếng trong câu lệnh video để tránh bộ lọc (chỉ gọi là "the subject in the reference frame" + mô tả ngoại hình/trang phục): "[Kling AI I2V - Lock Reference Face Identity] [0-2s Opening Beat]: tư thế mở đầu từ ảnh gốc & bối cảnh -> [2-4s Story Action & Speech]: giữ nguyên 100% khuôn mặt từ ảnh gốc, hành động tương tác cụ thể, biểu cảm & cử động môi khớp lời thoại -> [4-6s Camera Control & Climax]: chuyển động máy quay Kling dolly push-in & ánh sáng cảm xúc".
   - ${imgCount} cảnh là [CẦN ẢNH TĨNH - Full Khung ${ratioSpec.ratio}]: Ảnh chân dung cổ điển tràn viền ${ratioSpec.width}x${ratioSpec.height}px.
   - ${quoteCount} cảnh là [THẺ CHỮ ĐEN - Quote Intertitle] và 1 cảnh cuối (#${chatGptSceneCount}) là [LOGO KẾT CỐ ĐỊNH - LIFE LEGENDS (HM)] (App của tôi tự động dựng 100%).
2. Ở cuối câu trả lời, hãy gom riêng cho tôi:
   - DANH SÁCH ${vidCount} PROMPT KỊCH BẢN CHUYỂN ĐỘNG KLING AI 3 NHỊP (Chuẩn Người Nổi Tiếng) + ẢNH GỐC FULL KHUNG ${ratioSpec.ratio} (${ratioSpec.width}x${ratioSpec.height}px, ${ratioSpec.arTag}) bằng Tiếng Anh để tôi copy làm 1 lượt trên Kling AI.
   - Và hãy hỏi tôi: "Bạn có muốn tôi (ChatGPT Pro) vẽ luôn bộ ảnh gốc Full Khung tỷ lệ ${ratioSpec.ratio} (${ratioSpec.width}x${ratioSpec.height}px) ngay bây giờ không?"`;
  };

  const copyOnlyGrokVideoPrompts = () => {
    const videoScenes = scenes.filter((s) => s.sceneType === 'video');
    const text = videoScenes
      .map((sc) => {
        const fullImgPrompt = buildFullFrameImagePrompt(
          sc.imagePrompt || sc.visualPrompt,
          aspectRatio
        );
        const fullVidPrompt = buildFullFrameVideoPrompt(
          sc.videoMotionPrompt,
          sc.imagePrompt || sc.visualPrompt,
          aspectRatio,
          sc.narrationText
        );
        return (
          `[CẢNH VIDEO KLING AI #${String(sc.order).padStart(2, '0')} - ${sc.title} | KHUNG HÌNH FULL: ${ratioSpec.ratio} (${ratioSpec.width}x${ratioSpec.height}px)]\n` +
          `• 1. Prompt Tạo Ảnh Gốc Full Khung (Dùng làm ảnh đầu vào Start Frame cho Kling AI Image-to-Video):\n${fullImgPrompt}\n\n` +
          `• 2. Prompt Tạo Chuyển Động Kling AI (Chuẩn Người Nổi Tiếng - Giữ 100% Mặt Thật):\n${fullVidPrompt}\n\n` +
          `• 3. Negative Prompt Kling AI (Dán vào ô Negative Prompt):\n${KLING_NEGATIVE_PROMPT}\n\n` +
          `• Lời thoại trong cảnh (${sc.durationSec}s): "${sc.narrationText}"`
        );
      })
      .join('\n\n==================================================\n\n');

    copyToClipboard(text, 'copy-grok-only');
  };

  const copyOnlyChatGptImagePrompts = () => {
    const imgScenes = scenes.filter((s) => s.sceneType === 'image' || s.sceneType === 'video');
    const header = `Hãy vẽ lần lượt cho tôi các bức ảnh FULL KHUNG HÌNH tỷ lệ ${ratioSpec.ratio} (${ratioSpec.width}x${ratioSpec.height}px, tràn viền 100% edge-to-edge full-bleed, tuyệt đối không có viền đen hay khung bo) theo danh sách phân cảnh dưới đây:\n\n`;
    const body = imgScenes
      .map((sc) => {
        const fullImgPrompt = buildFullFrameImagePrompt(
          sc.imagePrompt || sc.visualPrompt,
          aspectRatio
        );
        return `Ảnh Cảnh #${String(sc.order).padStart(2, '0')} (${
          sc.sceneType === 'video'
            ? `Ảnh Gốc Full Khung ${ratioSpec.ratio} để đưa vào Kling AI tạo Video`
            : `Ảnh Tĩnh Full Khung ${ratioSpec.ratio}`
        }):\n${fullImgPrompt}`;
      })
      .join('\n\n');

    copyToClipboard(header + body, 'copy-chatgpt-images');
  };

  const videoScenesCount = scenes.filter((s) => s.sceneType === 'video').length;
  const imageScenesCount = scenes.filter((s) => s.sceneType === 'image').length;
  const quoteScenesCount = scenes.filter((s) => s.sceneType === 'quote').length;
  const visualScenesList = scenes.filter(
    (s) => s.sceneType === 'video' || s.sceneType === 'image'
  );
  const missingRealPhotoScenes = visualScenesList.filter((s) => s.hasRealPhoto === false);
  const verifiedRealPhotoScenes = visualScenesList.filter((s) => s.hasRealPhoto !== false);

  const copyMissingRealPhotoKlingPrompts = () => {
    const targetList =
      missingRealPhotoScenes.length > 0 ? missingRealPhotoScenes : visualScenesList;
    const header =
      `DANH SÁCH PROMPT CHUẨN KLING AI THEO THỨ TỰ MƯỢT MÀ (#01 -> #${String(scenes.length).padStart(2, '0')})\n` +
      `(Dành cho ${targetList.length} phân cảnh chưa có ảnh thật trên mạng — tuyệt đối không lấy ảnh lung tung, bạn chỉ cần copy Prompt chuẩn bên dưới để vẽ Ảnh/Video trên Kling AI hoặc ChatGPT Pro):\n\n`;

    const body = targetList
      .map((sc) => {
        if (sc.klingStandardPrompt) return sc.klingStandardPrompt;
        const pack = buildStandardKlingDrawPrompt({
          order: sc.order,
          totalScenes: scenes.length,
          characterName: scriptCharacterHint || chatGptCharacter || sc.title,
          title: sc.title,
          narrationText: sc.narrationText,
          rawImagePrompt: sc.imagePrompt || sc.visualPrompt,
          rawVideoPrompt: sc.videoMotionPrompt,
          sceneType: sc.sceneType,
          ratio: aspectRatio,
        });
        return pack.combinedBlock;
      })
      .join('\n\n==================================================\n\n');

    copyToClipboard(header + body, 'copy-missing-kling');
  };

  const [isBatchGeneratingImages, setIsBatchGeneratingImages] = useState<boolean>(false);
  const [batchImageProgress, setBatchImageProgress] = useState<string>('');

  const handleBatchGenerateAllImages = async () => {
    if (isBatchGeneratingImages) return;
    // Prefer drawing only scenes that are missing real photos first, or all visual scenes if all already have photos
    const targetScenes =
      missingRealPhotoScenes.length > 0 ? missingRealPhotoScenes : visualScenesList;
    if (targetScenes.length === 0) return;

    setIsBatchGeneratingImages(true);
    try {
      for (let i = 0; i < targetScenes.length; i++) {
        const sc = targetScenes[i];
        setBatchImageProgress(
          `Đang tự vẽ ảnh Cảnh #${String(sc.order).padStart(2, '0')} (${i + 1}/${targetScenes.length})...`
        );
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
              Trạm Prompt Chuẩn Kling AI (Sắp Xếp Mượt Mà Theo Thứ Tự #01 → #{String(scenes.length).padStart(2, '0')})
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Đã lọc chuẩn <strong>{verifiedRealPhotoScenes.length} cảnh có Ảnh Thật</strong> (không lấy ảnh lung tung) ·{' '}
              <strong className="text-amber-300">
                {missingRealPhotoScenes.length} cảnh chưa có ảnh thật đã tạo sẵn Prompt Chuẩn Kling AI
              </strong>{' '}
              để bạn vẽ theo đúng thứ tự!
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={copyMissingRealPhotoKlingPrompts}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg shadow transition-colors whitespace-nowrap shrink-0"
            >
              {copiedKey === 'copy-missing-kling' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-slate-950" />
                  Đã Copy Prompt Kling ({missingRealPhotoScenes.length || visualScenesList.length} Cảnh) Theo Thứ Tự!
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copy Prompt Chuẩn Kling AI Cho {missingRealPhotoScenes.length > 0 ? `${missingRealPhotoScenes.length} Cảnh Chưa Có Ảnh Thật` : 'Tất Cả Cảnh'}
                </>
              )}
            </button>

            <button
              onClick={handleBatchGenerateAllImages}
              disabled={isBatchGeneratingImages || Boolean(generatingImageSceneId)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 disabled:opacity-50 text-emerald-300 border border-emerald-500/40 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              {isBatchGeneratingImages ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {batchImageProgress || 'Đang tự vẽ ảnh AI...'}
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  {missingRealPhotoScenes.length > 0
                    ? `Tự Vẽ Luôn ${missingRealPhotoScenes.length} Cảnh Thiếu Ảnh (1 Click)`
                    : 'Tự Vẽ Lại Hết Ảnh AI (1 Click)'}
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
                  Đã Copy {videoScenesCount} Prompt Kling AI!
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Gom Riêng {videoScenesCount} Prompt Cho Kling AI Video
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
              2. Bảng Phân Cảnh & Prompt Kling AI / Ảnh ({scenes.length} cảnh)
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
              Thả Tất Cả Video Kling AI & Ảnh Vào 1 Lần (Tự Khớp Cảnh!)
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
            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-amber-500/30 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                    <Maximize2 className="w-3.5 h-3.5 text-amber-400" />
                    Chế Độ Lọc Ảnh Thật Nghiêm Ngặt & Prompt Chuẩn Kling AI Theo Thứ Tự Mượt Mà (#01 → #{String(scenes.length).padStart(2, '0')}):
                  </p>
                  <p className="text-xs text-slate-300">
                    Đoạn nào tìm được <strong>Ảnh Thật chuẩn đúng tên nhân vật</strong> sẽ gắn nhãn xanh <strong className="text-emerald-300">📸 Ảnh Thật Chuẩn</strong>. Đoạn nào trên mạng không có ảnh thật, App <strong>tuyệt đối không lấy ảnh lung tung</strong> mà tạo sẵn <strong className="text-amber-300">🎨 Prompt Chuẩn Kling AI</strong> theo đúng thứ tự thời gian để bạn copy vẽ!
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={copyMissingRealPhotoKlingPrompts}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg shadow transition-colors whitespace-nowrap shrink-0"
                  >
                    {copiedKey === 'copy-missing-kling' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-slate-950" />
                        Đã Copy Tất Cả Prompt Kling Cảnh Thiếu Ảnh!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy Tất Cả Prompt Kling Của Cảnh Chưa Có Ảnh Thật ({missingRealPhotoScenes.length || visualScenesList.length} Cảnh)
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => copyToClipboard(KLING_NEGATIVE_PROMPT, 'global-kling-neg')}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    {copiedKey === 'global-kling-neg' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        Đã Copy Negative Prompt Kling!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-sky-400" />
                        Copy Negative Prompt Kling
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Filter Bar: All Scenes vs Missing Real Photo Scenes vs Verified Real Photo Scenes */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSceneFilter('all')}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg border transition-colors ${
                      sceneFilter === 'all'
                        ? 'bg-amber-500 text-slate-950 border-amber-400'
                        : 'bg-[#0B0F17] text-slate-300 border-slate-700 hover:border-slate-500'
                    }`}
                  >
                    Tất cả theo thứ tự mượt mà ({scenes.length} cảnh)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSceneFilter('missing-photo')}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg border transition-colors ${
                      sceneFilter === 'missing-photo'
                        ? 'bg-amber-500 text-slate-950 border-amber-400'
                        : 'bg-amber-950/40 text-amber-300 border-amber-500/40 hover:bg-amber-900/50'
                    }`}
                  >
                    🎨 Chỉ hiện đoạn CHƯA CÓ ẢNH THẬT cần vẽ Kling AI ({missingRealPhotoScenes.length} đoạn)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSceneFilter('has-photo')}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg border transition-colors ${
                      sceneFilter === 'has-photo'
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                        : 'bg-emerald-950/40 text-emerald-300 border-emerald-500/40 hover:bg-emerald-900/50'
                    }`}
                  >
                    📸 Đoạn ĐÃ CÓ ẢNH THẬT chuẩn ({verifiedRealPhotoScenes.length} đoạn)
                  </button>
                </div>

                <button
                  onClick={() => {
                    scenes.forEach((sc) => {
                      if (sc.sceneType === 'video' || sc.sceneType === 'image') {
                        onUpdateScene(sc.id, { frameStyle: 'full-bleed' });
                      }
                    });
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <Maximize2 className="w-3 h-3" />
                  Đặt Tất Cả Cảnh Tràn Full Khung 100%
                </button>
              </div>
            </div>

            {scenes.map((scene, idx) => {
              const isVisualScene = scene.sceneType === 'video' || scene.sceneType === 'image';
              const isMissingRealPhoto = isVisualScene && scene.hasRealPhoto === false;

              if (sceneFilter === 'missing-photo' && !isMissingRealPhoto) return null;
              if (sceneFilter === 'has-photo' && (!isVisualScene || isMissingRealPhoto)) {
                return null;
              }

              const assignedVaultItem = vaultItems.find((v) => v.id === scene.mediaId);
              const previewUrl = assignedVaultItem?.url || scene.mediaUrl;
              const previewKind = assignedVaultItem?.type || scene.mediaKind;
              const googleImgSearchUrl = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(
                scene.archivalKeywords || `${scene.title} vintage photo`
              )}`;

              const stageInfo = getChronologicalStageInfo(idx + 1, scenes.length);
              const klingStandardPack = isVisualScene
                ? buildStandardKlingDrawPrompt({
                    order: idx + 1,
                    totalScenes: scenes.length,
                    characterName: scriptCharacterHint || chatGptCharacter || scene.title,
                    title: scene.title,
                    narrationText: scene.narrationText,
                    rawImagePrompt: scene.imagePrompt || scene.visualPrompt,
                    rawVideoPrompt: scene.videoMotionPrompt,
                    sceneType: scene.sceneType,
                    ratio: aspectRatio,
                  })
                : null;

              const fullFrameImgPrompt = klingStandardPack
                ? klingStandardPack.klingImagePrompt
                : buildFullFrameImagePrompt(
                    scene.imagePrompt || scene.visualPrompt,
                    aspectRatio
                  );
              const fullFrameVidPrompt = klingStandardPack
                ? klingStandardPack.klingVideoPrompt
                : buildFullFrameVideoPrompt(
                    scene.videoMotionPrompt,
                    scene.imagePrompt || scene.visualPrompt,
                    aspectRatio,
                    scene.narrationText
                  );

              return (
                <div
                  key={scene.id}
                  className={`rounded-xl border p-4 space-y-3 ${
                    isMissingRealPhoto
                      ? 'border-amber-500/50 bg-[#131926]'
                      : 'border-slate-800 bg-[#111827]/90'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-mono-tabular font-bold text-amber-400">
                        CẢNH #{String(idx + 1).padStart(2, '0')}/{String(scenes.length).padStart(2, '0')} ({scene.durationSec}s)
                      </span>
                      {scene.sceneType !== 'outro' && (
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-semibold text-slate-300 border border-slate-700">
                          {stageInfo.stageVi}
                        </span>
                      )}
                      <span aria-hidden="true" className="text-slate-600">
                        ·
                      </span>
                      {scene.sceneType === 'video' && (
                        <span className="text-xs font-bold text-sky-400 flex items-center gap-1">
                          <Film className="w-3.5 h-3.5" />
                          ĐOẠN VIDEO KLING AI ({ratioSpec.ratio})
                        </span>
                      )}
                      {scene.sceneType === 'image' && (
                        <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                          <ImageIcon className="w-3.5 h-3.5" />
                          ĐOẠN ẢNH TĨNH ({ratioSpec.ratio})
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
                          LOGO KẾT CỐ ĐỊNH: LIFE LEGENDS — HM
                        </span>
                      )}

                      {isVisualScene && (
                        isMissingRealPhoto ? (
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/50">
                            🎨 Chưa có ảnh thật — Dùng Prompt Chuẩn Kling AI bên dưới để vẽ
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            📸 Đã có Ảnh Thật chuẩn: {scene.realPhotoTitle || assignedVaultItem?.name || 'Đã xác thực'}
                          </span>
                        )
                      )}
                    </div>

                    {isVisualScene && (
                      <div className="flex flex-wrap items-center gap-2">
                        {klingStandardPack && (
                          <button
                            onClick={() =>
                              copyToClipboard(
                                scene.klingStandardPrompt || klingStandardPack.combinedBlock,
                                `kling-pack-${scene.id}`
                              )
                            }
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/50 rounded-md transition-colors whitespace-nowrap shrink-0"
                          >
                            {copiedKey === `kling-pack-${scene.id}` ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                Đã Copy Prompt Kling Cảnh #{String(idx + 1).padStart(2, '0')}!
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                Copy Trọn Bộ Prompt Kling Cảnh #{String(idx + 1).padStart(2, '0')}
                              </>
                            )}
                          </button>
                        )}
                        {/* 1-Click Generate Full-Frame Image via AI */}
                        <button
                          onClick={() => onGenerateImageViaProxyForScene(scene)}
                          disabled={generatingImageSceneId === scene.id}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 rounded-md transition-colors whitespace-nowrap shrink-0"
                        >
                          {generatingImageSceneId === scene.id ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Đang vẽ Full Khung {ratioSpec.ratio}...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3 h-3" />
                              Vẽ Ảnh Gốc Full Khung ({ratioSpec.ratio})
                            </>
                          )}
                        </button>

                        {/* 1-Click Download Full-Frame Reference Image for Kling AI Video */}
                        {previewUrl && (
                          <button
                            onClick={() =>
                              handleDownloadFullFrameForGrok(scene, previewUrl, previewKind)
                            }
                            disabled={downloadingSceneId === scene.id}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/40 rounded-md transition-colors whitespace-nowrap shrink-0"
                          >
                            {downloadingSceneId === scene.id ? (
                              <>
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Đang xuất {ratioSpec.width}×{ratioSpec.height}...
                              </>
                            ) : (
                              <>
                                <Download className="w-3 h-3" />
                                Tải Ảnh Gốc Full Khung ({ratioSpec.width}×{ratioSpec.height}) Đưa Qua Kling AI
                              </>
                            )}
                          </button>
                        )}

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
                            ? 'Bỏ Video Kling Vào Cảnh Này'
                            : 'Bỏ Ảnh Vào Cảnh Này'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Main Body: Left Full-Frame Visual Preview + Right Script & Full-Frame Prompts */}
                  <div className="flex flex-col md:flex-row gap-4">
                    {isVisualScene && (
                      <div className="w-full md:w-44 shrink-0 flex flex-col gap-2">
                        <div
                          style={{ aspectRatio: ratioSpec.cssAspect }}
                          className="w-full rounded-lg overflow-hidden bg-black border border-slate-700 relative"
                        >
                          {previewUrl ? (
                            previewKind === 'video' ? (
                              <video
                                src={previewUrl}
                                muted
                                playsInline
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <img
                                src={previewUrl}
                                alt={scene.title}
                                className="w-full h-full object-cover"
                              />
                            )
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[11px] text-slate-500 text-center p-2">
                              Chưa có ảnh/video
                            </div>
                          )}
                          <div className="absolute bottom-1.5 left-1.5 right-1.5 px-2 py-0.5 bg-black/75 backdrop-blur-sm rounded text-[10px] font-mono text-amber-300 text-center">
                            Full Khung {ratioSpec.ratio} ({ratioSpec.width}×{ratioSpec.height})
                          </div>
                        </div>

                        {previewUrl && (
                          <button
                            onClick={() =>
                              handleDownloadFullFrameForGrok(scene, previewUrl, previewKind)
                            }
                            className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-semibold bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 rounded-md transition-colors"
                          >
                            <Download className="w-3 h-3 shrink-0" />
                            Tải Ảnh {ratioSpec.ratio} Cho Kling AI
                          </button>
                        )}
                      </div>
                    )}

                    <div className="flex-1 space-y-3 min-w-0">
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

                      {/* Prompts Row for Visual Scenes (Both Video & Image scenes get Full-Frame Image Prompt + Full-Frame Grok Video Prompt) */}
                      {isVisualScene && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                          <div className="p-3 rounded-lg bg-[#090D14] border border-emerald-500/30 space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-emerald-400">
                                1. Prompt Ảnh Gốc Full Khung {ratioSpec.ratio} ({ratioSpec.width}×{ratioSpec.height}px)
                              </span>
                              <button
                                onClick={() =>
                                  copyToClipboard(fullFrameImgPrompt, `img-${scene.id}`)
                                }
                                className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 rounded transition-colors shrink-0"
                              >
                                {copiedKey === `img-${scene.id}` ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-400" />
                                    Đã Copy Full Khung
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    Copy Prompt Ảnh {ratioSpec.ratio}
                                  </>
                                )}
                              </button>
                            </div>
                            <p className="text-xs text-slate-300 font-mono leading-relaxed select-all">
                              {fullFrameImgPrompt}
                            </p>
                          </div>

                          <div className="p-3 rounded-lg bg-[#090D14] border border-sky-500/30 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-sky-400">
                                2. Kịch Bản Video KLING AI 3 Nhịp (Chuẩn Người Nổi Tiếng - {ratioSpec.ratio})
                              </span>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() =>
                                    copyToClipboard(fullFrameVidPrompt, `vid-${scene.id}`)
                                  }
                                  className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 rounded transition-colors"
                                >
                                  {copiedKey === `vid-${scene.id}` ? (
                                    <>
                                      <Check className="w-3 h-3 text-emerald-400" />
                                      Đã Copy Prompt Kling
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3 h-3" />
                                      Copy Prompt Kling {ratioSpec.ratio}
                                    </>
                                  )}
                                </button>
                                <button
                                  onClick={() =>
                                    copyToClipboard(KLING_NEGATIVE_PROMPT, `neg-${scene.id}`)
                                  }
                                  title="Copy Negative Prompt cho Kling AI"
                                  className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded transition-colors"
                                >
                                  {copiedKey === `neg-${scene.id}` ? (
                                    <>
                                      <Check className="w-3 h-3 text-emerald-400" />
                                      Đã Copy Negative
                                    </>
                                  ) : (
                                    <span>+Negative</span>
                                  )}
                                </button>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-1">
                              {(
                                [
                                  { id: 'narrative-hook', label: '🎬 Kling Tự sự & Nhép môi' },
                                  { id: 'cinematic-action', label: '🐎 Kling Hành động & Bối cảnh' },
                                  { id: 'emotional-closeup', label: '🌅 Kling Nội tâm & Cận cảnh' },
                                ] as { id: VideoScriptStyle; label: string }[]
                              ).map((preset) => (
                                <button
                                  key={preset.id}
                                  type="button"
                                  onClick={() =>
                                    onUpdateScene(scene.id, {
                                      videoMotionPrompt: generateScriptedVideoMotionPrompt({
                                        title: scene.title,
                                        narrationText: scene.narrationText,
                                        imagePrompt: scene.imagePrompt,
                                        visualPrompt: scene.visualPrompt,
                                        style: preset.id,
                                        ratio: aspectRatio,
                                      }),
                                    })
                                  }
                                  className="px-2 py-0.5 text-[10px] font-medium bg-slate-800/90 hover:bg-sky-500/25 text-sky-200 border border-slate-700 hover:border-sky-500/40 rounded transition-colors"
                                >
                                  {preset.label}
                                </button>
                              ))}
                            </div>

                            <p className="text-xs text-slate-300 font-mono leading-relaxed select-all">
                              {fullFrameVidPrompt}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Tab 3: ChatGPT Pro + Kling AI Master Bridge */}
        {activeTab === 'chatgpt-bridge' && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-4xl mx-auto space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
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
                    Dạng số phân cảnh:
                  </label>
                  <select
                    value={chatGptSceneCount}
                    onChange={(e) => setChatGptSceneCount(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs font-mono-tabular bg-[#111827] border border-slate-700 rounded-lg text-amber-300"
                  >
                    <option value={6}>6 cảnh (~45s)</option>
                    <option value={8}>8 cảnh (~65s)</option>
                    <option value={10}>10 cảnh (~85s)</option>
                    <option value={12}>12 cảnh (~100s)</option>
                    <option value={14}>14 cảnh (~120s)</option>
                    <option value={16}>16 cảnh (~140s)</option>
                    <option value={18}>18 cảnh (~160s)</option>
                    <option value={20}>20 cảnh (~180s)</option>
                  </select>
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
                    Siêu Lệnh (Mega-Prompt {chatGptSceneCount} Cảnh) Tối Ưu Cho ChatGPT Pro & Kling AI:
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
                        setPasteSceneCount(chatGptSceneCount);
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
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
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
                    Dạng số phân cảnh:
                  </label>
                  <select
                    value={pasteSceneCount}
                    onChange={(e) => setPasteSceneCount(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs font-mono-tabular bg-[#111827] border border-slate-700 rounded-lg text-amber-300"
                  >
                    <option value={0}>Tự động theo kịch bản</option>
                    <option value={6}>6 cảnh (~45s)</option>
                    <option value={8}>8 cảnh (~65s)</option>
                    <option value={10}>10 cảnh (~85s)</option>
                    <option value={12}>12 cảnh (~100s)</option>
                    <option value={14}>14 cảnh (~120s)</option>
                    <option value={16}>16 cảnh (~140s)</option>
                    <option value={18}>18 cảnh (~160s)</option>
                    <option value={20}>20 cảnh (~180s)</option>
                  </select>
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
                    await onParseRawScript(
                      rawScriptInput,
                      scriptLang,
                      false,
                      scriptCharacterHint,
                      pasteSceneCount
                    );
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
                      Chỉ Chia Đoạn ({pasteSceneCount > 0 ? `${pasteSceneCount} Cảnh` : 'Tự Động'}) & Xuất Prompt Kling AI / Ảnh
                    </>
                  )}
                </button>

                <button
                  onClick={async () => {
                    await onParseRawScript(
                      rawScriptInput,
                      scriptLang,
                      true,
                      scriptCharacterHint,
                      pasteSceneCount
                    );
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
                      Dựng Tự Động A → Z ({pasteSceneCount > 0 ? `${pasteSceneCount} Cảnh` : 'Tự Động'} + Ảnh + Giọng + Ghép)
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
