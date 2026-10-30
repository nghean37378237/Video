import React, { useRef, useState } from 'react';
import {
  Upload,
  Film,
  Image as ImageIcon,
  Wand2,
  Plus,
  Trash2,
  Camera,
  Check,
  Sparkles,
  Layers,
  Loader2,
  ArrowRight,
  FileSpreadsheet,
  MessageSquareCode,
  Zap,
  Globe,
} from 'lucide-react';
import { PresetId, StoryScene, VaultItem } from '../types';
import { getMediaDuration } from '../utils/frameExtractor';

interface MediaVaultPanelProps {
  vaultItems: VaultItem[];
  onAddVaultItems: (items: VaultItem[]) => void;
  onRemoveVaultItem: (id: string) => void;
  activeScene: StoryScene | undefined;
  onAssignMediaToActiveScene: (item: VaultItem) => void;
  onAppendSceneFromMedia: (item: VaultItem) => void;
  onAutoStitchVault: () => void;
  onExtractSampleFrames: () => Promise<void>;
  isExtractingFrames: boolean;
  onGenerateAIStory: (topic: string, lang: 'vi' | 'en', sceneCount: number) => Promise<void>;
  isGeneratingStory: boolean;
  onRunFullAutoPilot: (characterOrTopic: string, lang: 'en' | 'vi', sceneCount: number) => Promise<void>;
  isRunningAutoPilot: boolean;
  autoPilotStepText: string;
  onFetchArchivalPhotos: (characterQuery: string) => Promise<void>;
  isFetchingArchival: boolean;
  activePresetId: PresetId;
  onSelectPreset: (presetId: PresetId) => void;
  onOpenPromptStudio: () => void;
}

