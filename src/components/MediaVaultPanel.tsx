import React, { useEffect, useRef, useState } from 'react';
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
  Mic,
  Volume2,
  History,
  CheckCircle2,
} from 'lucide-react';
import { PresetId, ProjectSettings, StoryScene, VaultItem } from '../types';
import {
  cleanDisplayFileName,
  detectMediaKindFromFile,
  extractVideoThumbnail,
  getMediaDuration,
} from '../utils/frameExtractor';
import { soundEngine } from '../utils/audioSynth';
import {
  BG_MUSIC_STYLE_LABELS,
  loadSavedAudioPreferences,
  masterAudioToConsistentStudioWav,
  playInstantVoicePreview,
  saveAudioPreferences,
  SavedAudioPreferences,
  VOICE_PERSONA_PROFILES,
  VOICE_SHORT_LABELS,
} from '../utils/voiceConsistencyEngine';

interface MediaVaultPanelProps {
  vaultItems: VaultItem[];
  onAddVaultItems: (items: VaultItem[]) => void;
  onRemoveVaultItem: (id: string) => void;
  onClearVault: () => void;
  activeScene: StoryScene | undefined;
  onAssignMediaToActiveScene: (item: VaultItem) => void;
  onAppendSceneFromMedia: (item: VaultItem) => void;
  onAutoStitchVault: () => void;
  onExtractSampleFrames?: () => Promise<void>;
  isExtractingFrames?: boolean;
  onGenerateAIStory: (topic: string, lang: 'vi' | 'en', sceneCount: number) => Promise<void>;
  isGeneratingStory: boolean;
  onRunFullAutoPilot: (
    characterOrTopic: string,
    lang: 'en' | 'vi',
    sceneCount: number,
    overrideVoice?: ProjectSettings['ttsVoice'],
    overrideMusicStyle?: ProjectSettings['bgMusicStyle'],
    overrideMusicVolume?: number
  ) => Promise<void>;
  isRunningAutoPilot: boolean;
  autoPilotStepText: string;
  onFetchArchivalPhotos: (characterQuery: string) => Promise<void>;
  isFetchingArchival: boolean;
  activePresetId: PresetId;
  onSelectPreset: (presetId: PresetId) => void;
  onOpenPromptStudio: () => void;
  settings: ProjectSettings;
  onUpdateSettings: (patch: Partial<ProjectSettings>) => void;
}

