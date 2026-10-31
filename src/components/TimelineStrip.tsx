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
} from 'lucide-react';
import { StoryScene, VaultItem } from '../types';
import { formatSecLabel } from '../utils/frameExtractor';

interface TimelineStripProps {
  scenes: StoryScene[];
  vaultItems: VaultItem[];
  activeSceneId: string;
  onSelectScene: (sceneId: string, startSec: number) => void;
  onMoveScene: (sceneId: string, direction: -1 | 1) => void;
  onUpdateScene?: (sceneId: string, patch: Partial<StoryScene>) => void;
  currentTimeSec: number;
  onOpenPromptStudio: () => void;
  onUploadFileForScene?: (sceneId: string, file: File) => void;
  onSmartBatchUploadFiles?: (files: FileList) => void;
}

const ACCEPTED_MEDIA_INPUT =
  'video/*,image/*,.mp4,.mov,.webm,.mkv,.m4v,.avi,.jpg,.jpeg,.png,.webp,.gif,.avif,.heic';

export const TimelineStrip: React.FC<TimelineStripProps> = ({
  scenes,
  vaultItems,
  activeSceneId,
  onSelectScene,
  onMoveScene,
  onUpdateScene,
  currentTimeSec,
  onOpenPromptStudio,
  onUploadFileForScene,
  onSmartBatchUploadFiles,
}) => {
  const [dragOverSceneId, setDragOverSceneId] = useState<string | null>(null);
  let runningSec = 0;

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

  return (
    <div className="h-48 bg-[#0B0F17] border-t border-slate-800/90 flex flex-col select-none">
      {/* Timeline Header Bar */}
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-slate-800/80 bg-[#111827]/70 gap-2">
        <div className="flex items-center gap-2 text-xs text-slate-400 min-w-0 overflow-hidden">
          <span className="font-semibold text-slate-200 shrink-0">
            Dòng Thời Gian Phân Cảnh ({scenes.length} đoạn)
          </span>

          {/* Clear Summary of which segments are VIDEO vs IMAGE */}
          <span
            title={`Các đoạn cần làm Video chuyển động (Kling AI): ${videoSceneNumbers.join(', ') || 'Không có'}`}
            className="px-2 py-0.5 rounded text-[11px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40 flex items-center gap-1 shrink-0"
          >
            <Film className="w-3 h-3 shrink-0" />
            <span>
              Đoạn VIDEO ({videoSceneNumbers.length}):{' '}
              {videoSceneNumbers.length > 0 ? videoSceneNumbers.join(', ') : '0'}
            </span>
          </span>

          <span
            title={`Các đoạn dùng Ảnh tĩnh (Ken Burns): ${imageSceneNumbers.join(', ') || 'Không có'}`}
            className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 shrink-0"
          >
            <ImageIcon className="w-3 h-3 shrink-0" />
            <span>
              Đoạn ẢNH ({imageSceneNumbers.length}):{' '}
              {imageSceneNumbers.length > 0 ? imageSceneNumbers.join(', ') : '0'}
            </span>
          </span>

          {needsKlingDrawScenes.length > 0 ? (
            <button
              type="button"
              onClick={onOpenPromptStudio}
              title={`Các đoạn chưa có ảnh thật trên mạng (không lấy ảnh lung tung): ${missingRealPhotoNumbers.join(', ')}. Bấm để mở Bảng Prompt Chuẩn Kling AI theo thứ tự!`}
              className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/50 flex items-center gap-1 shrink-0 transition-colors"
            >
              <span>
                🎨 Chưa có ảnh thật ({needsKlingDrawScenes.length}): {missingRealPhotoNumbers.join(', ')} — Lấy Prompt Kling
              </span>
            </button>
          ) : (
            <span className="hidden 2xl:inline-flex px-2 py-0.5 rounded text-[11px] font-semibold border shrink-0 bg-emerald-500/15 text-emerald-300 border-emerald-500/40">
              📸 Đã có ảnh thật/video: {verifiedRealPhotoScenes.length}/{visualScenes.length} cảnh
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-400 font-mono-tabular shrink-0">
          {onSmartBatchUploadFiles && (
            <label
              title="Chọn nhiều file Ảnh/Video cùng lúc (tên bất kỳ hoặc đặt tên 1.mp4, 2.png, canh 1.mp4)"
              className="flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 font-sans font-semibold cursor-pointer transition-colors whitespace-nowrap shrink-0"
            >
              <FolderUp className="w-3.5 h-3.5" />
              <span>Thay Hàng Loạt Ảnh/Video Mới</span>
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
            Xem Bảng Prompt Toàn Bộ Các Đoạn
          </button>
          <span aria-hidden="true">·</span>
          <span>Con trỏ: {formatSecLabel(currentTimeSec)}</span>
          <span aria-hidden="true">·</span>
          <span>
            Tổng:{' '}
            {formatSecLabel(scenes.reduce((acc, s) => acc + (s.durationSec || 5), 0))}
          </span>
        </div>
      </div>

      {/* Horizontal Scrollable Storyboard Track */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden px-4 py-2 flex items-stretch gap-2.5">
        {scenes.map((scene, idx) => {
          const startSec = runningSec;
          const endSec = startSec + (scene.durationSec || 5);
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
            (scene.mediaKind === 'image' ? scene.mediaUrl : undefined);
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

          const cleanDurationSec = Number((scene.durationSec || 5).toFixed(1));

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

          return (
            <div
              key={scene.id}
              onClick={() => onSelectScene(scene.id, startSec)}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverSceneId(scene.id);
              }}
              onDragLeave={() => setDragOverSceneId(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverSceneId(null);
                const file = e.dataTransfer.files?.[0];
                if (file && onUploadFileForScene) {
                  onUploadFileForScene(scene.id, file);
                }
              }}
              className={`group relative w-64 shrink-0 rounded-lg border ${topAccentBorderClass} p-2.5 flex flex-col justify-between cursor-pointer transition-all ${
                dragOverSceneId === scene.id
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

              {/* Status Pill: Clearly states whether Verified Real Photo/Video is attached OR if it needs Kling AI drawing */}
              <div className="mt-1">
                {isMissingRealPhoto ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenPromptStudio();
                    }}
                    title={`Đoạn #${idx + 1} chưa có ảnh thật chuẩn nhân vật (App tuyệt đối không lấy ảnh lung tung). Bấm để copy Prompt Chuẩn Kling AI vẽ cảnh này!`}
                    className="w-full px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 truncate bg-amber-950/80 hover:bg-amber-900/80 text-amber-200 border border-amber-400/60 transition-colors"
                  >
                    <AlertCircle className="w-3 h-3 shrink-0 text-amber-400" />
                    <span className="truncate">
                      🎨 Chưa có ảnh thật — Lấy Prompt Kling AI vẽ
                    </span>
                  </button>
                ) : isVideoSceneHoldingTempImage ? (
                  <div
                    title={`Đoạn #${idx + 1} là ĐOẠN VIDEO. Đã có Ảnh thật chuẩn (${attachedFileName}) làm ảnh gốc Start Frame cho Kling AI.`}
                    className="px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 truncate bg-sky-950/80 text-sky-200 border border-sky-400/50"
                  >
                    <Film className="w-3 h-3 shrink-0 text-sky-400" />
                    <span className="font-bold text-amber-300 shrink-0">
                      Đã có Ảnh thật làm gốc Kling:
                    </span>
                    <span className="truncate">{attachedFileName}</span>
                  </div>
                ) : hasMedia ? (
                  <div
                    title={`Đã gắn ${actualMediaKind === 'video' ? 'Video' : 'Ảnh thật chuẩn'}: ${attachedFileName}`}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 truncate border ${
                      actualMediaKind === 'video'
                        ? 'bg-sky-950/70 text-sky-200 border-sky-500/40'
                        : 'bg-emerald-950/70 text-emerald-200 border-emerald-500/40'
                    }`}
                  >
                    <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-400" />
                    <span className="font-bold shrink-0">
                      {actualMediaKind === 'video' ? 'Đã gắn Video:' : '📸 Ảnh thật chuẩn:'}
                    </span>
                    <span className="truncate">{attachedFileName}</span>
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
                    className={`relative w-11 h-11 rounded overflow-hidden border shrink-0 bg-black ${
                      isMissingRealPhoto
                        ? 'border-amber-500/70'
                        : scene.sceneType === 'video'
                        ? 'border-sky-500/60'
                        : 'border-emerald-500/60'
                    }`}
                  >
                    <img
                      src={thumbUrl}
                      alt={scene.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
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
                  <div className="relative w-11 h-11 rounded overflow-hidden border border-sky-500/60 shrink-0 bg-black">
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
                  <div className="w-11 h-11 rounded bg-[#0B0F17] border border-dashed border-slate-700 flex flex-col items-center justify-center shrink-0 text-[9px] text-slate-400">
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
              <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800/80">
                <div className="flex items-center gap-1 font-mono-tabular truncate">
                  <span>
                    {formatSecLabel(startSec)}–{formatSecLabel(endSec)}
                  </span>
                  {scene.voiceoverUrl && (
                    <span title="Đã có Voice" className="inline-flex items-center shrink-0">
                      <Mic className="w-3 h-3 text-emerald-400" />
                    </span>
                  )}
                </div>

                <div
                  className="flex items-center gap-1 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  {onUploadFileForScene && scene.sceneType !== 'outro' && (
                    <label
                      title="Chọn file Video (.mp4, .mov) hoặc Ảnh (.png, .jpg, .webp) bất kỳ từ máy tính — tự động nhận diện tên và định dạng"
                      className={`flex items-center gap-1 px-2 py-0.5 rounded font-sans font-semibold cursor-pointer transition-colors border ${
                        isVideoSceneHoldingTempImage
                          ? 'bg-sky-500/25 hover:bg-sky-500/40 text-sky-200 border-sky-400/50'
                          : hasMedia
                          ? 'bg-slate-800 hover:bg-slate-700 text-amber-300 border-slate-600'
                          : 'bg-amber-500/25 hover:bg-amber-500/40 text-amber-200 border-amber-500/50'
                      }`}
                    >
                      <Upload className="w-2.5 h-2.5" />
                      <span>
                        {isVideoSceneHoldingTempImage
                          ? '+ Thay Video'
                          : hasMedia
                          ? scene.sceneType === 'video'
                            ? 'Đổi Video/Ảnh'
                            : 'Đổi Ảnh/Video'
                          : scene.sceneType === 'video'
                          ? '+ Chèn Video'
                          : '+ Chèn Ảnh'}
                      </span>
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
                  <button
                    onClick={() => onMoveScene(scene.id, -1)}
                    disabled={idx === 0}
                    title="Chuyển sang trái"
                    className="p-0.5 hover:text-white disabled:opacity-30"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onMoveScene(scene.id, 1)}
                    disabled={idx === scenes.length - 1}
                    title="Chuyển sang phải"
                    className="p-0.5 hover:text-white disabled:opacity-30"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