export const MediaVaultPanel: React.FC<MediaVaultPanelProps> = ({
  vaultItems,
  onAddVaultItems,
  onRemoveVaultItem,
  activeScene,
  onAssignMediaToActiveScene,
  onAppendSceneFromMedia,
  onAutoStitchVault,
  onExtractSampleFrames,
  isExtractingFrames,
  onGenerateAIStory,
  isGeneratingStory,
  onRunFullAutoPilot,
  isRunningAutoPilot,
  autoPilotStepText,
  onFetchArchivalPhotos,
  isFetchingArchival,
  activePresetId,
  onSelectPreset,
  onOpenPromptStudio,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'video' | 'image'>('all');
  const [activeSubTab, setActiveSubTab] = useState<'auto-pilot' | 'vault'>('auto-pilot');
  const [storyTopic, setStoryTopic] = useState('Clint Eastwood');
  const [storyLang, setStoryLang] = useState<'vi' | 'en'>('en');
  const [sceneCount, setSceneCount] = useState<number>(8);
  const [isDragging, setIsDragging] = useState(false);

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const newItems: VaultItem[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const objectUrl = URL.createObjectURL(file);
      const isVideo = file.type.startsWith('video/');
      const isImage = file.type.startsWith('image/');

      if (!isVideo && !isImage) continue;

      let durationSec: number | undefined;
      if (isVideo) {
        durationSec = await getMediaDuration(objectUrl, 'video');
      }

      newItems.push({
        id: `upload-${Date.now()}-${i}`,
        name: file.name.replace(/\.[^/.]+$/, ''),
        type: isVideo ? 'video' : 'image',
        url: objectUrl,
        thumbnailUrl: isImage ? objectUrl : undefined,
        durationSec: isVideo ? durationSec : 7,
        sourceTag: 'uploaded',
        createdAt: 'Vừa tải lên',
      });
    }

    if (newItems.length > 0) {
      onAddVaultItems(newItems);
    }
  };

  const filteredItems = vaultItems.filter((item) => {
    if (filterType === 'all') return item.type === 'video' || item.type === 'image';
    return item.type === filterType;
  });

  const videoCount = vaultItems.filter((i) => i.type === 'video').length;
  const imageCount = vaultItems.filter((i) => i.type === 'image').length;

  return (
    <div className="flex flex-col h-full bg-[#111827] border-r border-slate-800/80">
      {/* Sub-navigation Tabs */}
      <div className="p-3 border-b border-slate-800/80 space-y-2">
        <div className="flex items-center gap-1 p-1 bg-[#0B0F17] rounded-lg border border-slate-800">
          <button
            onClick={() => setActiveSubTab('auto-pilot')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeSubTab === 'auto-pilot'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            Tự Động A-Z & ChatGPT
          </button>
          <button
            onClick={() => setActiveSubTab('vault')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeSubTab === 'vault'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Kho Tư Liệu ({videoCount + imageCount})
          </button>
        </div>

        {/* Prominent Button to Open Script + Video/Image Prompt Matrix + ChatGPT Pro Bridge */}
        <button
          onClick={onOpenPromptStudio}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold bg-slate-800/90 hover:bg-slate-700 text-amber-300 border border-amber-500/30 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <FileSpreadsheet className="w-3.5 h-3.5 text-amber-400" />
          Bảng Chia Đoạn Video/Ảnh & Liên Kết ChatGPT Pro
        </button>
      </div>

      {activeSubTab === 'auto-pilot' ? (
        /* 1-CLICK FULL AUTO-PILOT & CHATGPT PRO BRIDGE */
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
          {/* 3 Sample Reference Videos Switcher */}
          <div className="p-2.5 rounded-lg border border-slate-800 bg-[#0B0F17]/70">
            <label className="block text-[11px] font-medium text-slate-400 mb-1">
              Xem 3 Video Mẫu chuẩn bạn đã gửi:
            </label>
            <select
              value={activePresetId}
              onChange={(e) => onSelectPreset(e.target.value as PresetId)}
              className="w-full px-2.5 py-1.5 text-xs font-medium bg-[#111827] border border-slate-700 rounded-md text-slate-100 focus:outline-none focus:border-amber-500"
            >
              <option value="lorne-greene">
                Mẫu 1: Lorne Greene & Chú Ngựa Buck (Bonanza)
              </option>
              <option value="clayton-moore">
                Mẫu 2: Clayton Moore — Mặt Nạ Lone Ranger
              </option>
              <option value="yul-brynner">
                Mẫu 3: Yul Brynner — Nhà Vua & Tay Súng
              </option>
            </select>
          </div>

          {/* 1-Click Full Auto-Pilot Box */}
          <div className="p-3.5 rounded-xl bg-[#0B0F17] border border-amber-500/40 space-y-3">
            <div>
              <h3 className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                <Zap className="w-4 h-4" />
                CHỈ CẦN NHẬP TÊN NHÂN VẬT (Tự Động Làm Hết A → Z)
              </h3>
              <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                Bạn chỉ cần gõ <strong>Tên Nhân Vật</strong> (VD: <em>Clint Eastwood, John Wayne, Elvis Presley, Bruce Lee...</em>). App sẽ tự động làm 4 việc:
              </p>
              <ul className="text-[11px] text-slate-400 mt-1.5 space-y-0.5 pl-1">
                <li>1. Tự viết kịch bản & chia đoạn Video / Ảnh / Chữ đen</li>
                <li>2. Tự tìm & tải 8–10 <strong>Ảnh lịch sử thật</strong> của nhân vật vào Kho</li>
                <li>3. Tự tạo <strong>Giọng đọc thuyết minh trầm ấm</strong> cho mọi cảnh</li>
                <li>4. Tự ghép nhạc nền, phụ đề vàng, khung bo tròn & phát ngay!</li>
              </ul>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-200">
                Nhập Tên Nhân Vật (hoặc Nhân vật + Câu chuyện):
              </label>
              <input
                type="text"
                value={storyTopic}
                onChange={(e) => setStoryTopic(e.target.value)}
                placeholder="VD: Clint Eastwood, John Wayne, Audrey Hepburn..."
                className="w-full px-3 py-2 text-xs bg-[#111827] border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Quick famous legend presets */}
            <div className="flex flex-wrap gap-1.5">
              {[
                'Clint Eastwood',
                'John Wayne',
                'Steve McQueen',
                'Bruce Lee',
                'Elvis Presley',
                'Audrey Hepburn',
              ].map((name) => (
                <button
                  key={name}
                  onClick={() => setStoryTopic(name)}
                  className={`px-2 py-1 text-[11px] rounded border transition-colors ${
                    storyTopic === name
                      ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-semibold'
                      : 'bg-[#111827] border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Ngôn ngữ giọng đọc & phụ đề
                </label>
                <select
                  value={storyLang}
                  onChange={(e) => setStoryLang(e.target.value as 'vi' | 'en')}
                  className="w-full px-2 py-1.5 text-xs bg-[#111827] border border-slate-700 rounded-md text-slate-100"
                >
                  <option value="en">Tiếng Anh (Chuẩn mẫu)</option>
                  <option value="vi">Tiếng Việt</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Số phân cảnh
                </label>
                <select
                  value={sceneCount}
                  onChange={(e) => setSceneCount(Number(e.target.value))}
                  className="w-full px-2 py-1.5 text-xs bg-[#111827] border border-slate-700 rounded-md text-slate-100 font-mono-tabular"
                >
                  <option value={6}>6 cảnh (Nhanh ~45s)</option>
                  <option value={8}>8 cảnh (Chuẩn ~65s)</option>
                  <option value={12}>12 cảnh (Dài ~100s)</option>
                </select>
              </div>
            </div>

            {/* 1-CLICK FULL AUTO-PILOT CTA */}
            <button
              onClick={() => onRunFullAutoPilot(storyTopic, storyLang, sceneCount)}
              disabled={isRunningAutoPilot || !storyTopic.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-bold text-xs rounded-lg shadow-md transition-colors whitespace-nowrap shrink-0"
            >
              {isRunningAutoPilot ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="truncate">{autoPilotStepText || 'Đang dựng tự động...'}</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 fill-current" />
                  Chạy Tự Động A → Z (Kịch Bản + Ảnh + Giọng + Ghép)
                </>
              )}
            </button>

            {/* Secondary actions: Only Script or Only Fetch Photos */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => onGenerateAIStory(storyTopic, storyLang, sceneCount)}
                disabled={isGeneratingStory || isRunningAutoPilot}
                className="flex items-center justify-center gap-1 px-2.5 py-1.5 text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md border border-slate-700 transition-colors whitespace-nowrap shrink-0"
              >
                <Wand2 className="w-3 h-3 text-amber-400" />
                Chỉ Tạo Kịch Bản & Prompt
              </button>
              <button
                onClick={() => onFetchArchivalPhotos(storyTopic)}
                disabled={isFetchingArchival || isRunningAutoPilot}
                className="flex items-center justify-center gap-1 px-2.5 py-1.5 text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md border border-slate-700 transition-colors whitespace-nowrap shrink-0"
              >
                {isFetchingArchival ? (
                  <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                ) : (
                  <Globe className="w-3 h-3 text-emerald-400" />
                )}
                Tự Tìm Ảnh Thật Vào Kho
              </button>
            </div>
          </div>

          {/* ChatGPT Pro Connection Card */}
          <div className="p-3.5 rounded-xl bg-[#0B0F17] border border-slate-800 space-y-2">
            <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <MessageSquareCode className="w-4 h-4 text-emerald-400" />
              Kết Hợp Với Tài Khoản ChatGPT Pro Của Bạn
            </h4>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Nếu bạn dùng <strong>ChatGPT Pro</strong> (có GPT-4o viết kịch bản/vẽ ảnh và <strong>Sora</strong> tạo video 5s): Bấm nút dưới đây để lấy câu lệnh chuẩn đưa vào ChatGPT Pro hoặc dán kịch bản từ ChatGPT Pro về để App tự động dựng thành phim!
            </p>
            <button
              onClick={onOpenPromptStudio}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <MessageSquareCode className="w-3.5 h-3.5" />
              Mở Trạm Kết Nối ChatGPT Pro & Sora
            </button>
          </div>
        </div>
      ) : (
        /* MEDIA VAULT TAB */
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-3.5 space-y-2 border-b border-slate-800/80">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="video/*,image/*"
              onChange={(e) => handleFilesSelected(e.target.files)}
              className="hidden"
            />

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                handleFilesSelected(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`cursor-pointer border border-dashed rounded-lg p-3 text-center transition-colors ${
                isDragging
                  ? 'border-amber-400 bg-amber-500/10'
                  : 'border-slate-700 hover:border-amber-500/60 bg-[#0B0F17]/70'
              }`}
            >
              <Upload className="w-4 h-4 text-amber-400 mx-auto mb-1" />
              <p className="text-xs font-semibold text-slate-200">
                Bỏ Video (Sora/Kling) & Ảnh của bạn vào Kho
              </p>
              <p className="text-[11px] text-slate-400">
                Chọn nhiều file .MP4, .MOV, .JPG, .PNG cùng lúc
              </p>
            </div>

            <button
              onClick={onAutoStitchVault}
              className="w-full flex items-center justify-center gap-2 px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs rounded-lg shadow-sm transition-colors whitespace-nowrap shrink-0"
            >
              <Sparkles className="w-4 h-4" />
              Tự Động Ghép Kho Video & Ảnh Thành Phim
            </button>

            <button
              onClick={onExtractSampleFrames}
              disabled={isExtractingFrames}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {isExtractingFrames ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                  Đang tách ảnh tư liệu...
                </>
              ) : (
                <>
                  <Camera className="w-3.5 h-3.5 text-amber-400" />
                  Tách 8 Ảnh Từ Video Mẫu Đang Chọn Vào Kho
                </>
              )}
            </button>
          </div>

          <div className="flex items-center justify-between px-3.5 py-2 border-b border-slate-800/80 bg-[#0B0F17]/40">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setFilterType('all')}
                className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  filterType === 'all'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Tất cả ({videoCount + imageCount})
              </button>
              <button
                onClick={() => setFilterType('video')}
                className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  filterType === 'video'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Video ({videoCount})
              </button>
              <button
                onClick={() => setFilterType('image')}
                className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  filterType === 'image'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Ảnh ({imageCount})
              </button>
            </div>
            <span className="text-[11px] text-slate-400 truncate max-w-[110px]">
              Đang chọn: Cảnh #{activeScene?.order || 1}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {filteredItems.map((item) => {
              const isAssignedToActive = activeScene?.mediaId === item.id;
              return (
                <div
                  key={item.id}
                  className={`group relative flex items-center gap-3 p-2 rounded-lg border transition-colors ${
                    isAssignedToActive
                      ? 'bg-amber-500/10 border-amber-500/50'
                      : 'bg-[#0B0F17]/80 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="relative w-14 h-14 rounded overflow-hidden bg-slate-900 shrink-0 border border-slate-800">
                    {item.type === 'image' ? (
                      <img
                        src={item.url}
                        alt={item.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <video
                        src={item.url}
                        muted
                        playsInline
                        preload="metadata"
                        className="w-full h-full object-cover"
                      />
                    )}
                    <div className="absolute bottom-1 right-1 bg-black/80 px-1 py-0.5 rounded text-[10px] font-mono-tabular text-amber-400 flex items-center gap-0.5">
                      {item.type === 'video' ? (
                        <Film className="w-2.5 h-2.5" />
                      ) : (
                        <ImageIcon className="w-2.5 h-2.5" />
                      )}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-100 truncate">{item.name}</p>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
                      <span>{item.type === 'video' ? 'Video Clip' : 'Ảnh Tĩnh'}</span>
                      <span aria-hidden="true">·</span>
                      <span>{item.createdAt}</span>
                    </div>

                    <div className="flex items-center gap-1.5 mt-1.5">
                      <button
                        onClick={() => onAssignMediaToActiveScene(item)}
                        className="px-2 py-1 text-[11px] font-medium bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-200 rounded transition-colors flex items-center gap-1 whitespace-nowrap shrink-0"
                      >
                        {isAssignedToActive ? (
                          <>
                            <Check className="w-3 h-3" />
                            Đang ở Cảnh #{activeScene?.order}
                          </>
                        ) : (
                          <>
                            <ArrowRight className="w-3 h-3" />
                            Đưa vào Cảnh #{activeScene?.order || 1}
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => onAppendSceneFromMedia(item)}
                        title="Thêm làm cảnh mới ở cuối video"
                        className="px-2 py-1 text-[11px] font-medium bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700/80 rounded transition-colors flex items-center gap-1 whitespace-nowrap shrink-0"
                      >
                        <Plus className="w-3 h-3" />
                        +Cảnh
                      </button>

                      {item.sourceTag !== 'sample' && (
                        <button
                          onClick={() => onRemoveVaultItem(item.id)}
                          title="Xóa khỏi kho"
                          className="p-1 text-slate-500 hover:text-rose-400 transition-colors ml-auto"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
