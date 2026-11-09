import React, { useState } from 'react';
import {
  Film,
  Image as ImageIcon,
  Quote,
  Award,
  ChevronLeft,
  ChevronRight,
  Mic,
  Upload,
  FolderUp,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ArrowLeftRight,
  Search,
  Play,
  Download,
} from 'lucide-react';
import { StoryScene, VaultItem } from '../types';
import { formatSecLabel } from '../utils/frameExtractor';

interface TimelineStripProps {
  scenes: StoryScene[];
  vaultItems: VaultItem[];
  activeSceneId: string;
  onSelectScene: (sceneId: string, startSec: number) => void;
  onMoveScene: (sceneId: string, direction: -1 | 1) => void;
  onSwapSceneMedia?: (sceneIdA: string, sceneIdB: string) => void;
  onBatchSwapVideoImageMedia?: () => void;
  onUpdateScene?: (sceneId: string, patch: Partial<StoryScene>) => void;
  currentTimeSec: number;
  onOpenPromptStudio: () => void;
  onUploadFileForScene?: (sceneId: string, file: File) => void;
  onSmartBatchUploadFiles?: (files: FileList) => void;
  onFetchAndInsertTrimmedActorVideos?: (
    characterQuery?: string,
    desiredCount?: number,
    targetCurrentSceneOnly?: boolean
  ) => Promise<void>;
  isTrimmingRealVideos?: boolean;
  onOpenSceneMediaSearch?: (sceneId: string) => void;
  onQuickCycleSceneMedia?: (sceneId: string) => void;
  onOpenYouTubePicker?: () => void;
}

const ACCEPTED_MEDIA_INPUT =
  'video/*,image/*,.mp4,.mov,.webm,.mkv,.m4v,.avi,.jpg,.jpeg,.png,.webp,.gif,.avif,.heic';