export const MediaVaultPanel: React.FC<MediaVaultPanelProps> = ({
  vaultItems,
  onAddVaultItems,
  onRemoveVaultItem,
  onClearVault,
  activeScene,
  onAssignMediaToActiveScene,
  onAppendSceneFromMedia,
  onAutoStitchVault,
  onGenerateAIStory,
  isGeneratingStory,
  onRunFullAutoPilot,
  isRunningAutoPilot,
  autoPilotStepText,
  onFetchArchivalPhotos,
  isFetchingArchival,
  onOpenPromptStudio,
  settings,
  onUpdateSettings,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'video' | 'image'>('all');
  const [activeSubTab, setActiveSubTab] = useState<'auto-pilot' | 'vault'>('auto-pilot');

  const initialSaved = loadSavedAudioPreferences();
  const [storyTopic, setStoryTopic] = useState<string>(
    initialSaved.storyTopic || 'Clint Eastwood'
  );
  const [storyLang, setStoryLang] = useState<'vi' | 'en'>(
    settings.voiceLanguage || initialSaved.voiceLanguage || 'en'
  );
  const [sceneCount, setSceneCount] = useState<number>(initialSaved.sceneCount || 8);
  const [savedPrefs, setSavedPrefs] = useState<SavedAudioPreferences>(initialSaved);
  const [isPreviewingVoice, setIsPreviewingVoice] = useState<boolean>(false);
  const [justSavedFlash, setJustSavedFlash] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState(false);

  // Listen to global audio preference updates so Inspector, Modal, and Left Panel stay 100% synced
  useEffect(() => {
    const onSavedEvt = (e: Event) => {
      const custom = e as CustomEvent<SavedAudioPreferences>;
      if (custom.detail) {
        setSavedPrefs(custom.detail);
        setStoryLang(custom.detail.voiceLanguage);
        setJustSavedFlash(true);
        setTimeout(() => setJustSavedFlash(false), 1800);
      }
    };
    window.addEventListener('legendcut:audioprefs-saved', onSavedEvt);
    return () => window.removeEventListener('legendcut:audioprefs-saved', onSavedEvt);
  }, []);

  const handleSelectPreRunAudio = (patch: {
    ttsVoice?: ProjectSettings['ttsVoice'];
    voiceLanguage?: 'vi' | 'en';
    bgMusicStyle?: ProjectSettings['bgMusicStyle'];
    bgMusicVolume?: number;
    customBgMusicUrl?: string;
  }) => {
    const nextVoice = patch.ttsVoice ?? settings.ttsVoice;
    const nextLang = patch.voiceLanguage ?? storyLang;
    const nextMusic = patch.bgMusicStyle ?? settings.bgMusicStyle;
    const nextVol = patch.bgMusicVolume ?? settings.bgMusicVolume;

    if (patch.voiceLanguage) {
      setStoryLang(patch.voiceLanguage);
    }

    onUpdateSettings({
      ttsVoice: nextVoice,
      voiceLanguage: nextLang,
      subtitleLanguage: nextLang,
      bgMusicStyle: nextMusic,
      bgMusicVolume: nextVol,
      ...(patch.customBgMusicUrl ? { customBgMusicUrl: patch.customBgMusicUrl } : {}),
      lockedTtsEngine: undefined,
    });

    const updated = saveAudioPreferences({
      ttsVoice: nextVoice,
      voiceLanguage: nextLang,
      bgMusicStyle: nextMusic,
      bgMusicVolume: nextVol,
      storyTopic,
      sceneCount,
    });
    setSavedPrefs(updated);
  };

  const handlePreviewSelectedVoice = async (
    voiceToPreview: ProjectSettings['ttsVoice'],
    langToPreview: 'vi' | 'en'
  ) => {
    if (isPreviewingVoice) return;
    setIsPreviewingVoice(true);
    try {
      const sampleText =
        langToPreview === 'vi'
          ? `Trước khi cả thế giới biết đến cái tên ${storyTopic || 'huyền thoại'}, chỉ có ngọn lửa đam mê và thần thái không thể trộn lẫn.`
          : `Before the world knew the name ${storyTopic || 'this legend'}, there was only a quiet fire and an unbreakable presence on screen.`;
      const persona = VOICE_PERSONA_PROFILES[voiceToPreview] || VOICE_PERSONA_PROFILES.Charon;
      const res = await fetch('/api/tts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: sampleText,
          voiceName: voiceToPreview,
          language: langToPreview,
          style: persona.geminiAnchorPrompt,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.audioDataUrl) {
          const { masteredAudioUrl } = await masterAudioToConsistentStudioWav(
            data.audioDataUrl,
            voiceToPreview,
            data.engine
          );
          await playInstantVoicePreview(masteredAudioUrl);
        }
      }
    } catch {
      // Ignore preview error
    } finally {
      setIsPreviewingVoice(false);
    }
  };

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const newItems: VaultItem[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const detectedKind = detectMediaKindFromFile(file);
      if (!detectedKind) continue;

      const objectUrl = URL.createObjectURL(file);
      const isVideo = detectedKind === 'video';

      let durationSec: number = 7;
      let thumbnailUrl: string | undefined = !isVideo ? objectUrl : undefined;
      if (isVideo) {
        const [dur, thumb] = await Promise.all([
          getMediaDuration(objectUrl, 'video'),
          extractVideoThumbnail(objectUrl),
        ]);
        durationSec = dur;
        thumbnailUrl = thumb;
      }

      newItems.push({
        id: `upload-${Date.now()}-${i}`,
        name: cleanDisplayFileName(file.name),
        type: detectedKind,
        url: objectUrl,
        thumbnailUrl,
        durationSec,
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
            Tự Động A-Z & API
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
          Bảng Chia Đoạn Video/Ảnh & Prompt Full Khung
        </button>
      </div>

      {activeSubTab === 'auto-pilot' ? (
        /* 1-CLICK FULL AUTO-PILOT & CHATGPT PRO BRIDGE */
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
          {/* 1-Click Full Auto-Pilot Box */}
          <div className="p-3.5 rounded-xl bg-[#0B0F17] border border-amber-500/40 space-y-3">
            <div>
              <h3 className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                <Zap className="w-4 h-4" />
                NHẬP TÊN NHÂN VẬT &amp; CHỌN NHẠC / GIỌNG TRƯỚC KHI CHẠY
              </h3>
              <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                Chọn <strong>Nhân vật + Giọng đọc + Nhạc nền</strong> bên dưới. Hệ thống sẽ <strong>tự động lưu lại quá trình chọn</strong> của bạn và áp dụng xuyên suốt khi bấm Chạy!
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-200">
                1. Nhập Tên Nhân Vật (hoặc Chủ đề câu chuyện):
              </label>
              <input
                type="text"
                value={storyTopic}
                onChange={(e) => {
                  const val = e.target.value;
                  setStoryTopic(val);
                  saveAudioPreferences({ storyTopic: val });
                }}
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
                  type="button"
                  onClick={() => {
                    setStoryTopic(name);
                    saveAudioPreferences({ storyTopic: name });
                  }}
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

            {/* PRE-RUN VOICE & BACKGROUND MUSIC SELECTOR + SAVED SELECTION LOG */}
            <div className="p-2.5 rounded-lg bg-[#111827] border border-amber-500/40 space-y-2.5">
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-[11px] font-bold text-amber-400 flex items-center gap-1">
                  <Mic className="w-3.5 h-3.5" />
                  2. Chọn Giọng Đọc &amp; Nhạc Nền Trước Khi Chạy:
                </span>
                <span
                  className={`text-[10px] font-semibold flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors ${
                    justSavedFlash
                      ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/50'
                      : 'bg-emerald-500/10 text-emerald-400'
                  }`}
                >
                  <CheckCircle2 className="w-3 h-3" />
                  Đã lưu ({savedPrefs.updatedAtLabel})
                </span>
              </div>

              {/* 1-Click Quick Combo Presets */}
              <div className="grid grid-cols-2 gap-1">
                {[
                  {
                    id: 'combo-legends',
                    label: '🤠 Chuẩn Life Legends',
                    sub: 'Charon + Guitar Ấm',
                    voice: 'Charon' as const,
                    music: 'western-acoustic' as const,
                    vol: 0.25,
                  },
                  {
                    id: 'combo-epic',
                    label: '🎬 Sử Thi Trầm Hùng',
                    sub: 'Fenrir + Dàn Dây',
                    voice: 'Fenrir' as const,
                    music: 'cinematic-strings' as const,
                    vol: 0.22,
                  },
                  {
                    id: 'combo-nostalgic',
                    label: '🎹 Hồi Ức Lắng Đọng',
                    sub: 'Puck + Piano & Cello',
                    voice: 'Puck' as const,
                    music: 'emotional-piano' as const,
                    vol: 0.24,
                  },
                  {
                    id: 'combo-female',
                    label: '🌸 Nữ Tự Sự Dịu Dàng',
                    sub: 'Kore + Piano Tự Sự',
                    voice: 'Kore' as const,
                    music: 'emotional-piano' as const,
                    vol: 0.2,
                  },
                ].map((c) => {
                  const isActive =
                    settings.ttsVoice === c.voice && settings.bgMusicStyle === c.music;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        handleSelectPreRunAudio({
                          ttsVoice: c.voice,
                          bgMusicStyle: c.music,
                          bgMusicVolume: c.vol,
                        });
                        soundEngine.previewBackgroundMusic(
                          c.music,
                          c.vol,
                          settings.customBgMusicUrl,
                          5000
                        );
                        handlePreviewSelectedVoice(c.voice, storyLang);
                      }}
                      className={`p-1.5 rounded border text-left transition-colors ${
                        isActive
                          ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                          : 'bg-[#0B0F17] hover:bg-slate-800 border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="text-[10px] font-bold leading-tight">{c.label}</div>
                      <div className="text-[9px] text-slate-400 leading-tight mt-0.5">{c.sub}</div>
                    </button>
                  );
                })}
              </div>

              {/* Individual Voice Persona + Language Selection */}
              <div className="space-y-1 pt-1 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-semibold text-slate-300">
                    Giọng đọc thuyết minh &amp; Ngôn ngữ:
                  </label>
                  <button
                    type="button"
                    disabled={isPreviewingVoice}
                    onClick={() => handlePreviewSelectedVoice(settings.ttsVoice, storyLang)}
                    className="px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 disabled:opacity-50 text-emerald-300 border border-emerald-500/40 rounded transition-colors flex items-center gap-1"
                  >
                    <Volume2 className="w-2.5 h-2.5" />
                    {isPreviewingVoice ? 'Đang tạo thử...' : 'Nghe thử giọng'}
                  </button>
                </div>

                <div className="grid grid-cols-5 gap-1">
                  <select
                    value={storyLang}
                    onChange={(e) => {
                      const newLang = e.target.value as 'vi' | 'en';
                      handleSelectPreRunAudio({ voiceLanguage: newLang });
                      handlePreviewSelectedVoice(settings.ttsVoice, newLang);
                    }}
                    className="col-span-2 px-1.5 py-1.5 text-[11px] font-semibold bg-[#0B0F17] border border-slate-700 rounded text-amber-300"
                  >
                    <option value="en">🇺🇸 Tiếng Anh</option>
                    <option value="vi">🇻🇳 Tiếng Việt</option>
                  </select>

                  <select
                    value={settings.ttsVoice}
                    onChange={(e) => {
                      const newVoice = e.target.value as ProjectSettings['ttsVoice'];
                      handleSelectPreRunAudio({ ttsVoice: newVoice });
                      handlePreviewSelectedVoice(newVoice, storyLang);
                    }}
                    className="col-span-3 px-1.5 py-1.5 text-[11px] bg-[#0B0F17] border border-slate-700 rounded text-slate-100"
                  >
                    <option value="Charon">Charon — Nam Trầm Ấm (Chuẩn Mẫu)</option>
                    <option value="Fenrir">Fenrir — Nam Trầm Sâu Uy Nghiêm</option>
                    <option value="Puck">Puck — Nam Truyền Cảm Tự Nhiên</option>
                    <option value="Kore">Kore — Nữ Trầm Dịu Sâu Lắng</option>
                    <option value="Zephyr">Zephyr — Nữ Trong Trẻo Nghệ Thuật</option>
                  </select>
                </div>
              </div>

              {/* Individual Background Music Selection */}
              <div className="space-y-1 pt-1 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-semibold text-slate-300">
                    Nhạc nền phim tài liệu ({Math.round(settings.bgMusicVolume * 100)}%):
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        soundEngine.previewBackgroundMusic(
                          settings.bgMusicStyle,
                          settings.bgMusicVolume,
                          settings.customBgMusicUrl,
                          6000
                        )
                      }
                      className="px-1.5 py-0.5 text-[10px] font-semibold bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 rounded transition-colors"
                    >
                      🔊 Nghe thử nhạc
                    </button>
                    <button
                      type="button"
                      onClick={() => soundEngine.stopBackgroundMusic()}
                      className="px-1.5 py-0.5 text-[10px] text-slate-400 hover:text-slate-200 bg-slate-800 rounded"
                    >
                      Dừng
                    </button>
                  </div>
                </div>

                <select
                  value={settings.bgMusicStyle}
                  onChange={(e) => {
                    const newMusic = e.target.value as ProjectSettings['bgMusicStyle'];
                    handleSelectPreRunAudio({ bgMusicStyle: newMusic });
                    soundEngine.previewBackgroundMusic(
                      newMusic,
                      settings.bgMusicVolume,
                      settings.customBgMusicUrl,
                      6000
                    );
                  }}
                  className="w-full px-2 py-1.5 text-[11px] bg-[#0B0F17] border border-slate-700 rounded text-slate-100"
                >
                  <option value="western-acoustic">
                    🎸 Guitar Acoustic &amp; Piano Ấm (Chuẩn Mẫu Will Sampson)
                  </option>
                  <option value="emotional-piano">
                    🎹 Piano &amp; Cello Hoài Niệm Sâu Lắng
                  </option>
                  <option value="cinematic-strings">
                    🎻 Dàn Dây Cello &amp; Violin Trầm Hùng
                  </option>
                  <option value="vintage-americana">
                    🤠 Guitar Miền Viễn Tây Cổ Điển (Thập Niên 60-70)
                  </option>
                  <option value="custom">
                    📁 Nhạc Nền MP3 Tải Lên ({settings.customBgMusicUrl ? 'Đã nạp' : 'Chưa chọn'})
                  </option>
                  <option value="none">🔇 Tắt nhạc nền</option>
                </select>

                <div className="flex items-center gap-2 pt-0.5">
                  <input
                    type="range"
                    min={0}
                    max={0.8}
                    step={0.02}
                    value={settings.bgMusicVolume}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      handleSelectPreRunAudio({ bgMusicVolume: v });
                      soundEngine.setBgVolume(v);
                    }}
                    className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                  <label className="px-2 py-0.5 text-[10px] font-semibold bg-[#0B0F17] hover:bg-slate-800 text-amber-300 border border-slate-700 rounded cursor-pointer shrink-0">
                    +MP3 Riêng
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const url = URL.createObjectURL(file);
                        handleSelectPreRunAudio({
                          bgMusicStyle: 'custom',
                          customBgMusicUrl: url,
                        });
                        soundEngine.previewBackgroundMusic('custom', settings.bgMusicVolume, url, 7000);
                      }}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Active Locked Selection Summary & Saved Selection History Log */}
              <div className="p-2 rounded bg-[#0B0F17] border border-emerald-500/30 space-y-1.5">
                <div className="text-[10px] text-emerald-300 font-semibold leading-snug">
                  💾 Đang khóa cho lần chạy này:{' '}
                  <span className="text-amber-300">
                    {VOICE_SHORT_LABELS[settings.ttsVoice]} ({storyLang === 'vi' ? 'VI' : 'EN'})
                  </span>{' '}
                  +{' '}
                  <span className="text-sky-300">
                    {BG_MUSIC_STYLE_LABELS[settings.bgMusicStyle]} ({Math.round(settings.bgMusicVolume * 100)}%)
                  </span>
                </div>

                {savedPrefs.history && savedPrefs.history.length > 0 && (
                  <div className="space-y-1 pt-1 border-t border-slate-800/80">
                    <div className="text-[9px] font-semibold text-slate-400 flex items-center gap-1">
                      <History className="w-2.5 h-2.5 text-amber-400" />
                      Quá trình chọn đã lưu (Bấm để khôi phục nhanh):
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {savedPrefs.history.slice(0, 4).map((item, idx) => {
                        const isCurrent =
                          item.ttsVoice === settings.ttsVoice &&
                          item.voiceLanguage === storyLang &&
                          item.bgMusicStyle === settings.bgMusicStyle;
                        return (
                          <button
                            key={item.id || idx}
                            type="button"
                            onClick={() => {
                              handleSelectPreRunAudio({
                                ttsVoice: item.ttsVoice,
                                voiceLanguage: item.voiceLanguage,
                                bgMusicStyle: item.bgMusicStyle,
                                bgMusicVolume: item.bgMusicVolume,
                              });
                            }}
                            title={`Đã lưu lúc ${item.savedAtLabel}`}
                            className={`px-1.5 py-0.5 text-[9px] rounded border transition-colors ${
                              isCurrent
                                ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-200 font-semibold'
                                : 'bg-[#111827] border-slate-800 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {idx === 0 ? '★ ' : ''}
                            {item.ttsVoice} ({item.voiceLanguage.toUpperCase()}) +{' '}
                            {item.bgMusicStyle === 'western-acoustic'
                              ? 'Guitar'
                              : item.bgMusicStyle === 'emotional-piano'
                              ? 'Piano'
                              : item.bgMusicStyle === 'cinematic-strings'
                              ? 'Dàn Dây'
                              : item.bgMusicStyle === 'vintage-americana'
                              ? 'Viễn Tây'
                              : item.bgMusicStyle === 'custom'
                              ? 'MP3'
                              : 'Tắt nhạc'}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Scene Count Selector Buttons (including 14, 16, 18, and 20 scenes) */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-slate-300">
                  3. Chọn số phân cảnh cần dựng:
                </span>
                <span className="text-[10px] font-mono-tabular text-amber-400 font-semibold">
                  Đang chọn: {sceneCount} cảnh
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {[6, 8, 10, 12, 14, 16, 18, 20].map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => {
                      setSceneCount(cnt);
                      saveAudioPreferences({ sceneCount: cnt });
                    }}
                    className={`py-1 text-[11px] font-mono-tabular rounded border transition-colors ${
                      sceneCount === cnt
                        ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                        : 'bg-[#111827] border-slate-800 text-slate-300 hover:border-amber-500/50'
                    }`}
                  >
                    {cnt} cảnh
                  </button>
                ))}
              </div>
            </div>

            {/* 1-CLICK FULL AUTO-PILOT CTA */}
            <button
              onClick={() =>
                onRunFullAutoPilot(
                  storyTopic,
                  storyLang,
                  sceneCount,
                  settings.ttsVoice,
                  settings.bgMusicStyle,
                  settings.bgMusicVolume
                )
              }
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
                  Chạy Tự Động A → Z (Giọng {settings.ttsVoice} + Nhạc Đã Lưu)
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

          {/* ChatGPT Pro & Kling AI Connection Card */}
          <div className="p-3.5 rounded-xl bg-[#0B0F17] border border-slate-800 space-y-2">
            <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <MessageSquareCode className="w-4 h-4 text-emerald-400" />
              Trạm Vẽ Ảnh Full Khung & Tạo Video Kling AI
            </h4>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Mở bảng phân cảnh để <strong>Tạo Ảnh Gốc chuẩn 3:4 (1080×1440px)</strong> chỉ với 1 click, tải Ảnh Gốc + Prompt chuyển động sang <strong>Kling AI (Image-to-Video)</strong> làm video người nổi tiếng không bị chặn, rồi thả lại vào đây!
            </p>
            <button
              onClick={onOpenPromptStudio}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <MessageSquareCode className="w-3.5 h-3.5" />
              Mở Bảng Phân Cảnh & Tạo Ảnh/Video Kling AI
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
                Thả Video (Kling AI) & Ảnh Mới Của Bạn Vào Kho
              </p>
              <p className="text-[11px] text-slate-400">
                Chọn nhiều file .MP4, .MOV, .JPG, .PNG cùng lúc
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onAutoStitchVault}
                disabled={vaultItems.length === 0}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold text-xs rounded-lg shadow-sm transition-colors whitespace-nowrap shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Tự Động Ghép Kho Vào Phim
              </button>

              {vaultItems.length > 0 && (
                <button
                  onClick={onClearVault}
                  title="Xóa toàn bộ ảnh & video trong Kho"
                  className="flex items-center justify-center gap-1 px-2.5 py-2 bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Xóa Kho
                </button>
              )}
            </div>
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
            {filteredItems.length === 0 ? (
              <div className="p-6 text-center rounded-xl border border-dashed border-slate-800 bg-[#0B0F17]/40 space-y-1.5">
                <p className="text-xs font-semibold text-slate-300">
                  Kho tư liệu đang trống (Đã dọn sạch ảnh/video cũ)
                </p>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Hãy tải video Kling AI / ảnh mới của bạn lên, hoặc qua tab <strong>Tự Động A-Z</strong> để tạo ảnh mới!
                </p>
              </div>
            ) : (
              filteredItems.map((item) => {
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

                        <button
                          onClick={() => onRemoveVaultItem(item.id)}
                          title="Xóa khỏi kho"
                          className="p-1 text-slate-500 hover:text-rose-400 transition-colors ml-auto"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
