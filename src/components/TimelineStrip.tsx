import React from 'react';
import {
  Film,
  Image as ImageIcon,
  Quote,
  Award,
  ChevronLeft,
  ChevronRight,
  Mic,
} from 'lucide-react';
import { StoryScene, VaultItem } from '../types';
import { formatSecLabel } from '../utils/frameExtractor';

interface TimelineStripProps {
  scenes: StoryScene[];
  vaultItems: VaultItem[];
  activeSceneId: string;
  onSelectScene: (sceneId: string, startSec: number) => void;
  onMoveScene: (sceneId: string, direction: -1 | 1) => void;
  currentTimeSec: number;
  onOpenPromptStudio: () => void;
}

export const TimelineStrip: React.FC<TimelineStripProps> = ({
  scenes,
  vaultItems,
  activeSceneId,
  onSelectScene,
  onMoveScene,
  currentTimeSec,
  onOpenPromptStudio,
}) => {
  let runningSec = 0;

  return (
    <div className="h-44 bg-[#0B0F17] border-t border-slate-800/90 flex flex-col select-none">
      {/* Timeline Header Bar */}
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-slate-800/80 bg-[#111827]/70">
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span className="font-semibold text-slate-200">
            Dòng Thời Gian Phân Cảnh ({scenes.length} đoạn)
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Mỗi đoạn đều ghi rõ <strong className="text-sky-400">CẦN VIDEO</strong> hoặc{' '}
            <strong className="text-emerald-400">CẦN ẢNH TĨNH</strong> kèm sẵn Prompt tạo
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-400 font-mono-tabular">
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
      <div className="flex-1 overflow-x-auto overflow-y-hidden px-4 py-2.5 flex items-stretch gap-2.5">
        {scenes.map((scene, idx) => {
          const startSec = runningSec;
          const endSec = startSec + (scene.durationSec || 5);
          runningSec = endSec;

          const isSelected = scene.id === activeSceneId;
          const isPlayheadHere = currentTimeSec >= startSec && currentTimeSec < endSec;
          const vaultItem = vaultItems.find((v) => v.id === scene.mediaId);
          const thumbUrl =
            vaultItem?.thumbnailUrl || (vaultItem?.type === 'image' ? vaultItem.url : undefined);

          return (
            <div
              key={scene.id}
              onClick={() => onSelectScene(scene.id, startSec)}
              className={`group relative w-52 shrink-0 rounded-lg border p-2.5 flex flex-col justify-between cursor-pointer transition-all ${
                isSelected
                  ? 'bg-[#172033] border-amber-500 shadow-md'
                  : isPlayheadHere
                  ? 'bg-[#131B2E] border-amber-500/50'
                  : 'bg-[#111827] border-slate-800 hover:border-slate-700'
              }`}
            >
              {/* Top Row: Scene Number + Requirement Tag + Duration */}
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-mono-tabular font-semibold text-amber-400">
                    #{String(idx + 1).padStart(2, '0')}
                  </span>
                  {scene.sceneType === 'video' && (
                    <span className="text-[10px] font-bold text-sky-400 flex items-center gap-0.5 truncate">
                      <Film className="w-3 h-3 shrink-0" />
                      CẦN VIDEO
                    </span>
                  )}
                  {scene.sceneType === 'image' && (
                    <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-0.5 truncate">
                      <ImageIcon className="w-3 h-3 shrink-0" />
                      CẦN ẢNH
                    </span>
                  )}
                  {scene.sceneType === 'quote' && (
                    <span className="text-[10px] font-bold text-amber-300 flex items-center gap-0.5 truncate">
                      <Quote className="w-3 h-3 shrink-0" />
                      CHỮ ĐEN
                    </span>
                  )}
                  {scene.sceneType === 'outro' && (
                    <span className="text-[10px] font-bold text-amber-400 flex items-center gap-0.5 truncate">
                      <Award className="w-3 h-3 shrink-0" />
                      LOGO KẾT
                    </span>
                  )}
                </div>

                <span className="text-[11px] font-mono-tabular text-slate-400 shrink-0">
                  {scene.durationSec}s
                </span>
              </div>

              {/* Middle Preview / Text Excerpt */}
              <div className="my-1 flex items-center gap-2">
                {thumbUrl ? (
                  <img
                    src={thumbUrl}
                    alt={scene.title}
                    referrerPolicy="no-referrer"
                    className="w-10 h-10 rounded object-cover border border-slate-700 shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded bg-[#0B0F17] border border-slate-800 flex items-center justify-center shrink-0">
                    {scene.sceneType === 'quote' ? (
                      <Quote className="w-4 h-4 text-amber-400" />
                    ) : scene.sceneType === 'outro' ? (
                      <Award className="w-4 h-4 text-amber-400" />
                    ) : scene.sceneType === 'image' ? (
                      <ImageIcon className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Film className="w-4 h-4 text-sky-400" />
                    )}
                  </div>
                )}
                <p className="text-[11px] text-slate-300 line-clamp-2 leading-snug">
                  {scene.narrationText}
                </p>
              </div>

              {/* Bottom Metadata & Reorder Controls */}
              <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800/80">
                <div className="flex items-center gap-1 font-mono-tabular truncate">
                  <span>
                    {formatSecLabel(startSec)}–{formatSecLabel(endSec)}
                  </span>
                  {scene.frameStyle === 'rounded-frame' && (
                    <span className="text-amber-400">· Bo viền</span>
                  )}
                  {scene.frameStyle === 'cinema-letterbox' && (
                    <span className="text-sky-400">· Letterbox</span>
                  )}
                  {scene.voiceoverUrl && (
                    <Mic className="w-3 h-3 text-emerald-400 inline shrink-0" />
                  )}
                </div>

                <div
                  className="flex items-center gap-0.5 opacity-80 group-hover:opacity-100 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
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
