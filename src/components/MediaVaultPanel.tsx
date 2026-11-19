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
  Search,
  Scissors,
  FileText,
  X,
} from 'lucide-react';
import {
  CustomAttachedImage,
  PresetId,
  ProjectSettings,
  StoryScene,
  StoryTopicMode,
  VaultItem,
} from '../types';
import {
  cleanDisplayFileName,
  detectMediaKindFromFile,
  extractVideoThumbnail,
  getMediaDuration,
} from '../utils/frameExtractor';
import { soundEngine } from '../utils/audioSynth';
import {
  analyzeVoiceCloneDNAFromAudioFile,
  BG_MUSIC_STYLE_LABELS,
  loadActiveVoiceCloneDNA,
  loadSavedAudioPreferences,
  masterAudioToConsistentStudioWav,
  playInstantVoicePreview,
  resetToWillSampsonVoiceCloneDNA,
  saveAudioPreferences,
  SavedAudioPreferences,
  VOICE_PERSONA_PROFILES,
  VOICE_SHORT_LABELS,
  VoiceCloneDNAProfile,
  WILL_SAMPSON_SAMPLE_VOICE_URL,
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
  onGenerateAIStory: (
    topic: string,
    lang: 'vi' | 'en',
    sceneCount: number,
    overrideStoryMode?: StoryTopicMode,
    customSummary?: string,
    customImages?: CustomAttachedImage[]
  ) => Promise<void>;
  isGeneratingStory: boolean;
  onRunFullAutoPilot: (
    characterOrTopic: string,
    lang: 'en' | 'vi',
    sceneCount: number,
    overrideVoice?: ProjectSettings['ttsVoice'],
    overrideMusicStyle?: ProjectSettings['bgMusicStyle'],
    overrideMusicVolume?: number,
    overrideStoryMode?: StoryTopicMode,
    customSummary?: string,
    customImages?: CustomAttachedImage[]
  ) => Promise<void>;
  isRunningAutoPilot: boolean;
  autoPilotStepText: string;
  onFetchArchivalPhotos: (characterQuery: string) => Promise<void>;
  isFetchingArchival: boolean;
  onFetchAndInsertTrimmedActorVideos?: (
    characterQuery?: string,
    desiredCount?: number,
    targetCurrentSceneOnly?: boolean
  ) => Promise<void>;
  isTrimmingRealVideos?: boolean;
  activePresetId: PresetId;
  onSelectPreset: (presetId: PresetId) => void;
  onOpenPromptStudio: () => void;
  settings: ProjectSettings;
  onUpdateSettings: (patch: Partial<ProjectSettings>) => void;
  onOpenSceneMediaSearch?: (sceneId: string) => void;
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
  onFetchAndInsertTrimmedActorVideos,
  isTrimmingRealVideos = false,
  onOpenPromptStudio,
  settings,
  onUpdateSettings,
  onOpenSceneMediaSearch,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'video' | 'image'>('all');
  const [activeSubTab, setActiveSubTab] = useState<'auto-pilot' | 'vault'>('auto-pilot');

  const initialSaved = loadSavedAudioPreferences();
  const [storyMode, setStoryMode] = useState<StoryTopicMode>(
    settings.storyMode || initialSaved.storyMode || 'biography'
  );
  const [storyTopic, setStoryTopic] = useState<string>(
    initialSaved.storyTopic ||
      settings.projectTitle?.split('—')[0]?.split('-')[0]?.trim() ||
      'Clint Eastwood'
  );

  useEffect(() => {
    if (settings.storyMode && settings.storyMode !== storyMode) {
      setStoryMode(settings.storyMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.storyMode]);

  // Sync storyTopic when settings.projectTitle changes from preset selection
  useEffect(() => {
    const cleanTitle = settings.projectTitle?.split('—')[0]?.split('-')[0]?.trim();
    if (cleanTitle && cleanTitle !== storyTopic) {
      setStoryTopic(cleanTitle);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.projectTitle]);
  const [storyLang, setStoryLang] = useState<'vi' | 'en'>(
    settings.voiceLanguage || initialSaved.voiceLanguage || 'en'
  );
  const [sceneCount, setSceneCount] = useState<number>(initialSaved.sceneCount || 16);
  const [customSummary, setCustomSummary] = useState<string>(initialSaved.customSummary || '');
  const [customImages, setCustomImages] = useState<CustomAttachedImage[]>([]);
  const [isSplittingCollage, setIsSplittingCollage] = useState<boolean>(false);
  const customImageInputRef = useRef<HTMLInputElement | null>(null);
  const [savedPrefs, setSavedPrefs] = useState<SavedAudioPreferences>(initialSaved);
  const [voiceCloneDna, setVoiceCloneDna] = useState<VoiceCloneDNAProfile>(() =>
    loadActiveVoiceCloneDNA()
  );
  const [isAnalyzingVoiceDna, setIsAnalyzingVoiceDna] = useState<boolean>(false);
  const [isPreviewingVoice, setIsPreviewingVoice] = useState<boolean>(false);
  const [justSavedFlash, setJustSavedFlash] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState(false);

  const DOLLY_CARL_SAMPLE_IMAGE_URL =
    '/assets/aistudio/901279760_1272860051716596_7338143820151457037_n_b367a076.jfif';
  const DOLLY_CARL_SAMPLE_SUMMARY = `When record label boss Fred Foster asked Dolly Parton to delay her wedding in 1966 to protect his investment in her career, she drove across the state line to Georgia and married Carl Dean anyway.
On Memorial Day, May 30, 1966, the twenty-year-old singer and the twenty-three-year-old asphalt paver slipped into Ringgold, Georgia, so Nashville newspapers would not see their marriage license. Dolly wore a short white dress she had bought off the rack, and Carl wore a simple dark suit. Only Dolly's mother, Avie Lee Parton, accompanied them inside the Ringgold First Baptist Church, where Pastor Don Duvall officiated while his wife, Gladys, played the organ and stood in as the second witness.
For the next fifty years, they kept that same distance from the music business. After attending a single industry dinner in 1966, Carl stayed out of the spotlight on their Brentwood property, Willow Lake Plantation, while Dolly built a global career.
To mark their golden anniversary on May 30, 2016, they held the formal ceremony they had skipped five decades earlier. Inside the private chapel on their Nashville estate, Dolly finally walked down the aisle in a custom-made ivory lace gown designed by Steve Summers, while Carl traded his work jeans for a tailored suit and tie.
Before the ceremony, Dolly offered to sell the official wedding photographs to the press so the proceeds could benefit her Imagination Library, which mails free books to children. Carl, who had avoided cameras for half a century, agreed to pose for the portraits to help fund his wife's literacy program.
After the vows, the couple skipped a lavish reception and spent the afternoon eating lunch inside their RV in the driveway, enjoying the quiet marriage they had protected since Ringgold until Carl's passing in March 2025.`;

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Không thể đọc file ảnh'));
      reader.readAsDataURL(file);
    });

  const handleCustomImagesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const loaded: CustomAttachedImage[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      if (!f.type.startsWith('image/') && !/\.(jpe?g|png|webp|jfif|gif|bmp)$/i.test(f.name)) {
        continue;
      }
      try {
        const dataUrl = await readFileAsDataUrl(f);
        if (dataUrl) {
          loaded.push({
            id: `cimg-${Date.now()}-${i}`,
            name: cleanDisplayFileName(f.name),
            url: dataUrl,
          });
        }
      } catch {
        // ignore read error
      }
    }
    if (loaded.length > 0) {
      setCustomImages((prev) => [...prev, ...loaded]);
    }
  };

  const handleSplitCollageImage = async (targetImg: CustomAttachedImage) => {
    if (isSplittingCollage || !targetImg?.url) return;
    setIsSplittingCollage(true);
    try {
      const res = await fetch('/api/media/split-collage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: targetImg.url }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.panels) && data.panels.length > 0) {
          setCustomImages((prev) => [
            ...prev.filter((p) => p.id !== targetImg.id),
            ...data.panels.map((pn: any) => ({
              id: pn.id,
              name: pn.name,
              url: pn.url,
              width: pn.width,
              height: pn.height,
            })),
          ]);
        }
      }
    } catch {
      // ignore split error
    } finally {
      setIsSplittingCollage(false);
    }
  };

  const handleLoadDollyCarlSample = async () => {
    setStoryMode('custom-story');
    setStoryTopic('Dolly Parton & Carl Dean');
    setCustomSummary(DOLLY_CARL_SAMPLE_SUMMARY);
    onUpdateSettings({ storyMode: 'custom-story', projectTitle: 'Dolly Parton & Carl Dean' });
    saveAudioPreferences({
      storyMode: 'custom-story',
      storyTopic: 'Dolly Parton & Carl Dean',
      customSummary: DOLLY_CARL_SAMPLE_SUMMARY,
    });

    const fallbackImg: CustomAttachedImage = {
      id: `cimg-dolly-${Date.now()}`,
      name: 'Dolly Parton & Carl Dean (Ảnh ghép gốc)',
      url: DOLLY_CARL_SAMPLE_IMAGE_URL,
      width: 700,
      height: 875,
    };
    setCustomImages([fallbackImg]);

    setIsSplittingCollage(true);
    try {
      const res = await fetch('/api/media/split-collage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: DOLLY_CARL_SAMPLE_IMAGE_URL }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.panels) && data.panels.length > 0) {
          setCustomImages(
            data.panels.map((pn: any) => ({
              id: pn.id,
              name: pn.name,
              url: pn.url,
              width: pn.width,
              height: pn.height,
            }))
          );
        }
      }
    } catch {
      // keep single fallbackImg
    } finally {
      setIsSplittingCollage(false);
    }
  };

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
    const onDnaUpdated = (e: Event) => {
      const custom = e as CustomEvent<VoiceCloneDNAProfile>;
      if (custom.detail) {
        setVoiceCloneDna(custom.detail);
      }
    };
    window.addEventListener('legendcut:audioprefs-saved', onSavedEvt);
    window.addEventListener('legendcut:voice-clone-dna-updated', onDnaUpdated);
    return () => {
      window.removeEventListener('legendcut:audioprefs-saved', onSavedEvt);
      window.removeEventListener('legendcut:voice-clone-dna-updated', onDnaUpdated);
    };
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
          ? `Tháng Mười Một là Tháng Di sản Người Bản địa Mỹ, và không có cách nào ý nghĩa hơn để mở đầu bằng việc tưởng nhớ huyền thoại ${storyTopic || 'Will Sampson'}.`
          : `No acting lessons. No screen tests. No experience at all. Yet ${storyTopic || 'Will Sampson'} walked onto a movie set and delivered a performance the world would never forget.`;
      const persona = VOICE_PERSONA_PROFILES[voiceToPreview] || VOICE_PERSONA_PROFILES.Charon;
      const activeDna = loadActiveVoiceCloneDNA();
      const clonePitch =
        voiceToPreview === 'Charon'
          ? langToPreview === 'vi'
            ? activeDna.ssmlPitchVi
            : activeDna.ssmlPitchEn
          : undefined;
      const cloneRate =
        voiceToPreview === 'Charon'
          ? langToPreview === 'vi'
            ? activeDna.ssmlRateVi
            : activeDna.ssmlRateEn
          : undefined;

      const res = await fetch('/api/tts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: sampleText,
          voiceName: voiceToPreview,
          language: langToPreview,
          style: persona.geminiAnchorPrompt,
          clonePitch,
          cloneRate,
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
                CHỌN CHỦ ĐỀ · NHẬP TÊN &amp; CHẠY TỰ ĐỘNG
              </h3>
              <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                Chọn <strong>Tiểu Sử</strong>, <strong>Tóm Tắt Phim &amp; Sao</strong>, hoặc <strong>Dán Tóm Tắt + Ảnh Đính Kèm</strong> để tự dựng video tiểu sử chuẩn kênh!
              </p>
            </div>

            {/* Topic Mode Switcher: Biography vs Film Summary vs Custom Summary vs Birthday Tribute */}
            <div className="grid grid-cols-4 gap-1 p-1 rounded-lg bg-[#111827] border border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setStoryMode('biography');
                  onUpdateSettings({ storyMode: 'biography' });
                  saveAudioPreferences({ storyMode: 'biography' });
                }}
                className={`px-1 py-1.5 rounded-md text-[10px] font-bold transition-all flex items-center justify-center gap-0.5 whitespace-nowrap ${
                  storyMode === 'biography'
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <span>👤 Tiểu Sử</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setStoryMode('film-cast');
                  onUpdateSettings({ storyMode: 'film-cast' });
                  saveAudioPreferences({ storyMode: 'film-cast' });
                }}
                className={`px-1 py-1.5 rounded-md text-[10px] font-bold transition-all flex items-center justify-center gap-0.5 whitespace-nowrap ${
                  storyMode === 'film-cast'
                    ? 'bg-sky-500 text-slate-950 shadow'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <span>🎬 Phim &amp; Sao</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setStoryMode('custom-story');
                  onUpdateSettings({ storyMode: 'custom-story' });
                  saveAudioPreferences({ storyMode: 'custom-story' });
                }}
                className={`px-1 py-1.5 rounded-md text-[10px] font-bold transition-all flex items-center justify-center gap-0.5 whitespace-nowrap ${
                  storyMode === 'custom-story'
                    ? 'bg-emerald-500 text-slate-950 shadow'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <span>📝 Tóm Tắt</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setStoryMode('birthday-tribute');
                  onUpdateSettings({ storyMode: 'birthday-tribute' });
                  saveAudioPreferences({ storyMode: 'birthday-tribute' });
                  setStoryTopic('Happy 58th Birthday to Owen Wilson! 🎉🎬 (Born November 18, 1968)');
                  saveAudioPreferences({ storyTopic: 'Happy 58th Birthday to Owen Wilson! 🎉🎬 (Born November 18, 1968)', storyMode: 'birthday-tribute' });
                }}
                className={`px-1 py-1.5 rounded-md text-[10px] font-bold transition-all flex items-center justify-center gap-0.5 whitespace-nowrap ${
                  storyMode === 'birthday-tribute'
                    ? 'bg-rose-500 text-slate-950 shadow'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <span>🎂 Sinh Nhật</span>
              </button>
            </div>

            {storyMode === 'custom-story' ? (
              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-emerald-300">
                    1A. Tiêu đề Nhân vật / Câu chuyện (có thể để trống, AI tự nhận diện):
                  </label>
                  <input
                    type="text"
                    value={storyTopic}
                    onChange={(e) => {
                      const val = e.target.value;
                      setStoryTopic(val);
                      saveAudioPreferences({ storyTopic: val, storyMode: 'custom-story' });
                      if (val.trim()) {
                        onUpdateSettings({ projectTitle: val.trim(), storyMode: 'custom-story' });
                      }
                    }}
                    placeholder="VD: Dolly Parton & Carl Dean (tự nhận diện nếu để trống)"
                    className="w-full px-3 py-1.5 text-xs bg-[#111827] border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-1">
                    <label className="text-[11px] font-semibold text-emerald-300 flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      1B. Dán Tóm Tắt Nội Dung Tiểu Sử (Anh hoặc Việt):
                    </label>
                    <button
                      type="button"
                      onClick={handleLoadDollyCarlSample}
                      disabled={isSplittingCollage}
                      className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/40 rounded transition-colors shrink-0"
                    >
                      ✨ Nạp Mẫu Dolly &amp; Carl + Ảnh
                    </button>
                  </div>
                  <textarea
                    rows={5}
                    value={customSummary}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomSummary(val);
                      saveAudioPreferences({ customSummary: val, storyMode: 'custom-story' });
                    }}
                    placeholder="Dán đoạn tóm tắt nội dung câu chuyện / tiểu sử vào đây (giữ nguyên tên riêng, năm tháng, sự kiện)... Hoặc bấm '✨ Nạp Mẫu Dolly & Carl + Ảnh' để thử ngay!"
                    className="w-full px-2.5 py-2 text-[11px] leading-relaxed bg-[#111827] border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 resize-y"
                  />
                </div>

                {/* Attached Images + Collage Splitter */}
                <div className="p-2 rounded-lg bg-[#111827] border border-emerald-500/35 space-y-2">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-bold text-emerald-300">
                      1C. Hình Ảnh Đính Kèm ({customImages.length} ảnh):
                    </span>
                    <div className="flex items-center gap-1">
                      <input
                        ref={customImageInputRef}
                        type="file"
                        multiple
                        accept="image/*,.jfif"
                        onChange={(e) => {
                          handleCustomImagesSelected(e.target.files);
                          e.target.value = '';
                        }}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => customImageInputRef.current?.click()}
                        className="px-2 py-1 text-[10px] font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/40 rounded flex items-center gap-1 transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        Thêm Ảnh Đính Kèm
                      </button>
                    </div>
                  </div>

                  {customImages.length === 0 ? (
                    <p className="text-[10px] text-slate-400 leading-snug">
                      Tải lên 1 hoặc nhiều ảnh thật của nhân vật/câu chuyện. Nếu ảnh của bạn là <strong>ảnh ghép 3 khung</strong>, bấm <strong>✂️ Tách 3 Khung</strong> để hệ thống cắt thành 3 ảnh 3:4 sắc nét ghép tự động vào các cảnh!
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-3 gap-1.5">
                        {customImages.map((img) => (
                          <div
                            key={img.id}
                            className="relative group rounded-md overflow-hidden border border-slate-700 bg-slate-900"
                          >
                            <img
                              src={img.url}
                              alt={img.name}
                              className="w-full h-20 object-cover"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setCustomImages((prev) => prev.filter((p) => p.id !== img.id))
                              }
                              title="Xóa ảnh này"
                              className="absolute top-1 right-1 p-0.5 rounded bg-black/75 text-slate-200 hover:text-rose-400"
                            >
                              <X className="w-3 h-3" />
                            </button>
                            {!img.id.startsWith('split-') && (
                              <button
                                type="button"
                                disabled={isSplittingCollage}
                                onClick={() => handleSplitCollageImage(img)}
                                title="Tách ảnh ghép 3 khung thành 3 ảnh 3:4 riêng biệt"
                                className="w-full py-0.5 text-[9px] font-bold bg-amber-500/90 hover:bg-amber-400 text-slate-950 flex items-center justify-center gap-0.5"
                              >
                                <Scissors className="w-2.5 h-2.5" />
                                {isSplittingCollage ? 'Đang tách...' : 'Tách 3 Khung'}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-emerald-300/90">
                        ✓ Các ảnh trên sẽ được ưu tiên ghép đúng mạch truyện; cảnh còn lại tự tìm thêm ảnh/video thật &amp; tạo Prompt Kling AI.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-200">
                    {storyMode === 'film-cast'
                      ? '1. Nhập Tên Bộ Phim cần tóm tắt & điểm danh Dàn Diễn Viên:'
                      : storyMode === 'birthday-tribute'
                      ? '1. Nhập Nội Dung Mừng Sinh Nhật / Tên Diễn Viên:'
                      : '1. Nhập Tên Nhân Vật (hoặc Chủ đề câu chuyện):'}
                  </label>
                  <input
                    type="text"
                    value={storyTopic}
                    onChange={(e) => {
                      const val = e.target.value;
                      setStoryTopic(val);
                      saveAudioPreferences({ storyTopic: val, storyMode });
                      if (val.trim()) {
                        onUpdateSettings({ projectTitle: val.trim(), storyMode });
                      }
                    }}
                    placeholder={
                      storyMode === 'film-cast'
                        ? 'VD: Ở Nhà 1 Mình, Ngôi Nhà Nhỏ Trên Thảo Nguyên, Titanic, Bố Già...'
                        : storyMode === 'birthday-tribute'
                        ? 'VD: Happy 58th Birthday to Owen Wilson! 🎉🎬 (Born November 18, 1968)'
                        : 'VD: Clint Eastwood, John Wayne, Audrey Hepburn...'
                    }
                    className="w-full px-3 py-2 text-xs bg-[#111827] border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Quick presets matching active Story Mode */}
                <div className="flex flex-wrap gap-1.5">
                  {(storyMode === 'film-cast'
                    ? [
                        'Ở Nhà 1 Mình',
                        'Ngôi Nhà Nhỏ Trên Thảo Nguyên',
                        'Titanic',
                        'Bố Già (The Godfather)',
                        'Tây Du Ký 1986',
                        'Cuốn Theo Chiều Gió',
                      ]
                    : storyMode === 'birthday-tribute'
                    ? [
                        'Happy 58th Birthday to Owen Wilson! 🎉🎬 (Born November 18, 1968)',
                        'Happy 71st Birthday to Whoopi Goldberg! 🎉🎬 (Born November 13, 1955)',
                        'Leonardo DiCaprio',
                        'Keanu Reeves',
                      ]
                    : [
                        'Clint Eastwood',
                        'John Wayne',
                        'Steve McQueen',
                        'Bruce Lee',
                        'Elvis Presley',
                        'Audrey Hepburn',
                      ]
                  ).map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => {
                        setStoryTopic(name);
                        saveAudioPreferences({ storyTopic: name, storyMode });
                        onUpdateSettings({ projectTitle: name, storyMode });
                      }}
                      className={`px-2 py-1 text-[11px] rounded border transition-colors ${
                        storyTopic === name
                          ? storyMode === 'film-cast'
                            ? 'bg-sky-500/20 border-sky-400 text-sky-200 font-semibold'
                            : storyMode === 'birthday-tribute'
                            ? 'bg-rose-500/20 border-rose-400 text-rose-200 font-semibold'
                            : 'bg-amber-500/20 border-amber-500 text-amber-300 font-semibold'
                          : 'bg-[#111827] border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {storyMode === 'film-cast'
                        ? `🎬 ${name}`
                        : storyMode === 'birthday-tribute'
                        ? `🎂 ${name.includes('Birthday') ? name.split('to ')[1]?.split('!')[0] || name : name}`
                        : name}
                    </button>
                  ))}
                </div>
              </>
            )}

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
                    label: '⭐ Bản Đọc Chuẩn',
                    sub: 'Bản Đọc Chuẩn + Guitar Ấm',
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
                    <option value="Charon">
                      ⭐ Bản Đọc Chuẩn (Giọng Nhân Bản Gốc 103.4Hz)
                    </option>
                    <option value="Fenrir">Fenrir — Nam Trầm Sâu Uy Nghiêm</option>
                    <option value="Puck">Puck — Nam Truyền Cảm Tự Nhiên</option>
                    <option value="Kore">Kore — Nữ Trầm Dịu Sâu Lắng</option>
                    <option value="Zephyr">Zephyr — Nữ Trong Trẻo Nghệ Thuật</option>
                  </select>
                </div>

                {/* Will Sampson Voice Clone DNA Box */}
                <div className="mt-1.5 p-2 rounded-md bg-emerald-950/25 border border-emerald-500/35 space-y-1.5">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-bold text-emerald-300 truncate">
                      {voiceCloneDna.label}
                    </span>
                    <span className="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded shrink-0">
                      Khớp {voiceCloneDna.similarityScore}% DNA
                    </span>
                  </div>

                  <div className="text-[9px] text-slate-300 leading-snug">
                    Đã trích xuất &amp; khóa thông số từ file mẫu:{' '}
                    <span className="text-amber-300 font-semibold">
                      F0={voiceCloneDna.medianF0Hz}Hz ({voiceCloneDna.p25F0Hz}–{voiceCloneDna.p75F0Hz}Hz) ·{' '}
                      {voiceCloneDna.wpm} WPM ({storyLang === 'vi' ? voiceCloneDna.ssmlPitchVi : voiceCloneDna.ssmlPitchEn} /{' '}
                      {storyLang === 'vi' ? voiceCloneDna.ssmlRateVi : voiceCloneDna.ssmlRateEn}) · EQ 5 Dải
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        playInstantVoicePreview(
                          voiceCloneDna.sourceSampleUrl || WILL_SAMPSON_SAMPLE_VOICE_URL,
                          0.95
                        )
                      }
                      className="px-1.5 py-1 text-[9px] font-semibold bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-500/30 rounded transition-colors flex items-center justify-center gap-1"
                    >
                      <Volume2 className="w-2.5 h-2.5 shrink-0" />
                      <span>Nghe Mẫu Gốc</span>
                    </button>

                    <button
                      type="button"
                      disabled={isPreviewingVoice}
                      onClick={() => {
                        handleSelectPreRunAudio({ ttsVoice: 'Charon' });
                        handlePreviewSelectedVoice('Charon', storyLang);
                      }}
                      className="px-1.5 py-1 text-[9px] font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 disabled:opacity-50 text-emerald-200 border border-emerald-500/40 rounded transition-colors flex items-center justify-center gap-1"
                    >
                      <Sparkles className="w-2.5 h-2.5 shrink-0" />
                      <span>
                        {isPreviewingVoice ? 'Đang phát...' : 'Nghe ⭐ Bản Đọc Chuẩn'}
                      </span>
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-1 pt-0.5">
                    <label className="flex-1 px-2 py-1 text-[9px] font-semibold bg-[#0B0F17] hover:bg-slate-800 text-sky-300 border border-slate-700 rounded cursor-pointer text-center transition-colors">
                      {isAnalyzingVoiceDna
                        ? '⏳ Đang phân tích F0 & EQ từ file...'
                        : '🧬 +Tải File Audio Khác Để Nhân Bản Giọng (.mp3/.wav)'}
                      <input
                        type="file"
                        accept="audio/*"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setIsAnalyzingVoiceDna(true);
                          try {
                            const cloned = await analyzeVoiceCloneDNAFromAudioFile(file);
                            setVoiceCloneDna(cloned);
                            handleSelectPreRunAudio({ ttsVoice: 'Charon' });
                            await handlePreviewSelectedVoice('Charon', storyLang);
                          } finally {
                            setIsAnalyzingVoiceDna(false);
                          }
                        }}
                        className="hidden"
                      />
                    </label>

                    {voiceCloneDna.id !== 'will-sampson-original-dna' && (
                      <button
                        type="button"
                        onClick={() => {
                          const def = resetToWillSampsonVoiceCloneDNA();
                          setVoiceCloneDna(def);
                          handleSelectPreRunAudio({ ttsVoice: 'Charon' });
                        }}
                        className="px-1.5 py-1 text-[9px] bg-slate-800 hover:bg-slate-700 text-amber-300 rounded shrink-0"
                        title="Khôi phục về Bản Đọc Chuẩn"
                      >
                        Về Bản Đọc Chuẩn
                      </button>
                    )}
                  </div>
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
                            {VOICE_SHORT_LABELS[item.ttsVoice] || item.ttsVoice} ({item.voiceLanguage.toUpperCase()}) +{' '}
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
                  settings.bgMusicVolume,
                  storyMode,
                  storyMode === 'custom-story' ? customSummary : undefined,
                  storyMode === 'custom-story' ? customImages : undefined
                )
              }
              disabled={
                isRunningAutoPilot ||
                (!storyTopic.trim() && !(storyMode === 'custom-story' && customSummary.trim()))
              }
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
                  {storyMode === 'custom-story'
                    ? `Dựng Video Từ Tóm Tắt & Ảnh (${VOICE_SHORT_LABELS[settings.ttsVoice]})`
                    : storyMode === 'film-cast'
                    ? `Dựng Phim & Dàn Sao A → Z (${VOICE_SHORT_LABELS[settings.ttsVoice]})`
                    : `Chạy Tự Động A → Z (${VOICE_SHORT_LABELS[settings.ttsVoice]} + Nhạc Đã Lưu)`}
                </>
              )}
            </button>

            {/* Secondary actions: Only Script or Only Fetch Photos */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() =>
                  onGenerateAIStory(
                    storyTopic,
                    storyLang,
                    sceneCount,
                    storyMode,
                    storyMode === 'custom-story' ? customSummary : undefined,
                    storyMode === 'custom-story' ? customImages : undefined
                  )
                }
                disabled={
                  isGeneratingStory ||
                  isRunningAutoPilot ||
                  (!storyTopic.trim() && !(storyMode === 'custom-story' && customSummary.trim()))
                }
                className="flex items-center justify-center gap-1 px-2.5 py-1.5 text-[11px] font-medium bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-md border border-slate-700 transition-colors whitespace-nowrap shrink-0"
              >
                <Wand2 className="w-3 h-3 text-amber-400" />
                Chỉ Tạo Kịch Bản &amp; Prompt
              </button>
              <button
                onClick={() => onFetchArchivalPhotos(storyTopic || customSummary.slice(0, 40))}
                disabled={isFetchingArchival || isRunningAutoPilot || (!storyTopic.trim() && !customSummary.trim())}
                className="flex items-center justify-center gap-1 px-2.5 py-1.5 text-[11px] font-medium bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-md border border-slate-700 transition-colors whitespace-nowrap shrink-0"
              >
                {isFetchingArchival ? (
                  <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                ) : (
                  <Globe className="w-3 h-3 text-emerald-400" />
                )}
                Tự Tìm Ảnh Thật Vào Kho
              </button>
            </div>

            {/* 1-Click Open Real Video Search Modal or Auto-Trim 3 Real Videos */}
            {onOpenSceneMediaSearch && (
              <button
                type="button"
                onClick={() => {
                  if (storyTopic.trim()) {
                    onUpdateSettings({ projectTitle: storyTopic.trim() });
                  }
                  onOpenSceneMediaSearch(activeScene?.id || '__YOUTUBE_BATCH__');
                }}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-400/60 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Search className="w-3.5 h-3.5 text-amber-300" />
                <span>🔍 Mở Kho Tìm &amp; Cắt Video Thực Tế (YouTube / TikTok / Instagram)</span>
              </button>
            )}

            {/* 1-Click Fetch, Cut & Insert 3 Real Actor Videos into Timeline */}
            {onFetchAndInsertTrimmedActorVideos && (
              <button
                type="button"
                onClick={() => onFetchAndInsertTrimmedActorVideos(storyTopic, 3, false)}
                disabled={isTrimmingRealVideos || isRunningAutoPilot || !storyTopic.trim()}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold bg-sky-500/20 hover:bg-sky-500/30 disabled:opacity-50 text-sky-200 border border-sky-400/50 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                {isTrimmingRealVideos ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-300" />
                    <span>Đang lấy, cắt &amp; chèn 3 Video Thật...</span>
                  </>
                ) : (
                  <>
                    <Film className="w-3.5 h-3.5 text-sky-300" />
                    <span>🎬 Tự Lấy, Cắt &amp; Chèn 3 Video Thật Diễn Viên (1-Click)</span>
                  </>
                )}
              </button>
            )}
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