export const TimelineStrip: React.FC<TimelineStripProps> = ({
  scenes,
  vaultItems,
  activeSceneId,
  onSelectScene,
  onMoveScene,
  onSwapSceneMedia,
  onBatchSwapVideoImageMedia,
  onUpdateScene,
  currentTimeSec,
  onOpenPromptStudio,
  onUploadFileForScene,
  onSmartBatchUploadFiles,
  onFetchAndInsertTrimmedActorVideos,
  isTrimmingRealVideos = false,
  onOpenSceneMediaSearch,
  onQuickCycleSceneMedia,
  onOpenYouTubePicker,
}) => {
  const [dragOverSceneId, setDragOverSceneId] = useState<string | null>(null);
  const [swapSourceSceneId, setSwapSourceSceneId] = useState<string | null>(null);
  let runningSec = 0;

  const swapSourceIdx = swapSourceSceneId
    ? scenes.findIndex((s) => s.id === swapSourceSceneId)
    : -1;

  const visualScenes = scenes.filter(
    (s) => s.sceneType === 'video' || s.sceneType === 'image'
  );
  const verifiedRealPhotoScenes = visualScenes.filter(
    (s) => Boolean(s.mediaUrl) && s.hasRealPhoto !== false
  );
  const needsKlingDrawScenes = visualScenes.filter((s) => s.hasRealPhoto === false);

  const videoSceneNumbers = scenes
    .map((s, idx) => (s.sceneType === 'video' ? `#${String(idx + 1).padStart(2, '0')}` : null))
    .filter(Boolean) as string[];

  const imageSceneNumbers = scenes
    .map((s, idx) => (s.sceneType === 'image' ? `#${String(idx + 1).padStart(2, '0')}` : null))
    .filter(Boolean) as string[];

  const missingRealPhotoNumbers = scenes
    .map((s, idx) =>
      (s.sceneType === 'video' || s.sceneType === 'image') && s.hasRealPhoto === false
        ? `#${String(idx + 1).padStart(2, '0')}`
        : null
    )
    .filter(Boolean) as string[];

  const totalSec = scenes.reduce((acc, s) => acc + Math.round(s.durationSec || 5), 0);
  const videoSec = scenes
    .filter((s) => s.sceneType === 'video')
    .reduce((acc, s) => acc + Math.round(s.durationSec || 5), 0);
  const videoSharePercent = totalSec > 0 ? Math.round((videoSec / totalSec) * 100) : 0;

  return (
    <div className="h-48 bg-[#0B0F17] border-t border-slate-800/90 flex flex-col select-none">
      {/* Timeline Header Bar */}
      <div className="flex flex-wrap items-center justify-between px-4 py-1.5 border-b border-slate-800/80 bg-[#111827]/70 gap-1.5">
        <div className="flex items-center gap-2 text-xs text-slate-400 min-w-0">
          <span className="font-semibold text-slate-200 shrink-0">
            Dòng Thời Gian Phân Cảnh ({scenes.length} đoạn · {totalSec}s)
          </span>

          {/* Clear Summary of which segments are VIDEO vs IMAGE */}
          <span
            title={`Các đoạn cần làm Video chuyển động (Kling AI): ${videoSceneNumbers.join(', ') || 'Không có'} — Chiếm ${videoSec}s / ${totalSec}s (${videoSharePercent}% > 1/2 độ dài toàn bộ video)`}
            className="px-2 py-0.5 rounded text-[11px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40 flex items-center gap-1 shrink-0"
          >
            <Film className="w-3 h-3 shrink-0" />
            <span>
              Đoạn VIDEO ({videoSceneNumbers.length} cảnh · {videoSec}s):{' '}
              {videoSceneNumbers.length > 0 ? videoSceneNumbers.slice(0, 6).join(', ') : '0'}
              {videoSceneNumbers.length > 6 ? '...' : ''}
            </span>
          </span>

          <span
            title={`Các đoạn dùng Ảnh tĩnh (Ken Burns): ${imageSceneNumbers.join(', ') || 'Không có'}`}
            className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 shrink-0"
          >
            <ImageIcon className="w-3 h-3 shrink-0" />
            <span>Đoạn ẢNH ({imageSceneNumbers.length})</span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400 font-mono-tabular">
          {swapSourceSceneId && swapSourceIdx >= 0 && (
            <button
              type="button"
              onClick={() => setSwapSourceSceneId(null)}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-sans font-bold whitespace-nowrap shrink-0"
              title="Bấm vào cảnh thứ 2 bên dưới để đổi Video/Ảnh với cảnh này, hoặc bấm vào đây để hủy"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>
                Đang chọn đảo Cảnh #{String(swapSourceIdx + 1).padStart(2, '0')} (Bấm cảnh đích hoặc Hủy)
              </span>
            </button>
          )}

          {onOpenYouTubePicker && (
            <button
              type="button"
              onClick={onOpenYouTubePicker}
              title="Mở kho tìm kiếm Video Thực Tế, YouTube, Shorts, TikTok — chọn riêng từng đoạn thời gian (Start → End) và gán vào đúng Cảnh bạn muốn"
              className="flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-red-600/25 hover:bg-red-600/40 text-red-200 border border-red-500/60 font-sans font-bold transition-colors whitespace-nowrap shrink-0"
            >
              <Search className="w-3.5 h-3.5 text-amber-300" />
              <span>🔍 Tìm &amp; Cắt Video Thực Tế / YouTube</span>
            </button>
          )}

          {onFetchAndInsertTrimmedActorVideos && (
            <>
              <button
                type="button"
                disabled={isTrimmingRealVideos}
                onClick={() => onFetchAndInsertTrimmedActorVideos(undefined, 1, true)}
                title="Chỉ cắt & thay video thật cho đúng 1 Đoạn (Cảnh) bạn đang chọn trên Timeline (không đụng tới các đoạn khác)"
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-violet-500/25 hover:bg-violet-500/35 disabled:opacity-50 text-violet-200 border border-violet-400/50 font-sans font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                <Film className="w-3.5 h-3.5 text-violet-300" />
                <span>✂️ Tự Cắt 1 Video Cho Cảnh Đang Chọn</span>
              </button>

              <button
                type="button"
                disabled={isTrimmingRealVideos}
                onClick={() => onFetchAndInsertTrimmedActorVideos(undefined, 3, false)}
                title="Tự động tìm 3 đoạn video thực tế khác nhau của diễn viên, cắt ngẫu nhiên từng đoạn và chèn vào 3 vị trí ngẫu nhiên bất kỳ trên Timeline"
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-sky-500/20 hover:bg-sky-500/30 disabled:opacity-50 text-sky-300 border border-sky-500/50 font-sans font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                <Film className="w-3.5 h-3.5 text-sky-400" />
                <span>
                  {isTrimmingRealVideos
                    ? '⏳ Đang cắt & chèn...'
                    : '🎲 Tự Lấy & Chèn 3 Video Thật'}
                </span>
              </button>
            </>
          )}

          {onBatchSwapVideoImageMedia && (
            <button
              type="button"
              onClick={onBatchSwapVideoImageMedia}
              title="Đảo chéo vị trí Video và Ảnh giữa các phân cảnh nhưng GIỮ NGUYÊN 100% thứ tự nội dung kịch bản, phụ đề và giọng đọc từ đầu đến cuối"
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/50 font-sans font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-amber-400" />
              <span>Đảo Video ⇄ Ảnh</span>
            </button>
          )}

          {onSmartBatchUploadFiles && (
            <label
              title="Chọn nhiều file Ảnh/Video cùng lúc (tên bất kỳ hoặc đặt tên 1.mp4, 2.png, canh 1.mp4)"
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 font-sans font-semibold cursor-pointer transition-colors whitespace-nowrap shrink-0"
            >
              <FolderUp className="w-3.5 h-3.5" />
              <span>Thay Hàng Loạt Ảnh/Video</span>
              <input
                type="file"
                multiple
                accept={ACCEPTED_MEDIA_INPUT}
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    onSmartBatchUploadFiles(e.target.files);
                    e.target.value = '';
                  }
                }}
                className="hidden"
              />
            </label>
          )}
          <button
            onClick={onOpenPromptStudio}
            className="text-amber-400 hover:text-amber-300 font-sans font-semibold underline underline-offset-2 whitespace-nowrap shrink-0"
          >
            Bảng Prompt
          </button>
          <span aria-hidden="true">·</span>
          <span>
            {formatSecLabel(currentTimeSec)} /{' '}
            {formatSecLabel(scenes.reduce((acc, s) => acc + Math.ceil(s.durationSec || 5), 0))}
          </span>
        </div>
      </div>

      {/* Horizontal Scrollable Storyboard Track */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden px-4 py-2 flex items-stretch gap-2.5">
        {scenes.map((scene, idx) => {
          const cleanDurationSec = Math.ceil(scene.durationSec || 5);
          const startSec = runningSec;
          const endSec = startSec + cleanDurationSec;
          runningSec = endSec;

          const isSelected = scene.id === activeSceneId;
          const isPlayheadHere = currentTimeSec >= startSec && currentTimeSec < endSec;
          const vaultItem = vaultItems.find((v) => v.id === scene.mediaId);

          // Determine actual attached media type (video vs image)
          const hasMedia = Boolean(scene.mediaUrl);
          const actualMediaKind: 'video' | 'image' | undefined = hasMedia
            ? vaultItem?.type === 'video' || scene.mediaKind === 'video'
              ? 'video'
              : 'image'
            : undefined;

          // Is this a visual scene where no verified real photo was found online (so it uses a Kling AI blueprint prompt instead of a random photo)?
          const isMissingRealPhoto =
            (scene.sceneType === 'video' || scene.sceneType === 'image') &&
            scene.hasRealPhoto === false;

          // Is this a VIDEO scene that currently only has a reference/temporary IMAGE attached?
          const isVideoSceneHoldingTempImage =
            scene.sceneType === 'video' &&
            hasMedia &&
            actualMediaKind === 'image' &&
            !isMissingRealPhoto;

          const thumbUrl =
            vaultItem?.thumbnailUrl ||
            (vaultItem?.type === 'image' ? vaultItem.url : undefined) ||
            (scene.mediaKind === 'image' ? scene.mediaUrl : undefined) ||
            (actualMediaKind === 'video' ? scene.characterRefPhotoUrl : undefined);
          const hasVideoPreview =
            !thumbUrl && actualMediaKind === 'video' && Boolean(scene.mediaUrl);

          const attachedFileName = vaultItem?.name
            ? vaultItem.name
            : scene.realPhotoTitle
            ? scene.realPhotoTitle
            : hasMedia && !isMissingRealPhoto
            ? actualMediaKind === 'video'
              ? `Video cảnh #${idx + 1}`
              : `Ảnh thật cảnh #${idx + 1}`
            : null;

          const handleToggleSceneType = (e: React.MouseEvent) => {
            e.stopPropagation();
            if (!onUpdateScene) return;
            if (scene.sceneType === 'video') {
              onUpdateScene(scene.id, { sceneType: 'image' });
            } else if (scene.sceneType === 'image') {
              onUpdateScene(scene.id, { sceneType: 'video' });
            }
          };

          const topAccentBorderClass =
            scene.sceneType === 'video'
              ? 'border-t-[3px] border-t-sky-500'
              : scene.sceneType === 'image'
              ? 'border-t-[3px] border-t-emerald-500'
              : 'border-t-[3px] border-t-amber-500';

          const isVisualScene = scene.sceneType === 'video' || scene.sceneType === 'image';
          const isSwapSource = swapSourceSceneId === scene.id;
          const isSwapTargetCandidate =
            Boolean(swapSourceSceneId) && swapSourceSceneId !== scene.id && isVisualScene;

          return (
            <div
              key={scene.id}
              draggable={isVisualScene}
              onDragStart={(e) => {
                if (!isVisualScene) return;
                e.dataTransfer.setData('text/legendcut-scene-id', scene.id);
              }}
              onClick={() => {
                if (isSwapTargetCandidate && onSwapSceneMedia && swapSourceSceneId) {
                  onSwapSceneMedia(swapSourceSceneId, scene.id);
                  setSwapSourceSceneId(null);
                  return;
                }
                onSelectScene(scene.id, startSec);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverSceneId(scene.id);
              }}
              onDragLeave={() => setDragOverSceneId(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverSceneId(null);
                const draggedSceneId = e.dataTransfer.getData('text/legendcut-scene-id');
                if (
                  draggedSceneId &&
                  draggedSceneId !== scene.id &&
                  isVisualScene &&
                  onSwapSceneMedia
                ) {
                  onSwapSceneMedia(draggedSceneId, scene.id);
                  setSwapSourceSceneId(null);
                  return;
                }
                const file = e.dataTransfer.files?.[0];
                if (file && onUploadFileForScene) {
                  onUploadFileForScene(scene.id, file);
                }
              }}
              className={`group relative w-64 shrink-0 rounded-lg border ${topAccentBorderClass} p-2.5 flex flex-col justify-between cursor-pointer transition-all ${
                isSwapSource
                  ? 'bg-amber-950/60 border-amber-400 ring-2 ring-amber-400/70'
                  : isSwapTargetCandidate
                  ? 'bg-[#172033] border-amber-400/70 hover:border-amber-300'
                  : dragOverSceneId === scene.id
                  ? 'bg-emerald-950/60 border-emerald-400 ring-2 ring-emerald-400/50'
                  : isSelected
                  ? 'bg-[#172033] border-amber-500 shadow-md'
                  : isPlayheadHere
                  ? 'bg-[#131B2E] border-amber-500/50'
                  : 'bg-[#111827] border-slate-800 hover:border-slate-700'
              }`}
            >
              {/* Top Row: Scene Number + STRICT Scene Role Badge (ĐOẠN VIDEO vs ĐOẠN ẢNH) + Duration */}
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-mono-tabular font-bold text-amber-400 shrink-0">
                    #{String(idx + 1).padStart(2, '0')}
                  </span>

                  {(scene.sceneType === 'video' || scene.sceneType === 'image') && (
                    <button
                      type="button"
                      onClick={handleToggleSceneType}
                      title="Bấm để đổi vai trò đoạn này giữa ĐOẠN VIDEO và ĐOẠN ẢNH"
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 border transition-colors shrink-0 ${
                        scene.sceneType === 'video'
                          ? 'bg-sky-500/25 text-sky-200 border-sky-400/60 hover:bg-sky-500/35'
                          : 'bg-emerald-500/25 text-emerald-200 border-emerald-400/60 hover:bg-emerald-500/35'
                      }`}
                    >
                      {scene.sceneType === 'video' ? (
                        <>
                          <Film className="w-3 h-3 shrink-0 text-sky-300" />
                          <span>ĐOẠN VIDEO</span>
                        </>
                      ) : (
                        <>
                          <ImageIcon className="w-3 h-3 shrink-0 text-emerald-300" />
                          <span>ĐOẠN ẢNH</span>
                        </>
                      )}
                      <RefreshCw className="w-2.5 h-2.5 opacity-70" />
                    </button>
                  )}

                  {scene.sceneType === 'quote' && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-[10px] font-bold text-amber-300 flex items-center gap-1 shrink-0">
                      <Quote className="w-3 h-3 shrink-0" />
                      CHỮ ĐEN
                    </span>
                  )}

                  {scene.sceneType === 'outro' && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-[10px] font-bold text-amber-400 flex items-center gap-1 shrink-0">
                      <Award className="w-3 h-3 shrink-0" />
                      LOGO KẾT
                    </span>
                  )}

                  <span
                    className="text-[11px] font-semibold text-slate-200 truncate"
                    title={scene.title}
                  >
                    {scene.title}
                  </span>
                </div>

                <span className="text-[11px] font-mono-tabular font-semibold text-slate-400 shrink-0">
                  {cleanDurationSec}s
                </span>
              </div>

              {/* Status Pill: Clearly states whether Verified Real Photo/Video is attached OR if it provides Image + Prompt for Grok / Kling AI */}
              <div className="mt-1">
                {isMissingRealPhoto ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenPromptStudio();
                    }}
                    title={`Đoạn #${idx + 1} chưa có video thật. Đã cấp sẵn Ảnh Mẫu Nhân Vật & Prompt chuẩn để bạn vẽ video từ Grok hoặc Kling AI!`}
                    className="w-full px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 truncate bg-amber-950/80 hover:bg-amber-900/80 text-amber-200 border border-amber-400/60 transition-colors"
                  >
                    <AlertCircle className="w-3 h-3 shrink-0 text-amber-400" />
                    <span className="truncate">
                      🎨 Ảnh Mẫu + Prompt Vẽ Video (Grok/Kling)
                    </span>
                  </button>
                ) : isVideoSceneHoldingTempImage ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenPromptStudio();
                    }}
                    title={`Đoạn #${idx + 1} chưa có video thật — Đã gắn sẵn Ảnh thật (${attachedFileName}) + Prompt chuẩn để bạn vẽ sau (hoặc bấm "✂️ Chọn & Cắt Video" bên dưới để chọn & cắt video thật chèn vào đây).`}
                    className="w-full px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 truncate bg-sky-950/80 hover:bg-sky-900/80 text-sky-200 border border-sky-400/50 transition-colors text-left"
                  >
                    <Film className="w-3 h-3 shrink-0 text-sky-400" />
                    <span className="font-bold text-amber-300 shrink-0">
                      📸 Ảnh gốc + Prompt vẽ sau:
                    </span>
                    <span className="truncate">{attachedFileName}</span>
                  </button>
                ) : hasMedia ? (
                  <div
                    title={`Đã gắn ${actualMediaKind === 'video' ? 'Video thật' : 'Ảnh thật chuẩn'}: ${attachedFileName}`}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 truncate border ${
                      actualMediaKind === 'video' && typeof scene.videoTrimStartSec === 'number'
                        ? 'bg-emerald-950/80 text-emerald-200 border-emerald-400/60'
                        : actualMediaKind === 'video'
                        ? 'bg-sky-950/70 text-sky-200 border-sky-500/40'
                        : 'bg-emerald-950/70 text-emerald-200 border-emerald-500/40'
                    }`}
                  >
                    <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-400" />
                    {attachedFileName?.startsWith('✂️') ? (
                      <span className="font-bold truncate">{attachedFileName}</span>
                    ) : (
                      <>
                        <span className="font-bold shrink-0">
                          {actualMediaKind === 'video' &&
                          typeof scene.videoTrimStartSec === 'number' &&
                          typeof scene.videoTrimEndSec === 'number' &&
                          scene.videoTrimStartSec > 0
                            ? `✂️ Đã cắt (${scene.videoTrimStartSec}s→${scene.videoTrimEndSec}s):`
                            : actualMediaKind === 'video'
                            ? '🎬 Video thật:'
                            : '📸 Ảnh thật chuẩn:'}
                        </span>
                        <span className="truncate">{attachedFileName}</span>
                      </>
                    )}
                  </div>
                ) : scene.sceneType === 'outro' ? (
                  <div className="px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 truncate bg-amber-950/60 text-amber-200 border border-amber-500/40">
                    <CheckCircle2 className="w-3 h-3 shrink-0 text-amber-400" />
                    <span className="truncate font-semibold">
                      🔒 Logo cố định: LIFE LEGENDS (HM)
                    </span>
                  </div>
                ) : scene.sceneType === 'quote' ? (
                  <div className="px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 truncate bg-slate-800/80 text-slate-300 border border-slate-700">
                    <CheckCircle2 className="w-3 h-3 shrink-0 text-amber-400" />
                    <span className="truncate">Tự động dựng hình (Không bắt buộc file)</span>
                  </div>
                ) : (
                  <div
                    className="px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 truncate bg-rose-950/60 text-rose-200 border border-rose-500/40"
                    title="Cảnh này chưa có file. Bạn có thể chèn Video hoặc Ảnh bất kỳ vào đây."
                  >
                    <AlertCircle className="w-3 h-3 shrink-0 text-rose-400" />
                    <span className="truncate">
                      Chưa có {scene.sceneType === 'video' ? 'VIDEO' : 'ẢNH'} — Bấm nút dưới để chèn
                    </span>
                  </div>
                )}
              </div>

              {/* Middle Preview / Text Excerpt */}
              <div className="my-1 flex items-center gap-2">
                {scene.sceneType === 'outro' ? (
                  <div className="relative w-11 h-11 rounded overflow-hidden border border-amber-500/60 shrink-0 bg-[#070E1A]">
                    <img
                      src="/assets/aistudio/image_4653598d.png"
                      alt="LIFE LEGENDS HM Logo"
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute bottom-0 right-0 px-1 text-[8px] font-bold uppercase leading-tight bg-amber-500 text-slate-950">
                      HM
                    </span>
                  </div>
                ) : thumbUrl ? (
                  <div
                    onClick={(e) => {
                      if (isVisualScene && onOpenSceneMediaSearch) {
                        e.stopPropagation();
                        onOpenSceneMediaSearch(scene.id);
                      }
                    }}
                    title="Bấm vào ảnh để tìm & chọn lại Ảnh hoặc Đoạn Video khác hợp lý hơn cho cảnh này"
                    className={`relative w-11 h-11 rounded overflow-hidden border shrink-0 bg-black cursor-pointer group/thumb ${
                      isMissingRealPhoto
                        ? 'border-amber-500/70'
                        : scene.sceneType === 'video'
                        ? 'border-sky-500/60 hover:border-amber-400'
                        : 'border-emerald-500/60 hover:border-amber-400'
                    }`}
                  >
                    <img
                      src={thumbUrl}
                      alt={scene.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    {isVisualScene && onOpenSceneMediaSearch && (
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center transition-opacity">
                        <Search className="w-4 h-4 text-amber-300" />
                      </div>
                    )}
                    <span
                      className={`absolute bottom-0 right-0 px-1 text-[8px] font-bold uppercase leading-tight ${
                        isMissingRealPhoto
                          ? 'bg-amber-500 text-slate-950'
                          : actualMediaKind === 'video'
                          ? 'bg-sky-600 text-white'
                          : isVideoSceneHoldingTempImage
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-emerald-600 text-white'
                      }`}
                    >
                      {isMissingRealPhoto
                        ? 'KLING'
                        : actualMediaKind === 'video'
                        ? 'MP4'
                        : isVideoSceneHoldingTempImage
                        ? 'ẢNH GỐC'
                        : 'ẢNH THẬT'}
                    </span>
                  </div>
                ) : hasVideoPreview ? (
                  <div
                    onClick={(e) => {
                      if (isVisualScene && onOpenSceneMediaSearch) {
                        e.stopPropagation();
                        onOpenSceneMediaSearch(scene.id);
                      }
                    }}
                    title="Bấm để tìm & đổi đoạn Video hoặc Ảnh khác cho cảnh này"
                    className="relative w-11 h-11 rounded overflow-hidden border border-sky-500/60 hover:border-amber-400 shrink-0 bg-black cursor-pointer"
                  >
                    <video
                      src={`${scene.mediaUrl}#t=0.1`}
                      preload="metadata"
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute bottom-0 right-0 px-1 text-[8px] font-bold uppercase leading-tight bg-sky-600 text-white">
                      MP4
                    </span>
                  </div>
                ) : (
                  <div
                    onClick={(e) => {
                      if (isVisualScene && onOpenSceneMediaSearch) {
                        e.stopPropagation();
                        onOpenSceneMediaSearch(scene.id);
                      }
                    }}
                    className="w-11 h-11 rounded bg-[#0B0F17] border border-dashed border-slate-700 hover:border-amber-400 flex flex-col items-center justify-center shrink-0 text-[9px] text-slate-400 cursor-pointer"
                  >
                    {scene.sceneType === 'quote' ? (
                      <Quote className="w-4 h-4 text-amber-400" />
                    ) : scene.sceneType === 'image' ? (
                      <>
                        <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-[8px] text-emerald-300 font-semibold">ẢNH</span>
                      </>
                    ) : (
                      <>
                        <Film className="w-3.5 h-3.5 text-sky-400" />
                        <span className="text-[8px] text-sky-300 font-semibold">VIDEO</span>
                      </>
                    )}
                  </div>
                )}
                <p className="text-[11px] text-slate-300 line-clamp-2 leading-snug">
                  {scene.narrationText}
                </p>
              </div>

              {/* Bottom Metadata, Quick Replace Button & Reorder Controls */}
              <div
                className="flex items-center justify-between gap-1 text-[10px] text-slate-400 pt-1 border-t border-slate-800/80"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-1 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      const evt = new CustomEvent('legendcut:play-single-scene', {
                        detail: {
                          sceneId: scene.id,
                          startSec,
                          stopSec: endSec,
                        },
                      });
                      window.dispatchEvent(evt);
                    }}
                    title={`Chỉ phát riêng Cảnh #${String(idx + 1).padStart(2, '0')} (${formatSecLabel(startSec)}–${formatSecLabel(endSec)}) và tự dừng khi hết cảnh này`}
                    className="flex items-center gap-0.5 px-1.5 py-0.5 rounded font-sans font-bold bg-emerald-500/20 hover:bg-emerald-500/35 text-emerald-300 border border-emerald-500/50 transition-colors shrink-0"
                  >
                    <Play className="w-2.5 h-2.5 fill-current shrink-0" />
                    <span>Phát Riêng</span>
                  </button>

                  {isVisualScene && onOpenSceneMediaSearch && (
                    <button
                      type="button"
                      onClick={() => onOpenSceneMediaSearch(scene.id)}
                      title={`Tìm kiếm Video Thực Tế (Kho Phim / YouTube / Shorts / TikTok) hoặc Ảnh Thật khác cho Cảnh #${String(idx + 1).padStart(2, '0')}`}
                      className="flex items-center gap-0.5 px-1.5 py-0.5 rounded font-sans font-bold bg-amber-500/25 hover:bg-amber-500/40 text-amber-200 border border-amber-400/60 transition-colors shrink-0"
                    >
                      <Search className="w-2.5 h-2.5 shrink-0" />
                      <span>🔍 Tìm Khác</span>
                    </button>
                  )}

                  {actualMediaKind === 'video' && scene.mediaUrl && (
                    <a
                      href={
                        scene.mediaUrl.split('#')[0].includes('/api/youtube/cut-file/')
                          ? `${scene.mediaUrl.split('#')[0]}?download=1&name=${encodeURIComponent(
                              `Canh_${String(idx + 1).padStart(2, '0')}_video_da_cat.mp4`
                            )}`
                          : scene.mediaUrl.split('#')[0]
                      }
                      download={`Canh_${String(idx + 1).padStart(2, '0')}_video_da_cat.mp4`}
                      target="_blank"
                      rel="noreferrer"
                      title={`Tải file Video MP4 đã cắt của Cảnh #${String(idx + 1).padStart(2, '0')} về máy tính của bạn`}
                      className="flex items-center gap-0.5 px-1.5 py-0.5 rounded font-sans font-bold bg-sky-500/25 hover:bg-sky-500/40 text-sky-200 border border-sky-400/60 transition-colors shrink-0"
                    >
                      <Download className="w-2.5 h-2.5 shrink-0" />
                      <span>Lưu</span>
                    </a>
                  )}

                  {isVisualScene && onQuickCycleSceneMedia && (
                    <button
                      type="button"
                      onClick={() => onQuickCycleSceneMedia(scene.id)}
                      title="Đổi nhanh 1-Click sang Ảnh hoặc Góc Cắt Video Thực Tế khác cho cảnh này"
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 transition-colors shrink-0"
                    >
                      <RefreshCw className="w-2.5 h-2.5" />
                    </button>
                  )}

                  {onUploadFileForScene && scene.sceneType !== 'outro' && (
                    <label
                      title="Chọn file Video (.mp4, .mov) hoặc Ảnh (.png, .jpg, .webp) bất kỳ từ máy tính"
                      className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded font-sans font-semibold cursor-pointer transition-colors border shrink-0 ${
                        isVideoSceneHoldingTempImage
                          ? 'bg-sky-500/25 hover:bg-sky-500/40 text-sky-200 border-sky-400/50'
                          : hasMedia
                          ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-600'
                          : 'bg-amber-500/25 hover:bg-amber-500/40 text-amber-200 border-amber-500/50'
                      }`}
                    >
                      <Upload className="w-2.5 h-2.5" />
                      <span>{hasMedia ? 'Tải File' : '+File'}</span>
                      <input
                        type="file"
                        accept={ACCEPTED_MEDIA_INPUT}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            onUploadFileForScene(scene.id, file);
                            e.target.value = '';
                          }
                        }}
                        className="hidden"
                      />
                    </label>
                  )}

                  {isVisualScene && onSwapSceneMedia && (
                    <button
                      type="button"
                      onClick={() => {
                        if (isSwapSource) {
                          setSwapSourceSceneId(null);
                        } else if (swapSourceSceneId) {
                          onSwapSceneMedia(swapSourceSceneId, scene.id);
                          setSwapSourceSceneId(null);
                        } else {
                          setSwapSourceSceneId(scene.id);
                        }
                      }}
                      title={
                        isSwapSource
                          ? 'Đang chọn cảnh này để đảo Video/Ảnh — bấm để hủy'
                          : swapSourceSceneId && swapSourceIdx >= 0
                          ? `Bấm để đổi Video/Ảnh của cảnh này với Cảnh #${String(swapSourceIdx + 1).padStart(2, '0')} (Giữ nguyên thứ tự nội dung chữ & giọng đọc)`
                          : 'Chọn cảnh này để đảo Video/Ảnh với 1 cảnh khác (Giữ nguyên thứ tự nội dung chữ & giọng đọc)'
                      }
                      className={`flex items-center gap-0.5 px-1 py-0.5 rounded font-sans font-semibold border transition-colors shrink-0 ${
                        isSwapSource
                          ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                          : isSwapTargetCandidate
                          ? 'bg-amber-500/25 hover:bg-amber-500/40 text-amber-200 border-amber-400'
                          : 'bg-slate-800/90 hover:bg-slate-700 text-sky-300 border-slate-700'
                      }`}
                    >
                      <ArrowLeftRight className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

