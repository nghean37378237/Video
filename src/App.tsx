/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  INITIAL_PROJECT_SETTINGS,
  INITIAL_VAULT_ITEMS,
  LORNE_GREENE_SCENES,
  PRESET_SCENES_MAP,
  REFERENCE_VIDEOS,
  WILL_SAMPSON_SCENES,
} from './data/lorneGreenePreset';
import {
  ColorFilter,
  FrameStyle,
  MotionEffect,
  PresetId,
  ProjectSettings,
  SceneType,
  StoryScene,
  VaultItem,
} from './types';
import {
  cleanDisplayFileName,
  detectMediaKindFromFile,
  extractFramesFromVideo,
  extractSceneNumberFromFileName,
  extractVideoThumbnail,
  getMediaDuration,
} from './utils/frameExtractor';
import { generateVintageArchivalDataUrl } from './utils/vintageCardGenerator';
import {
  buildFullFrameImagePrompt,
  buildFullFrameVideoPrompt,
  buildStandardKlingDrawPrompt,
} from './utils/fullFrameHelper';
import {
  BG_MUSIC_STYLE_LABELS,
  detectProjectVoiceLanguage,
  loadSavedAudioPreferences,
  masterAudioToConsistentStudioWav,
  resolveConsistentSceneText,
  saveAudioPreferences,
  VOICE_PERSONA_PROFILES,
  VOICE_SHORT_LABELS,
} from './utils/voiceConsistencyEngine';
import { CanvasStage } from './components/CanvasStage';
import { MediaVaultPanel } from './components/MediaVaultPanel';
import { SceneInspector } from './components/SceneInspector';
import { TimelineStrip } from './components/TimelineStrip';
import { ScriptPromptStudioModal } from './components/ScriptPromptStudioModal';

export default function App() {
  const [vaultItems, setVaultItems] = useState<VaultItem[]>(INITIAL_VAULT_ITEMS);
  const [scenes, setScenes] = useState<StoryScene[]>(WILL_SAMPSON_SCENES);
  const [settings, setSettings] = useState<ProjectSettings>(() => {
    const saved = loadSavedAudioPreferences();
    return {
      ...INITIAL_PROJECT_SETTINGS,
      ttsVoice: saved.ttsVoice || INITIAL_PROJECT_SETTINGS.ttsVoice,
      voiceLanguage: saved.voiceLanguage || INITIAL_PROJECT_SETTINGS.voiceLanguage,
      subtitleLanguage: saved.voiceLanguage || INITIAL_PROJECT_SETTINGS.subtitleLanguage,
      bgMusicStyle: saved.bgMusicStyle || INITIAL_PROJECT_SETTINGS.bgMusicStyle,
      bgMusicVolume:
        typeof saved.bgMusicVolume === 'number'
          ? saved.bgMusicVolume
          : INITIAL_PROJECT_SETTINGS.bgMusicVolume,
    };
  });
  const [activeSceneId, setActiveSceneId] = useState<string>(WILL_SAMPSON_SCENES[0].id);
  const [currentTimeSec, setCurrentTimeSec] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isExtractingFrames, setIsExtractingFrames] = useState<boolean>(false);
  const [isGeneratingStory, setIsGeneratingStory] = useState<boolean>(false);
  const [isParsingScript, setIsParsingScript] = useState<boolean>(false);
  const [isGeneratingAllTTS, setIsGeneratingAllTTS] = useState<boolean>(false);
  const [ttsProgressText, setTtsProgressText] = useState<string>('');
  const [isRunningAutoPilot, setIsRunningAutoPilot] = useState<boolean>(false);
  const [autoPilotStepText, setAutoPilotStepText] = useState<string>('');
  const [isFetchingArchival, setIsFetchingArchival] = useState<boolean>(false);
  const [triggerExportCounter, setTriggerExportCounter] = useState<number>(0);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [isPromptStudioOpen, setIsPromptStudioOpen] = useState<boolean>(false);
  const [proxyBaseUrl, setProxyBaseUrl] = useState<string>('https://chat.trollllm.xyz/v1');
  const [proxyModel, setProxyModel] = useState<string>('claude-sonnet-4-6');
  const [generatingImageSceneId, setGeneratingImageSceneId] = useState<string | null>(null);
  const [isLightTheme, setIsLightTheme] = useState<boolean>(true);

  const activeScene = scenes.find((s) => s.id === activeSceneId) || scenes[0];

  const handleUpdateSettings = useCallback((patch: Partial<ProjectSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      if (
        patch.ttsVoice !== undefined ||
        patch.voiceLanguage !== undefined ||
        patch.bgMusicStyle !== undefined ||
        patch.bgMusicVolume !== undefined
      ) {
        saveAudioPreferences({
          ttsVoice: next.ttsVoice,
          voiceLanguage: next.voiceLanguage || (next.subtitleLanguage === 'vi' ? 'vi' : 'en'),
          bgMusicStyle: next.bgMusicStyle,
          bgMusicVolume: next.bgMusicVolume,
        });
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const customEvt = e as CustomEvent<'reference-video' | 'stitched-scenes'>;
      if (customEvt.detail) {
        setSettings((prev) => ({ ...prev, audioMode: customEvt.detail }));
      }
    };
    const transHandler = (e: Event) => {
      const customEvt = e as CustomEvent<ProjectSettings['transitionStyle']>;
      if (customEvt.detail) {
        setSettings((prev) => ({ ...prev, transitionStyle: customEvt.detail }));
      }
    };
    window.addEventListener('legendcut:audiomode', handler);
    window.addEventListener('legendcut:transition', transHandler);
    return () => {
      window.removeEventListener('legendcut:audiomode', handler);
      window.removeEventListener('legendcut:transition', transHandler);
    };
  }, []);

  // Extract frames helper if needed
  const handleExtractSampleFrames = useCallback(
    async (overrideUrl?: string, overrideLabel?: string) => {
      if (isExtractingFrames) return;
      const videoUrl = overrideUrl || settings.referenceVideoUrl;
      if (!videoUrl) return;
      setIsExtractingFrames(true);
      try {
        const label = overrideLabel || 'Ảnh Tư Liệu';
        const timestamps = [2, 12, 29, 48, 76, 114, 142, 168];
        const extracted = await extractFramesFromVideo(videoUrl, timestamps, label);
        if (extracted.length > 0) {
          setVaultItems((prev) => {
            const existingNonExtracted = prev.filter((item) => item.sourceTag !== 'extracted');
            return [...existingNonExtracted, ...extracted];
          });
        }
      } finally {
        setIsExtractingFrames(false);
      }
    },
    [isExtractingFrames, settings.referenceVideoUrl]
  );

  // Automatically fetch real historical photos AND videos of any character from Wikimedia Commons
  const fetchArchivalPhotosInternal = async (characterQuery: string): Promise<VaultItem[]> => {
    try {
      const res = await fetch('/api/archival/fetch-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: characterQuery, limit: 12 }),
      });
      if (!res.ok) return [];
      const data = await safeParseJsonResponse(res);
      if (!Array.isArray(data?.photos) || data.photos.length === 0) return [];

      const fetchedItems: VaultItem[] = data.photos.map((p: any, idx: number) => {
        const isVideo = p.mediaKind === 'video' && Boolean(p.videoUrl);
        return {
          id: `archival-${Date.now()}-${idx}`,
          name: isVideo
            ? `🎬 Video Thật: ${p.title || `${characterQuery} #${idx + 1}`}`
            : `📸 Ảnh Thật: ${p.title || `${characterQuery} #${idx + 1}`}`,
          type: isVideo ? 'video' : 'image',
          url: isVideo ? p.videoUrl : p.dataUrl,
          thumbnailUrl: p.dataUrl,
          width: p.width,
          height: p.height,
          durationSec: 7,
          sourceTag: 'uploaded',
          createdAt: isVideo ? 'Video tư liệu thật' : 'Ảnh lịch sử tự động',
        };
      });

      setVaultItems((prev) => [...fetchedItems, ...prev]);
      return fetchedItems;
    } catch {
      return [];
    }
  };

  const handleFetchArchivalPhotos = async (characterQuery: string) => {
    if (!characterQuery.trim() || isFetchingArchival) return;
    setIsFetchingArchival(true);
    try {
      const {
        updatedScenes,
        matchedCount,
        matchedVideosCount,
        matchedPhotosCount,
        missingCount,
      } = await matchAndAssignRealPhotosForScenes(scenes, characterQuery);
      if (matchedCount > 0 || missingCount > 0) {
        setScenes(updatedScenes);
      }
      const items = await fetchArchivalPhotosInternal(characterQuery);
      const totalFound = matchedCount + items.length;
      if (totalFound > 0) {
        setStatusBanner(
          `Đã tự động tìm được ${matchedVideosCount} Video Thật & ${matchedPhotosCount} Ảnh Thật gắn thẳng vào cảnh + cấp sẵn Ảnh Mẫu & Prompt Kling AI cho ${missingCount} cảnh còn lại để bạn vẽ và reg video!`
        );
      } else {
        setStatusBanner(
          `Không tìm thấy ảnh/video công khai cho "${characterQuery}". Đã tạo sẵn trọn bộ Prompt Ảnh & Video Kling AI để bạn vẽ và reg video ngay!`
        );
      }
    } finally {
      setIsFetchingArchival(false);
    }
  };

  const getCharacterNameForPreset = (presetId: PresetId): string => {
    if (presetId === 'will-sampson') return 'Will Sampson';
    if (presetId === 'lorne-greene') return 'Lorne Greene';
    if (presetId === 'clayton-moore') return 'Clayton Moore';
    if (presetId === 'yul-brynner') return 'Yul Brynner';
    return 'Will Sampson';
  };

  const handleSelectPreset = async (presetId: PresetId) => {
    const presetMeta = REFERENCE_VIDEOS[presetId];
    const presetScenes = PRESET_SCENES_MAP[presetId];
    if (!presetMeta || !presetScenes) return;

    setIsPlaying(false);
    setScenes(presetScenes);
    setActiveSceneId(presetScenes[0].id);
    setCurrentTimeSec(0);
    setSettings((prev) => ({
      ...prev,
      activePresetId: presetId,
      projectTitle: presetMeta.title,
      referenceVideoUrl: '',
      audioMode: 'stitched-scenes',
    }));

    const charName = getCharacterNameForPreset(presetId);
    const { updatedScenes, matchedVideosCount, matchedPhotosCount } =
      await matchAndAssignRealPhotosForScenes(presetScenes, charName);
    setScenes(updatedScenes);
    setStatusBanner(
      `Đã tải ${presetMeta.title}: Tự động lấy ${matchedVideosCount} Video Thật & ${matchedPhotosCount} Ảnh Thật trên mạng gắn vào các phân cảnh!`
    );
  };

  // Automatically hydrate initial preset scenes with real web photos & videos on first load
  useEffect(() => {
    let cancelled = false;
    const initRealMedia = async () => {
      const charName = getCharacterNameForPreset(settings.activePresetId);
      const { updatedScenes, matchedCount } = await matchAndAssignRealPhotosForScenes(
        scenes,
        charName
      );
      if (!cancelled && matchedCount > 0) {
        setScenes(updatedScenes);
      }
    };
    initRealMedia();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddVaultItems = (newItems: VaultItem[]) => {
    setVaultItems((prev) => [...newItems, ...prev]);

    setScenes((prevScenes) => {
      const updated = [...prevScenes];
      const usedItemIds = new Set<string>();

      // Pass 1: Match files that explicitly specify a scene number (e.g., "1.mp4", "canh 2.png", "cảnh_03.mp4", "scene 1.webp")
      for (const item of newItems) {
        const targetSceneNum = extractSceneNumberFromFileName(item.name, updated.length);
        if (targetSceneNum !== null) {
          const idx = targetSceneNum - 1;
          const sc = updated[idx];
          if (sc && sc.sceneType !== 'outro') {
            updated[idx] = {
              ...sc,
              sceneType: item.type === 'video' ? 'video' : 'image',
              mediaId: item.id,
              mediaUrl: item.url,
              mediaKind: item.type === 'video' ? 'video' : 'image',
              videoTrimStartSec: 0,
              videoTrimEndSec: item.durationSec || sc.durationSec || 8,
              frameStyle: 'full-bleed',
              showBottomSubtitles: true,
              hasRealPhoto: true,
              realPhotoTitle: item.name,
            };
            usedItemIds.add(item.id);
          }
        }
      }

      // Remaining items without explicit scene numbers (e.g., "kling_20261030_xyz.mp4", "ChatGPT Image...png")
      const remainingVideos = newItems.filter(
        (i) => i.type === 'video' && !usedItemIds.has(i.id)
      );
      const remainingImages = newItems.filter(
        (i) => i.type === 'image' && !usedItemIds.has(i.id)
      );

      let vidIdx = 0;
      let imgIdx = 0;

      // Pass 2: Prefer scenes that are missing a real photo (or holding a temp image in a video slot) in smooth sequential order #01 -> #N
      const hasUnfilledVideoScene = updated.some(
        (s) =>
          s.sceneType === 'video' &&
          (!s.mediaUrl || s.hasRealPhoto === false || s.mediaKind !== 'video')
      );
      const hasUnfilledImageScene = updated.some(
        (s) => s.sceneType === 'image' && (!s.mediaUrl || s.hasRealPhoto === false)
      );

      for (let idx = 0; idx < updated.length; idx++) {
        const sc = updated[idx];
        if (sc.sceneType === 'quote' || sc.sceneType === 'outro') continue;

        if (
          sc.sceneType === 'video' &&
          vidIdx < remainingVideos.length &&
          (!hasUnfilledVideoScene ||
            !sc.mediaUrl ||
            sc.hasRealPhoto === false ||
            sc.mediaKind !== 'video')
        ) {
          const v = remainingVideos[vidIdx++];
          usedItemIds.add(v.id);
          updated[idx] = {
            ...sc,
            mediaId: v.id,
            mediaUrl: v.url,
            mediaKind: 'video',
            videoTrimStartSec: 0,
            videoTrimEndSec: v.durationSec || sc.durationSec || 8,
            frameStyle: 'full-bleed',
            showBottomSubtitles: true,
            hasRealPhoto: true,
            realPhotoTitle: v.name,
          };
        } else if (
          sc.sceneType === 'image' &&
          imgIdx < remainingImages.length &&
          (!hasUnfilledImageScene || !sc.mediaUrl || sc.hasRealPhoto === false)
        ) {
          const img = remainingImages[imgIdx++];
          usedItemIds.add(img.id);
          updated[idx] = {
            ...sc,
            mediaId: img.id,
            mediaUrl: img.url,
            mediaKind: 'image',
            videoTrimStartSec: 0,
            frameStyle: 'full-bleed',
            showBottomSubtitles: true,
            hasRealPhoto: true,
            realPhotoTitle: img.name,
          };
        }
      }

      // Pass 3: If there are still leftover uploaded files (e.g. user uploaded an Image for a Video scene or vice versa),
      // fill any remaining scenes missing a real photo in sequential order!
      const leftoverItems = newItems.filter((i) => !usedItemIds.has(i.id));
      let leftoverIdx = 0;
      if (leftoverIdx < leftoverItems.length) {
        for (let idx = 0; idx < updated.length && leftoverIdx < leftoverItems.length; idx++) {
          const sc = updated[idx];
          if (
            sc.sceneType === 'quote' ||
            sc.sceneType === 'outro' ||
            (sc.mediaUrl && sc.hasRealPhoto !== false)
          ) {
            continue;
          }
          const item = leftoverItems[leftoverIdx++];
          usedItemIds.add(item.id);
          updated[idx] = {
            ...sc,
            sceneType: item.type === 'video' ? 'video' : 'image',
            mediaId: item.id,
            mediaUrl: item.url,
            mediaKind: item.type === 'video' ? 'video' : 'image',
            videoTrimStartSec: 0,
            videoTrimEndSec: item.durationSec || sc.durationSec || 8,
            frameStyle: 'full-bleed',
            showBottomSubtitles: true,
            hasRealPhoto: true,
            realPhotoTitle: item.name,
          };
        }
      }

      return updated;
    });

    const uploadedVideos = newItems.filter((i) => i.type === 'video');
    const uploadedImages = newItems.filter((i) => i.type === 'image');
    setStatusBanner(
      `Đã nhận ${newItems.length} file (${uploadedVideos.length} Video, ${uploadedImages.length} Ảnh) và tự động gắn mượt mà theo thứ tự phân cảnh!`
    );
  };

  const handleSmartBatchUploadFiles = async (fileList: FileList) => {
    if (!fileList || fileList.length === 0) return;
    const newItems: VaultItem[] = [];
    const skippedNames: string[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const detectedKind = detectMediaKindFromFile(file);
      if (!detectedKind) {
        skippedNames.push(file.name);
        continue;
      }

      const objectUrl = URL.createObjectURL(file);
      const isVideo = detectedKind === 'video';
      let durationSec = 7;
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
        id: `batch-${Date.now()}-${i}`,
        name: cleanDisplayFileName(file.name),
        type: detectedKind,
        url: objectUrl,
        thumbnailUrl,
        durationSec,
        sourceTag: 'uploaded',
        createdAt: 'Thả hàng loạt',
      });
    }

    if (newItems.length > 0) {
      handleAddVaultItems(newItems);
    } else if (skippedNames.length > 0) {
      setStatusBanner(
        `Không nhận diện được định dạng của "${skippedNames.join(', ')}". Vui lòng chọn file Video (.mp4, .mov, .webm) hoặc Ảnh (.png, .jpg, .webp).`
      );
    }
  };

  const handleRemoveVaultItem = (id: string) => {
    setVaultItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleClearVault = () => {
    setVaultItems([]);
    setScenes((prev) =>
      prev.map((sc) => ({
        ...sc,
        mediaId: undefined,
        mediaUrl: undefined,
        hasRealPhoto: false,
        realPhotoTitle: undefined,
      }))
    );
    setStatusBanner('Đã xóa sạch toàn bộ ảnh và video cũ khỏi Kho tư liệu và các phân cảnh.');
  };

  const handleUpdateScene = (sceneId: string, patch: Partial<StoryScene>) => {
    setScenes((prev) =>
      prev.map((sc) => (sc.id === sceneId ? { ...sc, ...patch } : sc))
    );
  };

  const handleUploadFileForScene = async (sceneId: string, file: File) => {
    const detectedKind = detectMediaKindFromFile(file);
    if (!detectedKind) {
      setStatusBanner(
        `File "${file.name}" không đúng định dạng. Vui lòng chọn Video (.mp4, .mov, .webm) hoặc Ảnh (.png, .jpg, .webp).`
      );
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const isVideo = detectedKind === 'video';

    let durationSec = 7;
    let thumbnailUrl: string | undefined = !isVideo ? objectUrl : undefined;
    if (isVideo) {
      const [dur, thumb] = await Promise.all([
        getMediaDuration(objectUrl, 'video'),
        extractVideoThumbnail(objectUrl),
      ]);
      durationSec = dur;
      thumbnailUrl = thumb;
    }

    const cleanName = cleanDisplayFileName(file.name);
    const newItem: VaultItem = {
      id: `scene-upload-${Date.now()}`,
      name: cleanName,
      type: detectedKind,
      url: objectUrl,
      thumbnailUrl,
      durationSec,
      sourceTag: 'uploaded',
      createdAt: 'Tải trực tiếp vào cảnh',
    };

    const targetSceneIdx = scenes.findIndex((s) => s.id === sceneId);
    const sceneOrderLabel = targetSceneIdx >= 0 ? `#${String(targetSceneIdx + 1).padStart(2, '0')}` : '';

    setVaultItems((prev) => [newItem, ...prev]);
    handleUpdateScene(sceneId, {
      sceneType: detectedKind,
      mediaId: newItem.id,
      mediaUrl: newItem.url,
      mediaKind: detectedKind,
      videoTrimStartSec: 0,
      videoTrimEndSec: durationSec,
      frameStyle: 'full-bleed',
      showBottomSubtitles: true,
      hasRealPhoto: true,
      realPhotoTitle: cleanName,
    });
    setActiveSceneId(sceneId);
    setStatusBanner(
      `Đã gắn ${isVideo ? 'VIDEO' : 'ẢNH'} "${cleanName}" vào Cảnh ${sceneOrderLabel} (Tự động chuyển sang chế độ ${isVideo ? 'VIDEO' : 'ẢNH'} Full Khung)!`
    );
  };

  const handleAssignMediaToActiveScene = (item: VaultItem) => {
    if (!activeScene) return;
    handleUpdateScene(activeScene.id, {
      sceneType: item.type === 'video' ? 'video' : 'image',
      mediaId: item.id,
      mediaUrl: item.url,
      mediaKind: item.type === 'video' ? 'video' : 'image',
      videoTrimStartSec: 0,
      videoTrimEndSec: item.durationSec || 8,
      frameStyle: 'full-bleed',
      showBottomSubtitles: true,
      hasRealPhoto: true,
      realPhotoTitle: item.name,
    });
    setStatusBanner(`Đã gán "${item.name}" (Tràn Full Khung) vào Cảnh #${activeScene.order}.`);
  };

  const handleAppendSceneFromMedia = (item: VaultItem) => {
    const motions: MotionEffect[] = ['zoom-in', 'zoom-out', 'pan-right', 'pan-left'];
    const newOrder = scenes.length + 1;
    const newScene: StoryScene = {
      id: `scene-${Date.now()}`,
      order: newOrder,
      title: item.name.slice(0, 28),
      sceneType: item.type === 'video' ? 'video' : 'image',
      mediaId: item.id,
      mediaUrl: item.url,
      mediaKind: item.type === 'video' ? 'video' : 'image',
      videoTrimStartSec: 0,
      durationSec: item.type === 'video' ? Math.min(12, item.durationSec || 8) : 7,
      narrationText: 'Every great memory lives on through the stories we share.',
      translationText: 'Mỗi ký ức đẹp đều sống mãi qua những câu chuyện chúng ta kể lại.',
      visualPrompt:
        item.type === 'video'
          ? 'CẦN VIDEO: Phân cảnh video tư liệu bổ sung'
          : 'CẦN ẢNH TĨNH: Phân cảnh ảnh tĩnh hiệu ứng Ken Burns',
      imagePrompt: buildFullFrameImagePrompt(
        'Vintage 1960s archival photograph, dramatic lighting',
        settings.aspectRatio,
        item.name
      ),
      videoMotionPrompt: buildFullFrameVideoPrompt(
        'Natural camera movement and lifelike expression',
        settings.aspectRatio,
        item.name
      ),
      motionEffect: motions[newOrder % motions.length],
      colorFilter: 'color-warm',
      frameStyle: 'full-bleed',
      showBottomSubtitles: true,
    };

    setScenes((prev) => [...prev, newScene]);
    setActiveSceneId(newScene.id);
    setStatusBanner(`Đã thêm Cảnh #${newOrder} từ tư liệu "${item.name}".`);
  };

  // Auto-stitch all videos and images from the user's Vault into the storyboard scenes
  const handleAutoStitchVault = () => {
    const visualAssets = vaultItems.filter(
      (i) => i.type === 'image' || i.type === 'video'
    );
    if (visualAssets.length === 0) return;

    const uploadedOrExtracted = visualAssets.filter((i) => i.sourceTag !== 'sample');
    const pool = uploadedOrExtracted.length > 0 ? uploadedOrExtracted : visualAssets;

    const motions: MotionEffect[] = ['zoom-in', 'zoom-out', 'pan-right', 'pan-left'];
    const filters: ColorFilter[] = ['original', 'bw-vintage', 'sepia', 'color-warm'];

    let assetIdx = 0;
    const updatedScenes = scenes.map((sc, idx) => {
      if (sc.sceneType === 'quote' || sc.sceneType === 'outro') {
        return sc;
      }
      const chosen = pool[assetIdx % pool.length];
      assetIdx++;
      return {
        ...sc,
        sceneType: (chosen.type === 'video' ? 'video' : 'image') as SceneType,
        mediaId: chosen.id,
        mediaUrl: chosen.url,
        mediaKind: (chosen.type === 'video' ? 'video' : 'image') as 'video' | 'image',
        videoTrimStartSec: chosen.sourceTag === 'sample' ? sc.videoTrimStartSec : 0,
        motionEffect: motions[idx % motions.length],
        colorFilter: sc.colorFilter || filters[idx % filters.length],
        frameStyle: 'full-bleed' as FrameStyle,
        showBottomSubtitles: true,
      };
    });

    setScenes(updatedScenes);
    setCurrentTimeSec(0);
    setIsPlaying(true);
    setStatusBanner(
      `Đã tự động ghép ${pool.length} tư liệu (Video & Ảnh) trong Kho tràn Full Khung vào ${updatedScenes.length} phân cảnh hoàn chỉnh!`
    );
  };

  // Convert raw API scene objects into StoryScene[], assigning provided visual pool or procedural vintage cards
  const mapApiScenesToStoryScenes = (
    rawScenes: any[],
    lang: 'vi' | 'en',
    visualPool: VaultItem[],
    characterTitle: string,
    targetSceneCount?: number
  ): StoryScene[] => {
    let poolIdx = 0;
    let visualSceneCounter = 0;

    // Separate narrative scenes from any outro scene returned by the LLM
    const narrativeList: any[] = rawScenes
      .filter((r: any) => r && r.sceneType !== 'outro')
      .map((r: any) => ({ ...r }));

    const desiredTotal = targetSceneCount && targetSceneCount >= 4 ? targetSceneCount : 0;
    const desiredNarrativeCount = desiredTotal > 0 ? desiredTotal - 1 : narrativeList.length;

    // If a specific scene count (e.g. 14 or 16 scenes) was requested and the AI returned fewer narrative scenes,
    // split multi-sentence scenes or insert complementary documentary beats so total count is 100% exact
    if (desiredTotal > 0 && narrativeList.length > 0) {
      while (narrativeList.length < desiredNarrativeCount) {
        let splitIdx = -1;
        let maxLen = 0;
        for (let idx = 0; idx < narrativeList.length; idx++) {
          const text = String(narrativeList[idx]?.narrationText || '').trim();
          const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
          if (sentences.length >= 2 && text.length > maxLen) {
            maxLen = text.length;
            splitIdx = idx;
          }
        }

        if (splitIdx >= 0) {
          const orig = narrativeList[splitIdx];
          const enSentences = String(orig.narrationText || '')
            .trim()
            .split(/(?<=[.!?])\s+/)
            .filter(Boolean);
          const viSentences = String(orig.translationText || '')
            .trim()
            .split(/(?<=[.!?])\s+/)
            .filter(Boolean);
          const midEn = Math.ceil(enSentences.length / 2);
          const midVi = Math.max(1, Math.ceil(viSentences.length / 2));

          const firstHalf = {
            ...orig,
            narrationText: enSentences.slice(0, midEn).join(' '),
            translationText:
              viSentences.length >= 2
                ? viSentences.slice(0, midVi).join(' ')
                : orig.translationText,
          };
          const secondHalf = {
            ...orig,
            title: `${orig.title || 'Phân cảnh'} (Tiếp)`,
            sceneType: orig.sceneType === 'video' ? 'image' : 'video',
            narrationText: enSentences.slice(midEn).join(' '),
            translationText:
              viSentences.length >= 2
                ? viSentences.slice(midVi).join(' ')
                : orig.translationText,
          };
          narrativeList.splice(splitIdx, 1, firstHalf, secondHalf);
        } else {
          const lastOrig = narrativeList[narrativeList.length - 1];
          narrativeList.push({
            ...lastOrig,
            title: `Dấu ấn di sản #${narrativeList.length + 1}`,
            sceneType: narrativeList.length % 3 === 0 ? 'video' : 'image',
            narrationText:
              lang === 'en'
                ? `Through every trial and triumph, ${characterTitle} left an unforgettable mark on cinema history.`
                : `Qua bao thăng trầm và vinh quang, ${characterTitle} đã để lại dấu ấn không thể phai mờ trong lịch sử điện ảnh.`,
            translationText:
              lang === 'en'
                ? `Qua bao thăng trầm và vinh quang, ${characterTitle} đã để lại dấu ấn không thể phai mờ trong lịch sử điện ảnh.`
                : `Through every trial and triumph, ${characterTitle} left an unforgettable mark on cinema history.`,
          });
        }
      }

      if (narrativeList.length > desiredNarrativeCount && desiredNarrativeCount >= 3) {
        narrativeList.length = desiredNarrativeCount;
      }
    }

    const rawHasVideo = narrativeList.some((r: any) => r?.sceneType === 'video');
    const rawHasImage = narrativeList.some((r: any) => r?.sceneType === 'image');
    const totalCountWithOutro = narrativeList.length + 1;
    const smoothMotions: MotionEffect[] = ['zoom-in', 'pan-right', 'zoom-out', 'pan-left'];

    const mapped: StoryScene[] = narrativeList.map((raw: any, i: number) => {
      let sType: SceneType = ['video', 'image', 'quote'].includes(raw.sceneType)
        ? raw.sceneType
        : 'image';

      // Ensure clear alternating VIDEO / IMAGE segments if AI returned only one visual type
      if ((sType === 'video' || sType === 'image') && (!rawHasVideo || !rawHasImage)) {
        sType = visualSceneCounter % 2 === 0 ? 'video' : 'image';
      }
      if (sType === 'video' || sType === 'image') {
        visualSceneCounter++;
      }

      let chosenMediaId: string | undefined;
      let chosenMediaUrl: string | undefined;
      let chosenMediaKind: 'video' | 'image' | undefined;
      let hasVerifiedPhoto = false;
      let realPhotoTitle: string | undefined;

      const sceneTitle = raw.title || `Phân cảnh ${i + 1}`;
      const primaryNarration =
        lang === 'en'
          ? raw.narrationText
          : raw.translationText || raw.narrationText;

      if (sType === 'video' || sType === 'image') {
        if (visualPool.length > 0 && poolIdx < visualPool.length) {
          // Never cycle/repeat photos: only assign each pool item once
          const asset = visualPool[poolIdx++];
          chosenMediaId = asset.id;
          chosenMediaUrl = asset.url;
          chosenMediaKind = asset.type === 'video' ? 'video' : 'image';
          hasVerifiedPhoto = true;
          realPhotoTitle = asset.name;
        } else {
          chosenMediaUrl = generateVintageArchivalDataUrl(
            characterTitle,
            sceneTitle,
            i,
            sType
          );
          chosenMediaKind = 'image';
          hasVerifiedPhoto = false;
        }
      }

      const klingPack =
        sType === 'video' || sType === 'image'
          ? buildStandardKlingDrawPrompt({
              order: i + 1,
              totalScenes: totalCountWithOutro,
              characterName: characterTitle,
              title: sceneTitle,
              narrationText: primaryNarration,
              rawImagePrompt: raw.imagePrompt || raw.visualPrompt,
              rawVideoPrompt: raw.videoMotionPrompt,
              sceneType: sType,
              ratio: settings.aspectRatio,
            })
          : null;

      return {
        id: `ai-scene-${Date.now()}-${i}`,
        order: i + 1,
        title: sceneTitle,
        sceneType: sType,
        mediaId: chosenMediaId,
        mediaUrl: chosenMediaUrl,
        mediaKind: chosenMediaKind,
        videoTrimStartSec: 0,
        durationSec: Math.max(5, Math.min(15, Math.ceil(Number(raw.durationSec) || 7))),
        narrationText: primaryNarration,
        translationText:
          lang === 'vi'
            ? raw.narrationText
            : raw.translationText || raw.narrationText,
        visualPrompt: raw.visualPrompt,
        imagePrompt: klingPack ? klingPack.klingImagePrompt : raw.imagePrompt,
        videoMotionPrompt: klingPack ? klingPack.klingVideoPrompt : raw.videoMotionPrompt,
        klingStandardPrompt: klingPack ? klingPack.combinedBlock : undefined,
        hasRealPhoto: sType === 'video' || sType === 'image' ? hasVerifiedPhoto : undefined,
        realPhotoTitle,
        archivalKeywords: raw.archivalKeywords || `${characterTitle} ${sceneTitle}`,
        motionEffect: (['zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'static'].includes(
          raw.motionEffect
        )
          ? raw.motionEffect
          : smoothMotions[i % smoothMotions.length]) as MotionEffect,
        colorFilter: (['color-warm', 'bw-vintage', 'sepia', 'original'].includes(raw.colorFilter)
          ? raw.colorFilter
          : 'bw-vintage') as ColorFilter,
        frameStyle: 'full-bleed' as FrameStyle,
        showBottomSubtitles: sType !== 'quote',
      };
    });

    // Guarantee that the final scene (#N) is ALWAYS the fixed LIFE LEGENDS (HM) outro crest
    mapped.push({
      id: `ai-scene-outro-${Date.now()}`,
      order: mapped.length + 1,
      title: 'Logo Kết Cố Định: LIFE LEGENDS (HM)',
      sceneType: 'outro',
      durationSec: 4,
      narrationText: 'Life Legends. Their Legacy. Your Inspiration.',
      translationText: 'Huyền Thoại Cuộc Đời. Di sản của họ. Cảm hứng của bạn.',
      visualPrompt:
        'LOGO KẾT CỐ ĐỊNH: Huy hiệu vàng LIFE LEGENDS — HM — THEIR LEGACY. YOUR INSPIRATION.',
      imagePrompt: 'Không cần tạo ảnh (Ứng dụng đã khóa cố định Logo LIFE LEGENDS - HM).',
      videoMotionPrompt: 'Không cần tạo video.',
      motionEffect: 'zoom-in',
      colorFilter: 'original',
      frameStyle: 'full-bleed',
      showBottomSubtitles: false,
    });

    // Strictly guarantee that 'video' scenes account for > 1/2 (target >= 60%) of total video duration
    const totalDurationSec = mapped.reduce((sum, s) => sum + Math.round(s.durationSec || 5), 0);
    const minRequiredVideoDurationSec = Math.floor(totalDurationSec * 0.58) + 1;
    let currentVideoDurationSec = mapped
      .filter((s) => s.sceneType === 'video')
      .reduce((sum, s) => sum + Math.round(s.durationSec || 5), 0);

    if (currentVideoDurationSec < minRequiredVideoDurationSec) {
      // Promote 'image' scenes (prioritizing longest scenes & key narrative beats) to 'video' until video duration > 58% of total video length
      const imageSceneIndices = mapped
        .map((s, idx) => ({ idx, dur: Math.round(s.durationSec || 5), type: s.sceneType }))
        .filter((item) => item.type === 'image')
        .sort((a, b) => b.dur - a.dur || a.idx - b.idx);

      for (const candidate of imageSceneIndices) {
        if (currentVideoDurationSec >= minRequiredVideoDurationSec) break;
        const sc = mapped[candidate.idx];
        const upgradedPack = buildStandardKlingDrawPrompt({
          order: sc.order,
          totalScenes: mapped.length,
          characterName: characterTitle,
          title: sc.title,
          narrationText: sc.narrationText,
          rawImagePrompt: sc.imagePrompt || sc.visualPrompt,
          rawVideoPrompt: sc.videoMotionPrompt,
          sceneType: 'video',
          ratio: settings.aspectRatio,
        });
        mapped[candidate.idx] = {
          ...sc,
          sceneType: 'video',
          visualPrompt: sc.visualPrompt
            ? sc.visualPrompt.replace(/^CẦN ẢNH TĨNH:/i, 'CẦN VIDEO:')
            : `CẦN VIDEO: ${sc.title}`,
          imagePrompt: upgradedPack.klingImagePrompt,
          videoMotionPrompt: upgradedPack.klingVideoPrompt,
          klingStandardPrompt: upgradedPack.combinedBlock,
        };
        currentVideoDurationSec += candidate.dur;
      }
    }

    return mapped;
  };

  // Strictly match and assign ONLY verified real historical photos AND real videos of the character in smooth chronological order.
  // Browser-direct CORS fallback to Wikimedia Commons & Wikipedia APIs (origin=*) so real photos/videos work 100% even on static Vercel deployments
  const fetchArchivalMediaFromCommonsBrowserFallback = async (
    characterQuery: string,
    targetScenes: StoryScene[]
  ) => {
    const cleanTopic = characterQuery.trim() || 'Will Sampson';
    const matchedBySceneId: Record<
      string,
      {
        title: string;
        dataUrl: string;
        videoUrl?: string;
        mediaKind?: 'video' | 'image';
        width: number;
        height: number;
      }
    > = {};
    const allPhotos: Array<{
      title: string;
      dataUrl: string;
      videoUrl?: string;
      mediaKind?: 'video' | 'image';
      width: number;
      height: number;
    }> = [];

    try {
      const commonsUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
        cleanTopic
      )}&gsrnamespace=6&gsrlimit=25&prop=imageinfo&iiprop=url|dimensions|mime&iiurlwidth=1080&format=json&origin=*`;
      const res = await fetch(commonsUrl);
      if (res.ok) {
        const json = await res.json();
        const pages = Object.values(json?.query?.pages || {}) as any[];
        for (const page of pages) {
          const info = page?.imageinfo?.[0];
          if (!info) continue;
          const mime = String(info.mime || '').toLowerCase();
          const cleanTitle = String(page.title || '')
            .replace(/^File:/i, '')
            .replace(/\.[a-z0-9]+$/i, '')
            .replace(/[_-]+/g, ' ');
          if (
            mime.includes('webm') ||
            mime.includes('mp4') ||
            mime.includes('ogv')
          ) {
            if (info.url && info.thumburl) {
              allPhotos.push({
                title: cleanTitle,
                dataUrl: info.thumburl,
                videoUrl: info.url,
                mediaKind: 'video',
                width: info.width || 1080,
                height: info.height || 1440,
              });
            }
          } else if (
            mime.includes('jpeg') ||
            mime.includes('jpg') ||
            mime.includes('png') ||
            mime.includes('webp')
          ) {
            const imgUrl = info.thumburl || info.url;
            if (imgUrl) {
              allPhotos.push({
                title: cleanTitle,
                dataUrl: imgUrl,
                mediaKind: 'image',
                width: info.thumbwidth || info.width || 1080,
                height: info.thumbheight || info.height || 1440,
              });
            }
          }
        }
      }
    } catch {
      // Ignore browser fallback error
    }

    const visualScenes = targetScenes.filter(
      (s) => s.sceneType === 'video' || s.sceneType === 'image'
    );
    visualScenes.forEach((sc, idx) => {
      const candidate = allPhotos[idx];
      if (candidate) {
        matchedBySceneId[sc.id] = candidate;
      }
    });

    return { matchedBySceneId, allPhotos };
  };

  // Scenes without a verified real photo/video are NEVER given random/duplicate photos; instead they receive the character's reference portrait (characterRefPhotoUrl) + a ready-to-copy Standard Kling AI Prompt to draw & reg video!
  const matchAndAssignRealPhotosForScenes = async (
    targetScenes: StoryScene[],
    topicHint: string
  ): Promise<{
    updatedScenes: StoryScene[];
    matchedCount: number;
    matchedVideosCount: number;
    matchedPhotosCount: number;
    missingCount: number;
  }> => {
    try {
      let data: any = null;
      try {
        const res = await fetch('/api/archival/match-scenes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: topicHint,
            scenes: targetScenes.map((s) => ({
              id: s.id,
              title: s.title,
              sceneType: s.sceneType,
              archivalKeywords: s.archivalKeywords,
            })),
          }),
        });
        if (res.ok) {
          data = await safeParseJsonResponse(res);
        }
      } catch {
        data = null;
      }

      if (!data || !data.matchedBySceneId || Object.keys(data.matchedBySceneId).length === 0) {
        data = await fetchArchivalMediaFromCommonsBrowserFallback(topicHint, targetScenes);
      }

      const matchedMap: Record<
        string,
        {
          title: string;
          dataUrl: string;
          videoUrl?: string;
          mediaKind?: 'video' | 'image';
          width: number;
          height: number;
        }
      > = data?.matchedBySceneId || {};

      // Primary verified real portrait of the character so scenes missing unique media still give the user a downloadable reference face photo
      const allPoolItems: Array<{ dataUrl?: string; mediaKind?: string }> = Array.isArray(
        data?.allPhotos
      )
        ? data.allPhotos
        : [];
      const primaryCharacterPhotoUrl =
        allPoolItems.find((item) => item.mediaKind !== 'video' && item.dataUrl)?.dataUrl ||
        allPoolItems[0]?.dataUrl ||
        undefined;

      const newVaultItems: VaultItem[] = [];
      let matchedCount = 0;
      let matchedVideosCount = 0;
      let matchedPhotosCount = 0;
      let missingCount = 0;

      const updatedScenes = targetScenes.map((sc, idx) => {
        if (sc.sceneType === 'quote' || sc.sceneType === 'outro') return sc;

        const klingPack = buildStandardKlingDrawPrompt({
          order: sc.order,
          totalScenes: targetScenes.length,
          characterName: topicHint,
          title: sc.title,
          narrationText: sc.narrationText,
          rawImagePrompt: sc.imagePrompt || sc.visualPrompt,
          rawVideoPrompt: sc.videoMotionPrompt,
          sceneType: sc.sceneType,
          ratio: settings.aspectRatio,
        });

        const matched = matchedMap[sc.id];
        if (!matched || (!matched.dataUrl && !matched.videoUrl)) {
          // Do NOT assign random or repeated photos! Provide character reference portrait + Kling AI Blueprint card + Standard Kling Prompt to draw & reg video
          missingCount++;
          return {
            ...sc,
            hasRealPhoto: false,
            realPhotoTitle: undefined,
            characterRefPhotoUrl: primaryCharacterPhotoUrl || sc.characterRefPhotoUrl,
            imagePrompt: klingPack.klingImagePrompt,
            videoMotionPrompt: klingPack.klingVideoPrompt,
            klingStandardPrompt: klingPack.combinedBlock,
            mediaUrl:
              sc.hasRealPhoto && sc.mediaUrl
                ? sc.mediaUrl
                : generateVintageArchivalDataUrl(
                    topicHint,
                    sc.title,
                    idx,
                    sc.sceneType === 'video' ? 'video' : 'image'
                  ),
            mediaKind: 'image' as const,
            frameStyle: 'full-bleed' as FrameStyle,
            showBottomSubtitles: true,
          };
        }

        const isRealVideo = matched.mediaKind === 'video' && Boolean(matched.videoUrl);
        matchedCount++;
        if (isRealVideo) {
          matchedVideosCount++;
        } else {
          matchedPhotosCount++;
        }

        const vaultItem: VaultItem = {
          id: `real-media-${Date.now()}-${idx}`,
          name: isRealVideo
            ? `🎬 Video Thật Cảnh #${String(sc.order).padStart(2, '0')}: ${matched.title}`
            : `📸 Ảnh Thật Cảnh #${String(sc.order).padStart(2, '0')}: ${matched.title}`,
          type: isRealVideo ? 'video' : 'image',
          url: isRealVideo ? matched.videoUrl! : matched.dataUrl,
          thumbnailUrl: matched.dataUrl,
          width: matched.width,
          height: matched.height,
          durationSec: Math.ceil(sc.durationSec || 7),
          sourceTag: 'uploaded',
          createdAt: isRealVideo ? 'Video thật chuẩn nhân vật' : 'Ảnh thật chuẩn nhân vật',
        };
        newVaultItems.push(vaultItem);

        return {
          ...sc,
          mediaId: vaultItem.id,
          mediaUrl: vaultItem.url,
          mediaKind: (isRealVideo ? 'video' : 'image') as 'video' | 'image',
          hasRealPhoto: true,
          realPhotoTitle: matched.title,
          characterRefPhotoUrl: primaryCharacterPhotoUrl || matched.dataUrl,
          imagePrompt: klingPack.klingImagePrompt,
          videoMotionPrompt: klingPack.klingVideoPrompt,
          klingStandardPrompt: klingPack.combinedBlock,
          frameStyle: 'full-bleed' as FrameStyle,
          showBottomSubtitles: true,
        };
      });

      if (newVaultItems.length > 0) {
        setVaultItems((prev) => [...newVaultItems, ...prev]);
      }

      return {
        updatedScenes,
        matchedCount,
        matchedVideosCount,
        matchedPhotosCount,
        missingCount,
      };
    } catch {
      const missing = targetScenes.filter(
        (s) => (s.sceneType === 'video' || s.sceneType === 'image') && !s.hasRealPhoto
      ).length;
      return {
        updatedScenes: targetScenes,
        matchedCount: 0,
        matchedVideosCount: 0,
        matchedPhotosCount: 0,
        missingCount: missing,
      };
    }
  };

  // Batch generate 100% UNIFORM TTS voiceovers from Scene #01 to the end (Locked Engine + Locked Language + 24kHz Studio Broadcast Mastering)
  const generateVoiceoversForScenesList = async (
    targetScenes: StoryScene[],
    lang: 'en' | 'vi',
    onStepProgress?: (msg: string) => void,
    overrideVoice?: ProjectSettings['ttsVoice']
  ): Promise<StoryScene[]> => {
    const updated = [...targetScenes];
    const voiceName = overrideVoice || settings.ttsVoice || 'Charon';
    const persona = VOICE_PERSONA_PROFILES[voiceName] || VOICE_PERSONA_PROFILES.Charon;

    const batchItems = updated
      .filter((sc) => sc.sceneType !== 'outro')
      .map((sc) => ({
        id: sc.id,
        text: resolveConsistentSceneText(sc, lang).trim(),
      }))
      .filter((it) => it.text.length > 0);

    if (batchItems.length === 0) return updated;

    if (onStepProgress) {
      onStepProgress(
        `Đang thu âm đồng nhất 100% toàn video với giọng ${voiceName} (${lang === 'vi' ? 'Tiếng Việt' : 'Tiếng Anh'})...`
      );
    }

    let resultsBySceneId: Record<string, { audioDataUrl: string; engine: string }> = {};
    let lockedEngine: 'gemini-single-pass' | 'standard-locked' = 'standard-locked';

    try {
      const batchRes = await fetch('/api/tts/generate-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: batchItems,
          voiceName,
          language: lang,
          style: persona.geminiAnchorPrompt,
        }),
      });
      if (batchRes.ok) {
        const batchData = await safeParseJsonResponse(batchRes);
        resultsBySceneId = batchData?.resultsBySceneId || {};
        if (batchData?.engineUsed === 'gemini-single-pass') {
          lockedEngine = 'gemini-single-pass';
        }
      }
    } catch {
      // Will fallback to locked per-scene fetch below using 'standard-locked'
    }

    // Master every scene through the identical 24kHz Studio Broadcast EQ & Constant RMS Normalizer (-16 LUFS)
    for (let i = 0; i < updated.length; i++) {
      const sc = updated[i];
      if (sc.sceneType === 'outro') continue;

      const textToSpeak = resolveConsistentSceneText(sc, lang).trim();
      if (!textToSpeak) continue;

      if (onStepProgress) {
        onStepProgress(
          `Đang chuẩn hóa âm lượng & chất giọng đồng nhất cảnh ${i + 1}/${updated.length} (${sc.title.slice(0, 20)})...`
        );
      }

      let rawAudioUrl = resultsBySceneId[sc.id]?.audioDataUrl;
      let engineForScene = resultsBySceneId[sc.id]?.engine || lockedEngine;

      // If any scene wasn't in batch response, fetch it with the EXACT same locked engine & language
      if (!rawAudioUrl) {
        try {
          const singleRes = await fetch('/api/tts/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: textToSpeak,
              voiceName,
              language: lang,
              preferredEngine: lockedEngine === 'standard-locked' ? 'standard-locked' : undefined,
              style: persona.geminiAnchorPrompt,
            }),
          });
          if (singleRes.ok) {
            const singleData = await safeParseJsonResponse(singleRes);
            rawAudioUrl = singleData?.audioDataUrl;
            engineForScene = singleData?.engine || lockedEngine;
          }
        } catch {
          // Continue
        }
      }

      if (rawAudioUrl) {
        try {
          const { masteredAudioUrl, durationSec } = await masterAudioToConsistentStudioWav(
            rawAudioUrl,
            voiceName,
            engineForScene
          );
          const existingIntDur = Math.max(5, Math.round(sc.durationSec || 5));
          const neededIntDur = Math.max(5, Math.ceil(durationSec + 0.15));
          updated[i] = {
            ...sc,
            voiceoverUrl: masteredAudioUrl,
            voiceEngineUsed: `${voiceName}:${lang}:${engineForScene}`,
            durationSec: Math.max(existingIntDur, neededIntDur),
          };
        } catch {
          const dur = await getMediaDuration(rawAudioUrl, 'audio');
          const existingIntDur = Math.max(5, Math.round(sc.durationSec || 5));
          const neededIntDur = Math.max(5, Math.ceil(dur + 0.15));
          updated[i] = {
            ...sc,
            voiceoverUrl: rawAudioUrl,
            voiceEngineUsed: `${voiceName}:${lang}:${engineForScene}`,
            durationSec: Math.max(existingIntDur, neededIntDur),
          };
        }
        setScenes([...updated]);
      }
    }

    setSettings((prev) => ({
      ...prev,
      ttsVoice: voiceName,
      audioMode: 'stitched-scenes',
      voiceLanguage: lang,
      lockedTtsEngine: lockedEngine,
    }));

    return updated;
  };

  const safeParseJsonResponse = async (res: Response): Promise<any> => {
    const rawText = await res.text();
    const trimmed = rawText.trim();
    if (!trimmed || trimmed.startsWith('<')) {
      return null;
    }
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  };

  const buildClientFallbackScenesForTopic = (
    topic: string,
    lang: 'en' | 'vi',
    sceneCount: number
  ): any[] => {
    const cleanName = topic.trim() || 'Hollywood Legend';
    const total = Math.max(4, Math.min(20, Number(sceneCount) || 10));
    const narrativeCount = total - 1;
    const motions: MotionEffect[] = ['zoom-in', 'pan-right', 'zoom-out', 'pan-left'];

    const chronologicalBeats = [
      {
        title: 'Ánh mắt mở màn huyền thoại',
        era: 'iconic portrait',
        sceneType: 'video',
        en: `Before the world knew the name ${cleanName}, there was only a quiet fire and an unbreakable presence on screen.`,
        vi: `Trước khi cả thế giới biết đến cái tên ${cleanName}, chỉ có ngọn lửa âm ỉ và thần thái không thể trộn lẫn trên màn ảnh.`,
      },
      {
        title: 'Khởi nguồn & Tuổi thơ',
        era: '1940s youth early portrait',
        sceneType: 'image',
        en: `Every legend begins far from the spotlight. In those early years, life tested ${cleanName} long before fame ever arrived.`,
        vi: `Mọi huyền thoại đều bắt đầu từ nơi xa ánh hào quang. Những năm tháng đầu đời đã thử thách ${cleanName} trước khi danh vọng tìm đến.`,
      },
      {
        title: 'Những bước chân đầu tiên',
        era: '1950s early career',
        sceneType: 'image',
        en: `With little more than determination, ${cleanName} took small roles and long roads, learning the craft one frame at a time.`,
        vi: `Chỉ với lòng quyết tâm, ${cleanName} chấp nhận từng vai diễn nhỏ, bền bỉ rèn giũa qua từng khung hình.`,
      },
      {
        title: 'Khoảnh khắc định mệnh',
        era: 'turning point quote',
        sceneType: 'quote',
        en: `Sometimes one single role doesn't just change a career—it changes history forever.`,
        vi: `Đôi khi chỉ một vai diễn duy nhất không chỉ thay đổi sự nghiệp—mà thay đổi cả lịch sử mãi mãi.`,
      },
      {
        title: 'Bước ngoặt bùng nổ',
        era: '1960s breakthrough role',
        sceneType: 'video',
        en: `When the camera rolled on that defining breakthrough, ${cleanName} commanded every second with effortless intensity.`,
        vi: `Khi máy quay bắt đầu ghi hình vai diễn bước ngoặt ấy, ${cleanName} đã làm chủ từng giây bằng thần thái cuốn hút.`,
      },
      {
        title: 'Phong cách độc bản',
        era: '1960s classic film portrait',
        sceneType: 'image',
        en: `Audiences had never seen anyone quite like ${cleanName}. A single glance spoke louder than a page of dialogue.`,
        vi: `Khán giả chưa từng thấy ai giống như ${cleanName}. Chỉ một ánh nhìn cũng đủ sức nặng hơn cả trang lời thoại.`,
      },
      {
        title: 'Chinh phục màn ảnh rộng',
        era: '1965 movie scene',
        sceneType: 'image',
        en: `From dusty frontier towns to grand theater screens, every performance carried a raw, unforgettable authenticity.`,
        vi: `Từ những vùng đất miền Viễn Tây đầy gió bụi đến màn ảnh rộng, mỗi vai diễn đều mang chất chân thực khó quên.`,
      },
      {
        title: 'Đỉnh cao danh vọng',
        era: '1970s peak stardom',
        sceneType: 'video',
        en: `At the height of stardom, ${cleanName} stood at the center of cinema, turning bold stories into timeless classics.`,
        vi: `Ở đỉnh cao danh vọng, ${cleanName} đứng ở tâm điểm điện ảnh, biến những câu chuyện táo bạo thành tác phẩm kinh điển.`,
      },
      {
        title: 'Bản lĩnh sau ống kính',
        era: '1970s behind the scenes',
        sceneType: 'image',
        en: `Behind the camera, discipline and quiet conviction guided every choice, refusing to follow easy trends.`,
        vi: `Phía sau ống kính, sự kỷ luật và niềm tin sắt đá đã dẫn lối cho mọi quyết định, không bao giờ chạy theo lối mòn.`,
      },
      {
        title: 'Thử thách & Bản lĩnh',
        era: 'quote resilience',
        sceneType: 'quote',
        en: `True greatness is not measured when the crowd cheers, but when the storm hits.`,
        vi: `Sự vĩ đại thực sự không đo bằng tiếng vỗ tay, mà ở cách đứng vững giữa giông bão.`,
      },
      {
        title: 'Vượt qua sóng gió',
        era: '1975 dramatic portrait',
        sceneType: 'image',
        en: `Through changing eras and personal trials, ${cleanName} reinvented the journey without ever losing that signature soul.`,
        vi: `Đi qua bao biến thiên thời cuộc và thử thách riêng, ${cleanName} tự làm mới mình mà không đánh mất bản sắc.`,
      },
      {
        title: 'Biểu tượng vượt thời gian',
        era: '1980s iconic portrait',
        sceneType: 'video',
        en: `New generations discovered those classic frames and found a hero whose courage felt both larger than life and deeply human.`,
        vi: `Nhiều thế hệ mới tìm lại những thước phim xưa và bắt gặp một biểu tượng vừa phi thường vừa rất đỗi con người.`,
      },
      {
        title: 'Những tác phẩm để đời',
        era: '1985 award portrait',
        sceneType: 'image',
        en: `Decade after decade, the body of work grew into a monument of dedication, artistry, and quiet strength.`,
        vi: `Thập kỷ này nối tiếp thập kỷ khác, gia tài nghệ thuật ấy trở thành tượng đài của sự cống hiến và sức mạnh nội tâm.`,
      },
      {
        title: 'Triết lý sống sâu sắc',
        era: 'quote wisdom',
        sceneType: 'quote',
        en: `Fame fades with the spotlight, but character echoes across generations.`,
        vi: `Danh vọng có thể phai mờ theo ánh đèn sân khấu, nhưng nhân cách sẽ vang vọng qua nhiều thế hệ.`,
      },
      {
        title: 'Truyền lửa cho thế hệ sau',
        era: '1990s mentor portrait',
        sceneType: 'image',
        en: `To young artists and lifelong fans alike, ${cleanName} remained a guiding light of integrity and timeless grace.`,
        vi: `Với các nghệ sĩ trẻ và khán giả trung thành, ${cleanName} luôn là ngọn hải đăng của sự chính trực và phong thái lịch lãm.`,
      },
      {
        title: 'Năm tháng hoàng kim',
        era: 'later years portrait',
        sceneType: 'image',
        en: `Even in the quieter chapters of life, every wrinkle and silver hair told the story of a life fully lived.`,
        vi: `Ngay cả trong những chương trầm lắng hơn của cuộc đời, từng dấu ấn thời gian đều kể về một hành trình sống trọn vẹn.`,
      },
      {
        title: 'Khoảnh khắc lắng đọng',
        era: 'classic monochrome portrait',
        sceneType: 'image',
        en: `Looking back across the decades, the roles were many, yet the heart behind them remained unmistakably one.`,
        vi: `Nhìn lại chặng đường hàng chục năm, dù hóa thân vào bao số phận, trái tim phía sau vẫn luôn vẹn nguyên một chữ tâm.`,
      },
      {
        title: 'Huyền thoại trong lòng khán giả',
        era: 'tribute portrait',
        sceneType: 'image',
        en: `Long after the credits roll, the voice, the silhouette, and the spirit of ${cleanName} continue to inspire millions.`,
        vi: `Rất lâu sau khi dòng chữ kết phim khép lại, giọng nói, bóng dáng và tinh thần của ${cleanName} vẫn truyền cảm hứng cho hàng triệu người.`,
      },
      {
        title: 'Di sản bất hủ',
        era: 'final legacy portrait',
        sceneType: 'video',
        en: `Because legends like ${cleanName} never truly leave us—they live on in every story we remember and cherish.`,
        vi: `Bởi những huyền thoại như ${cleanName} chưa bao giờ thực sự rời xa—họ sống mãi trong từng ký ức chúng ta trân trọng.`,
      },
    ];

    const selectedBeats: typeof chronologicalBeats = [];
    for (let i = 0; i < narrativeCount; i++) {
      const idx =
        narrativeCount === 1
          ? 0
          : Math.min(
              chronologicalBeats.length - 1,
              Math.round((i * (chronologicalBeats.length - 1)) / (narrativeCount - 1))
            );
      selectedBeats.push(chronologicalBeats[idx]);
    }

    return selectedBeats.map((beat, idx) => ({
      title: beat.title,
      sceneType: beat.sceneType,
      narrationText: lang === 'vi' ? beat.vi : beat.en,
      translationText: lang === 'vi' ? beat.en : beat.vi,
      visualPrompt:
        beat.sceneType === 'video'
          ? `CẦN VIDEO: ${beat.title} (${cleanName})`
          : beat.sceneType === 'quote'
          ? `THẺ CHỮ ĐEN: ${beat.title}`
          : `CẦN ẢNH TĨNH: ${beat.title} (${cleanName})`,
      archivalKeywords: `${cleanName} ${beat.era}`,
      motionEffect: motions[idx % motions.length],
      colorFilter: idx % 2 === 0 ? 'bw-vintage' : 'color-warm',
      frameStyle: 'full-bleed',
      durationSec: 7,
    }));
  };

  const buildClientFallbackScenesFromRawScript = (
    rawScript: string,
    targetSceneCount: number
  ): any[] => {
    const paragraphs = rawScript
      .split(/\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    let segments = [...paragraphs];
    const targetTotal =
      targetSceneCount >= 4
        ? targetSceneCount
        : Math.max(6, Math.min(20, segments.length + 1));
    const targetNarrative = targetTotal - 1;

    if (segments.length < targetNarrative) {
      const allSentences = rawScript
        .replace(/\n+/g, ' ')
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (allSentences.length >= targetNarrative) {
        segments = [];
        const perGroup = allSentences.length / targetNarrative;
        for (let i = 0; i < targetNarrative; i++) {
          const start = Math.floor(i * perGroup);
          const end = Math.max(start + 1, Math.floor((i + 1) * perGroup));
          segments.push(allSentences.slice(start, end).join(' '));
        }
      }
    }

    const motions: MotionEffect[] = ['zoom-in', 'pan-right', 'zoom-out', 'pan-left'];
    return segments.slice(0, targetNarrative).map((seg, idx) => {
      const isQuote = idx > 1 && idx < targetNarrative - 1 && idx % 5 === 3;
      const isVideo = !isQuote && (idx === 0 || idx === targetNarrative - 1 || idx % 3 === 0);
      const sType = isQuote ? 'quote' : isVideo ? 'video' : 'image';
      return {
        title: `Phân cảnh #${String(idx + 1).padStart(2, '0')}`,
        sceneType: sType,
        narrationText: seg,
        translationText: seg,
        visualPrompt:
          sType === 'video'
            ? `CẦN VIDEO: Phân cảnh #${idx + 1}`
            : sType === 'quote'
            ? `THẺ CHỮ ĐEN: Phân cảnh #${idx + 1}`
            : `CẦN ẢNH TĨNH: Phân cảnh #${idx + 1}`,
        motionEffect: motions[idx % motions.length],
        colorFilter: idx % 2 === 0 ? 'bw-vintage' : 'color-warm',
        frameStyle: 'full-bleed',
        durationSec: 7,
      };
    });
  };

  // 1-CLICK FULL AUTO-PILOT PIPELINE (Script + Per-Scene Real Archival Photos + 100% TTS Voiceover + Auto-Play)
  const handleRunFullAutoPilot = async (
    characterOrTopic: string,
    lang: 'en' | 'vi',
    sceneCount: number,
    overrideVoice?: ProjectSettings['ttsVoice'],
    overrideMusicStyle?: ProjectSettings['bgMusicStyle'],
    overrideMusicVolume?: number
  ) => {
    if (isRunningAutoPilot || !characterOrTopic.trim()) return;
    setIsRunningAutoPilot(true);
    setIsPlaying(false);
    setStatusBanner(null);

    const chosenVoice = overrideVoice || settings.ttsVoice || 'Charon';
    const chosenMusic = overrideMusicStyle || settings.bgMusicStyle || 'western-acoustic';
    const chosenVol =
      typeof overrideMusicVolume === 'number' ? overrideMusicVolume : settings.bgMusicVolume;

    // Persist the pre-run selection before starting
    saveAudioPreferences({
      ttsVoice: chosenVoice,
      voiceLanguage: lang,
      bgMusicStyle: chosenMusic,
      bgMusicVolume: chosenVol,
      storyTopic: characterOrTopic,
      sceneCount,
    });

    try {
      // Step 1: Generate Storyboard & Prompts
      setAutoPilotStepText(
        `Bước 1/4: Đang viết kịch bản ${sceneCount} cảnh (Đã khóa Giọng ${chosenVoice} + ${BG_MUSIC_STYLE_LABELS[chosenMusic]})...`
      );
      let rawScenesList: any[] | null = null;
      try {
        const storyRes = await fetch('/api/story/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: characterOrTopic,
            language: lang,
            sceneCount,
            includeQuotes: true,
            channelTitle: settings.channelTitle,
            channelSubtitle: settings.channelMotto,
            customBaseUrl: proxyBaseUrl,
            customModel: proxyModel,
            aspectRatio: settings.aspectRatio,
          }),
        });
        const storyData = await safeParseJsonResponse(storyRes);
        if (storyRes.ok && Array.isArray(storyData?.scenes) && storyData.scenes.length > 0) {
          rawScenesList = storyData.scenes;
        }
      } catch {
        // Will use client-side chronological builder below
      }

      if (!rawScenesList || rawScenesList.length === 0) {
        rawScenesList = buildClientFallbackScenesForTopic(characterOrTopic, lang, sceneCount);
      }

      const initialScenes = mapApiScenesToStoryScenes(
        rawScenesList,
        lang,
        [],
        characterOrTopic,
        sceneCount
      );

      setScenes(initialScenes);
      setActiveSceneId(initialScenes[0]?.id || '');
      setSettings((prev) => ({
        ...prev,
        projectTitle: characterOrTopic.slice(0, 45),
        subtitleLanguage: lang,
        voiceLanguage: lang,
        ttsVoice: chosenVoice,
        bgMusicStyle: chosenMusic,
        bgMusicVolume: chosenVol,
        audioMode: 'stitched-scenes',
      }));

      // Step 2: Automatically match & attach ONLY verified real historical photos AND videos per scene in chronological order!
      setAutoPilotStepText(
        `Bước 2/4: Đang tìm Ảnh Thật & Video Thật của "${characterOrTopic}" + cấp Ảnh Mẫu & Prompt Kling AI cho cảnh thiếu...`
      );
      const {
        updatedScenes: scenesWithRealPhotos,
        matchedVideosCount,
        matchedPhotosCount,
        missingCount,
      } = await matchAndAssignRealPhotosForScenes(initialScenes, characterOrTopic);
      setScenes(scenesWithRealPhotos);

      // Step 3: Generate AI Documentary Voiceover for all scenes using the exact pre-selected voice!
      const finalScenes = await generateVoiceoversForScenesList(
        scenesWithRealPhotos,
        lang,
        (msg) => setAutoPilotStepText(msg),
        chosenVoice
      );
      setScenes(finalScenes);

      // Step 4: Start playback of the completed stitched video
      setAutoPilotStepText('Bước 4/4: Hoàn tất! Đang phát video hoàn chỉnh...');
      setCurrentTimeSec(0);
      setIsPlaying(true);
      setStatusBanner(
        `⚡ Đã dựng ${finalScenes.length} cảnh "${characterOrTopic}" với Giọng ${VOICE_SHORT_LABELS[chosenVoice]} (${lang.toUpperCase()}) + Nhạc ${BG_MUSIC_STYLE_LABELS[chosenMusic]} (Đã lưu lựa chọn): Tìm được ${matchedVideosCount} Video Thật & ${matchedPhotosCount} Ảnh Thật + ${missingCount} Bộ Prompt Kling AI!`
      );
    } catch (err: any) {
      setStatusBanner(err?.message || 'Lỗi khi chạy tự động A-Z.');
    } finally {
      setIsRunningAutoPilot(false);
      setAutoPilotStepText('');
    }
  };

  // Generate Storyboard + Prompts AND automatically grab verified real historical photos for every scene available
  const handleGenerateAIStory = async (
    topic: string,
    lang: 'vi' | 'en',
    sceneCount: number
  ) => {
    setIsGeneratingStory(true);
    setStatusBanner(null);

    saveAudioPreferences({
      voiceLanguage: lang,
      storyTopic: topic,
      sceneCount,
    });

    try {
      let rawScenesList: any[] | null = null;
      try {
        const response = await fetch('/api/story/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic,
            language: lang,
            sceneCount,
            includeQuotes: true,
            channelTitle: settings.channelTitle,
            channelSubtitle: settings.channelMotto,
            customBaseUrl: proxyBaseUrl,
            customModel: proxyModel,
            aspectRatio: settings.aspectRatio,
          }),
        });

        const data = await safeParseJsonResponse(response);
        if (response.ok && Array.isArray(data?.scenes) && data.scenes.length > 0) {
          rawScenesList = data.scenes;
        }
      } catch {
        // Fallback below
      }

      if (!rawScenesList || rawScenesList.length === 0) {
        rawScenesList = buildClientFallbackScenesForTopic(topic, lang, sceneCount);
      }

      const initialScenes = mapApiScenesToStoryScenes(
        rawScenesList,
        lang,
        [],
        topic,
        sceneCount
      );
      setScenes(initialScenes);
      setActiveSceneId(initialScenes[0]?.id || '');
      setSettings((prev) => ({
        ...prev,
        projectTitle: topic.slice(0, 45),
        subtitleLanguage: lang,
        voiceLanguage: lang,
        audioMode: 'stitched-scenes',
      }));
      setCurrentTimeSec(0);

      // Automatically fetch ONLY verified real photos & videos for scenes; scenes without real media get a Reference Image + Standard Kling AI Prompt
      const {
        updatedScenes,
        matchedVideosCount,
        matchedPhotosCount,
        missingCount,
      } = await matchAndAssignRealPhotosForScenes(initialScenes, topic);
      setScenes(updatedScenes);
      setIsPromptStudioOpen(true);
      setStatusBanner(
        `Đã sắp xếp mượt mà ${updatedScenes.length} phân cảnh: Tìm được ${matchedVideosCount} Video Thật & ${matchedPhotosCount} Ảnh Thật chuẩn nhân vật + Cấp sẵn Ảnh Mẫu & ${missingCount} Bộ Prompt Kling AI để bạn vẽ và reg video!`
      );
    } catch (err: any) {
      setStatusBanner(err?.message || 'Có lỗi khi tạo kịch bản AI.');
    } finally {
      setIsGeneratingStory(false);
    }
  };

  // Parse user's pasted raw script into Video/Image segments + automatically grab verified real photos + optional Full Auto-Pilot
  const handleParseRawScript = async (
    rawScript: string,
    lang: 'en' | 'vi',
    runAutoPilotAfter = false,
    characterHint = '',
    targetSceneCount = 0,
    overrideVoice?: ProjectSettings['ttsVoice'],
    overrideMusicStyle?: ProjectSettings['bgMusicStyle'],
    overrideMusicVol?: number
  ) => {
    setIsParsingScript(true);
    if (runAutoPilotAfter) setIsRunningAutoPilot(true);
    setStatusBanner(null);

    const chosenVoice = overrideVoice || settings.ttsVoice || 'Charon';
    const chosenMusic = overrideMusicStyle || settings.bgMusicStyle || 'western-acoustic';
    const chosenVol =
      typeof overrideMusicVol === 'number' ? overrideMusicVol : settings.bgMusicVolume;

    saveAudioPreferences({
      ttsVoice: chosenVoice,
      voiceLanguage: lang,
      bgMusicStyle: chosenMusic,
      bgMusicVolume: chosenVol,
    });

    try {
      setAutoPilotStepText('Bước 1/4: Đang chia phân cảnh kịch bản theo thứ tự mượt mà...');
      let rawScenesList: any[] | null = null;
      try {
        const response = await fetch('/api/story/parse-script', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rawScript,
            language: lang,
            sceneCount: targetSceneCount,
            channelTitle: settings.channelTitle,
            channelSubtitle: settings.channelMotto,
            customBaseUrl: proxyBaseUrl,
            customModel: proxyModel,
            aspectRatio: settings.aspectRatio,
          }),
        });

        const data = await safeParseJsonResponse(response);
        if (response.ok && Array.isArray(data?.scenes) && data.scenes.length > 0) {
          rawScenesList = data.scenes;
        }
      } catch {
        // Fallback below
      }

      if (!rawScenesList || rawScenesList.length === 0) {
        rawScenesList = buildClientFallbackScenesFromRawScript(rawScript, targetSceneCount);
      }

      const topicForPhotos = characterHint.trim() || settings.projectTitle || 'Hollywood Legend';
      const initialScenes = mapApiScenesToStoryScenes(
        rawScenesList,
        lang,
        [],
        topicForPhotos,
        targetSceneCount > 0 ? targetSceneCount : undefined
      );

      setScenes(initialScenes);
      setActiveSceneId(initialScenes[0]?.id || '');
      setSettings((prev) => ({
        ...prev,
        projectTitle: characterHint || prev.projectTitle,
        subtitleLanguage: lang,
        voiceLanguage: lang,
        ttsVoice: chosenVoice,
        bgMusicStyle: chosenMusic,
        bgMusicVolume: chosenVol,
        audioMode: 'stitched-scenes',
      }));
      setCurrentTimeSec(0);

      setAutoPilotStepText(
        `Bước 2/4: Đang tìm Ảnh Thật & Video Thật chuẩn nhân vật + tạo Ảnh Mẫu & Prompt Kling AI cho các cảnh thiếu...`
      );
      const {
        updatedScenes: scenesWithPhotos,
        matchedVideosCount,
        matchedPhotosCount,
        missingCount,
      } = await matchAndAssignRealPhotosForScenes(initialScenes, topicForPhotos);
      setScenes(scenesWithPhotos);

      if (runAutoPilotAfter) {
        const finalScenes = await generateVoiceoversForScenesList(
          scenesWithPhotos,
          lang,
          (msg) => setAutoPilotStepText(msg),
          chosenVoice
        );
        setScenes(finalScenes);
        setCurrentTimeSec(0);
        setIsPlaying(true);
        setStatusBanner(
          `⚡ Đã dựng hoàn chỉnh từ kịch bản (${finalScenes.length} cảnh) với Giọng ${VOICE_SHORT_LABELS[chosenVoice]} (${lang.toUpperCase()}) + Nhạc ${BG_MUSIC_STYLE_LABELS[chosenMusic]} (Đã lưu lựa chọn): Tìm được ${matchedVideosCount} Video Thật & ${matchedPhotosCount} Ảnh Thật + ${missingCount} Prompt Kling AI!`
        );
      } else {
        setStatusBanner(
          `Đã sắp xếp kịch bản thành ${scenesWithPhotos.length} đoạn mượt mà: tìm được ${matchedVideosCount} Video Thật & ${matchedPhotosCount} Ảnh Thật chuẩn nhân vật + cấp sẵn Ảnh Mẫu & ${missingCount} Prompt Kling AI cho các đoạn cần vẽ và reg video!`
        );
      }
    } catch (err: any) {
      setStatusBanner(err?.message || 'Có lỗi khi phân tích kịch bản.');
    } finally {
      setIsParsingScript(false);
      setIsRunningAutoPilot(false);
      setAutoPilotStepText('');
    }
  };

  // Generate a full-frame image directly via the server-side Image Generator and attach to scene
  const handleGenerateImageViaProxyForScene = async (scene: StoryScene) => {
    if (generatingImageSceneId) return;
    setGeneratingImageSceneId(scene.id);
    setStatusBanner(null);

    try {
      const prompt = buildFullFrameImagePrompt(
        scene.imagePrompt || scene.visualPrompt,
        settings.aspectRatio,
        scene.title
      );
      const res = await fetch('/api/proxy/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          customBaseUrl: proxyBaseUrl,
          imageModel: 'dall-e-3',
          aspectRatio: settings.aspectRatio,
        }),
      });
      const data = await safeParseJsonResponse(res);
      if (!res.ok || !data?.imageDataUrl) {
        throw new Error(data?.error || 'Không thể vẽ ảnh tự động (Hãy copy Prompt Chuẩn Kling AI để vẽ trên Kling AI / ChatGPT Pro).');
      }

      const newItem: VaultItem = {
        id: `proxy-img-${Date.now()}`,
        name: `Ảnh Full ${settings.aspectRatio} Cảnh #${scene.order} (${scene.title.slice(0, 18)})`,
        type: 'image',
        url: data.imageDataUrl,
        thumbnailUrl: data.imageDataUrl,
        durationSec: scene.durationSec || 7,
        sourceTag: 'uploaded',
        createdAt: `Ảnh Full ${settings.aspectRatio}`,
      };

      setVaultItems((prev) => [newItem, ...prev]);
      handleUpdateScene(scene.id, {
        mediaId: newItem.id,
        mediaUrl: newItem.url,
        mediaKind: 'image',
        hasRealPhoto: true,
        realPhotoTitle: newItem.name,
        frameStyle: 'full-bleed',
        showBottomSubtitles: true,
      });
      setStatusBanner(
        `Đã vẽ xong Ảnh Gốc Full Khung (${settings.aspectRatio}) cho Cảnh #${scene.order}! Bạn có thể bấm tải ảnh này về đưa qua Kling AI (Image-to-Video) tạo Video.`
      );
    } catch (err: any) {
      setStatusBanner(err?.message || 'Lỗi khi vẽ ảnh Full Khung.');
    } finally {
      setGeneratingImageSceneId(null);
    }
  };

  // Batch generate 100% consistent AI TTS voiceover for all current scenes
  const handleGenerateAllVoiceovers = async (
    overrideVoice?: ProjectSettings['ttsVoice'],
    overrideLang?: 'vi' | 'en'
  ) => {
    if (isGeneratingAllTTS) return;
    setIsGeneratingAllTTS(true);

    const chosenVoice = overrideVoice || settings.ttsVoice || 'Charon';
    const targetVoiceLang =
      overrideLang === 'vi' || overrideLang === 'en'
        ? overrideLang
        : detectProjectVoiceLanguage(scenes, settings);

    try {
      await generateVoiceoversForScenesList(
        scenes,
        targetVoiceLang,
        (msg) => setTtsProgressText(msg),
        chosenVoice
      );
      setSettings((prev) => ({
        ...prev,
        ttsVoice: chosenVoice,
        audioMode: 'stitched-scenes',
        voiceLanguage: targetVoiceLang,
      }));
      setStatusBanner(
        `🎙️ Đã đổi sang Giọng Đọc ${chosenVoice} (${
          targetVoiceLang === 'vi' ? 'Tiếng Việt' : 'Tiếng Anh'
        }) ĐỒNG NHẤT 100% từ đầu đến cuối video (chuẩn hóa âm lượng & chất giọng xuyên suốt)!`
      );
    } catch (err: any) {
      setStatusBanner(err?.message || 'Lỗi khi tạo giọng đọc hàng loạt.');
    } finally {
      setIsGeneratingAllTTS(false);
      setTtsProgressText('');
    }
  };

  const handleAddScene = (type: SceneType) => {
    const newOrder = scenes.length + 1;
    const defaultImg = vaultItems.find((v) => v.type === 'image') || vaultItems[0];
    const sceneTitle =
      type === 'quote'
        ? 'Thẻ Chữ Trích Dẫn Đen'
        : type === 'outro'
        ? 'Huy Hiệu Life Legends'
        : `Phân cảnh mới #${newOrder}`;

    const newScene: StoryScene = {
      id: `scene-${Date.now()}`,
      order: newOrder,
      title: sceneTitle,
      sceneType: type,
      mediaId: type === 'image' || type === 'video' ? defaultImg?.id : undefined,
      mediaUrl: type === 'image' || type === 'video' ? defaultImg?.url : undefined,
      mediaKind: defaultImg?.type === 'video' ? 'video' : 'image',
      durationSec: type === 'outro' ? 4 : 7,
      narrationText:
        type === 'quote'
          ? 'And in that quiet moment, everything changed forever.'
          : 'A true legend is measured by kindness and courage.',
      translationText:
        type === 'quote'
          ? 'Và trong khoảnh khắc tĩnh lặng ấy, mọi thứ đã thay đổi mãi mãi.'
          : 'Một huyền thoại thực sự được đo bằng lòng nhân ái và sự dũng cảm.',
      visualPrompt:
        type === 'video'
          ? 'CẦN VIDEO: Cảnh nhân vật nói chuyện hoặc cử động'
          : type === 'image'
          ? 'CẦN ẢNH TĨNH: Ảnh chân dung cổ điển tràn full khung'
          : 'THẺ CHỮ ĐEN TỰ ĐỘNG',
      imagePrompt: buildFullFrameImagePrompt(
        'Vintage 1960s black and white portrait photography, dramatic lighting',
        settings.aspectRatio,
        sceneTitle
      ),
      videoMotionPrompt: buildFullFrameVideoPrompt(
        'The subject speaks calmly with subtle head movement, realistic vintage film texture',
        settings.aspectRatio,
        sceneTitle
      ),
      motionEffect: 'zoom-in',
      colorFilter: 'bw-vintage',
      frameStyle: 'full-bleed',
      showBottomSubtitles: type === 'image' || type === 'video',
    };

    setScenes((prev) => [...prev, newScene]);
    setActiveSceneId(newScene.id);
  };

  const handleDeleteScene = (sceneId: string) => {
    if (scenes.length <= 1) return;
    const filtered = scenes
      .filter((s) => s.id !== sceneId)
      .map((s, idx) => ({ ...s, order: idx + 1 }));
    setScenes(filtered);
    if (activeSceneId === sceneId) {
      setActiveSceneId(filtered[0].id);
    }
  };

  // Swap ONLY the Video/Image media & visual role between two scenes while keeping sequential script content & voiceovers 100% unchanged
  const handleSwapSceneMedia = (sceneIdA: string, sceneIdB: string) => {
    if (sceneIdA === sceneIdB) return;
    const idxA = scenes.findIndex((s) => s.id === sceneIdA);
    const idxB = scenes.findIndex((s) => s.id === sceneIdB);
    if (idxA < 0 || idxB < 0) return;

    const sceneA = scenes[idxA];
    const sceneB = scenes[idxB];
    if (
      sceneA.sceneType === 'outro' ||
      sceneB.sceneType === 'outro' ||
      sceneA.sceneType === 'quote' ||
      sceneB.sceneType === 'quote'
    ) {
      return;
    }

    const nextScenes = scenes.map((s, idx) => {
      if (idx === idxA) {
        return {
          ...sceneA,
          // Swap visual role & media from B -> A, while keeping A's order, title, narrationText, translationText, voiceoverUrl, durationSec!
          sceneType: sceneB.sceneType,
          mediaId: sceneB.mediaId,
          mediaUrl: sceneB.mediaUrl,
          mediaKind: sceneB.mediaKind,
          hasRealPhoto: sceneB.hasRealPhoto,
          realPhotoTitle: sceneB.realPhotoTitle,
          motionEffect: sceneB.motionEffect,
        };
      }
      if (idx === idxB) {
        return {
          ...sceneB,
          // Swap visual role & media from A -> B, while keeping B's order, title, narrationText, translationText, voiceoverUrl, durationSec!
          sceneType: sceneA.sceneType,
          mediaId: sceneA.mediaId,
          mediaUrl: sceneA.mediaUrl,
          mediaKind: sceneA.mediaKind,
          hasRealPhoto: sceneA.hasRealPhoto,
          realPhotoTitle: sceneA.realPhotoTitle,
          motionEffect: sceneA.motionEffect,
        };
      }
      return s;
    });

    setScenes(nextScenes);
    setStatusBanner(
      `🔄 Đã đảo Video/Ảnh giữa Cảnh #${String(idxA + 1).padStart(2, '0')} và Cảnh #${String(idxB + 1).padStart(2, '0')} — Giữ nguyên 100% thứ tự nội dung lời đọc & giọng thuyết minh!`
    );
  };

  // Move ONLY the Video/Image left or right to the nearest visual scene while keeping all script text & voiceover order intact
  const handleMoveScene = (sceneId: string, direction: -1 | 1) => {
    const idx = scenes.findIndex((s) => s.id === sceneId);
    if (idx < 0) return;
    const current = scenes[idx];
    if (current.sceneType === 'outro' || current.sceneType === 'quote') return;

    let targetIdx = idx + direction;
    while (
      targetIdx >= 0 &&
      targetIdx < scenes.length &&
      (scenes[targetIdx].sceneType === 'quote' || scenes[targetIdx].sceneType === 'outro')
    ) {
      targetIdx += direction;
    }
    if (targetIdx < 0 || targetIdx >= scenes.length) return;

    handleSwapSceneMedia(sceneId, scenes[targetIdx].id);
  };

  // Batch alternate / swap Video <-> Image across visual scenes while preserving sequential story content & >50% video rule
  const handleBatchSwapVideoImageMedia = () => {
    const visualIndices = scenes
      .map((s, idx) => (s.sceneType === 'video' || s.sceneType === 'image' ? idx : -1))
      .filter((idx) => idx >= 0);

    if (visualIndices.length < 2) return;

    // Pair adjacent visual scenes (or swap Video scenes with Image scenes) so their media & visual roles swap while text stays locked
    const copy = [...scenes];
    for (let i = 0; i + 1 < visualIndices.length; i += 2) {
      const idxA = visualIndices[i];
      const idxB = visualIndices[i + 1];
      const sceneA = copy[idxA];
      const sceneB = copy[idxB];

      copy[idxA] = {
        ...sceneA,
        sceneType: sceneB.sceneType,
        mediaId: sceneB.mediaId,
        mediaUrl: sceneB.mediaUrl,
        mediaKind: sceneB.mediaKind,
        hasRealPhoto: sceneB.hasRealPhoto,
        realPhotoTitle: sceneB.realPhotoTitle,
        motionEffect: sceneB.motionEffect,
      };
      copy[idxB] = {
        ...sceneB,
        sceneType: sceneA.sceneType,
        mediaId: sceneA.mediaId,
        mediaUrl: sceneA.mediaUrl,
        mediaKind: sceneA.mediaKind,
        hasRealPhoto: sceneA.hasRealPhoto,
        realPhotoTitle: sceneA.realPhotoTitle,
        motionEffect: sceneA.motionEffect,
      };
    }

    setScenes(copy);
    setStatusBanner(
      '🔀 Đã đảo chéo Video ⇄ Ảnh giữa các cặp phân cảnh trên dòng thời gian — Nội dung kịch bản, phụ đề và giọng đọc giữ nguyên 100% đúng thứ tự!'
    );
  };

  return (
    <div
      className={`flex flex-col h-screen w-screen overflow-hidden bg-[#0B0F17] text-slate-100 ${
        isLightTheme ? 'theme-light' : ''
      }`}
    >
      {/* Strict 3-Zone Top Navigation Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 py-3 border-b border-slate-800/90 bg-[#0B0F17] shrink-0">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#studio"
          onClick={(e) => {
            e.preventDefault();
          }}
          className="text-base font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
        >
          LegendCut Studio
        </a>

        {/* Zone 2: 4 concise single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-400">
          <a
            href="#prompt-studio"
            onClick={(e) => {
              e.preventDefault();
              setIsPromptStudioOpen(true);
            }}
            className="text-amber-400 hover:text-amber-300 font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            Trạm Kết Nối API Trung Gian & Prompt
          </a>
          <a
            href="#auto-stitch"
            onClick={(e) => {
              e.preventDefault();
              handleAutoStitchVault();
            }}
            className="hover:text-amber-400 transition-colors whitespace-nowrap shrink-0"
          >
            Ghép Kho Tự Động
          </a>
          <a
            href="#aspect-ratio"
            onClick={(e) => {
              e.preventDefault();
              setSettings((prev) => ({
                ...prev,
                aspectRatio:
                  prev.aspectRatio === '3:4'
                    ? '9:16'
                    : prev.aspectRatio === '9:16'
                    ? '16:9'
                    : '3:4',
              }));
            }}
            className="hover:text-amber-400 transition-colors whitespace-nowrap shrink-0"
          >
            Khung Hình ({settings.aspectRatio})
          </a>
          <a
            href="#theme-toggle"
            onClick={(e) => {
              e.preventDefault();
              setIsLightTheme((prev) => !prev);
            }}
            className="hover:text-amber-400 transition-colors whitespace-nowrap shrink-0"
          >
            Giao Diện ({isLightTheme ? '☀️ Sáng Dịu Mắt' : '🌙 Tối Điện Ảnh'})
          </a>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setTriggerExportCounter((c) => c + 1)}
            className="px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-500 rounded-lg hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0"
          >
            Xuất Video Hoàn Chỉnh
          </button>
        </div>
      </header>

      {/* Dismissible Action Feedback Banner */}
      {statusBanner && (
        <div className="flex items-center justify-between px-6 py-1.5 bg-amber-500/15 border-b border-amber-500/30 text-xs text-amber-200 shrink-0">
          <span>{statusBanner}</span>
          <button
            onClick={() => setStatusBanner(null)}
            className="text-amber-300 hover:text-white font-medium ml-4 whitespace-nowrap shrink-0"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Main 3-Column Studio Workspace */}
      <div className="flex-1 grid grid-cols-12 min-h-0 overflow-hidden">
        {/* Left Column: 1-Click Auto-Pilot + Kho Tư Liệu + ChatGPT Pro Bridge */}
        <div className="col-span-4 lg:col-span-3 h-full min-h-0 overflow-hidden">
          <MediaVaultPanel
            vaultItems={vaultItems}
            onAddVaultItems={handleAddVaultItems}
            onRemoveVaultItem={handleRemoveVaultItem}
            onClearVault={handleClearVault}
            activeScene={activeScene}
            onAssignMediaToActiveScene={handleAssignMediaToActiveScene}
            onAppendSceneFromMedia={handleAppendSceneFromMedia}
            onAutoStitchVault={handleAutoStitchVault}
            onExtractSampleFrames={() => handleExtractSampleFrames()}
            isExtractingFrames={isExtractingFrames}
            onGenerateAIStory={handleGenerateAIStory}
            isGeneratingStory={isGeneratingStory}
            onRunFullAutoPilot={handleRunFullAutoPilot}
            isRunningAutoPilot={isRunningAutoPilot}
            autoPilotStepText={autoPilotStepText}
            onFetchArchivalPhotos={handleFetchArchivalPhotos}
            isFetchingArchival={isFetchingArchival}
            activePresetId={settings.activePresetId}
            onSelectPreset={handleSelectPreset}
            onOpenPromptStudio={() => setIsPromptStudioOpen(true)}
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
          />
        </div>

        {/* Center Column: Real-Time 60fps Canvas Video Player & Recorder */}
        <div className="col-span-4 lg:col-span-6 h-full min-h-0 overflow-hidden">
          <CanvasStage
            scenes={scenes}
            vaultItems={vaultItems}
            settings={settings}
            activeSceneId={activeSceneId}
            onSelectScene={setActiveSceneId}
            currentTimeSec={currentTimeSec}
            onTimeUpdate={setCurrentTimeSec}
            isPlaying={isPlaying}
            onTogglePlay={setIsPlaying}
            triggerExportCounter={triggerExportCounter}
            onEnsureVoiceoversBeforeExport={handleGenerateAllVoiceovers}
          />
        </div>

        {/* Right Column: Scene Inspector, Prompts, Karaoke Subtitle Style & AI Voiceover */}
        <div className="col-span-4 lg:col-span-3 h-full min-h-0 overflow-hidden">
          <SceneInspector
            scenes={scenes}
            activeScene={activeScene}
            onUpdateScene={handleUpdateScene}
            onAddScene={handleAddScene}
            onDeleteScene={handleDeleteScene}
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            onGenerateAllVoiceovers={handleGenerateAllVoiceovers}
            isGeneratingAllTTS={isGeneratingAllTTS}
            ttsProgressText={ttsProgressText}
            onOpenPromptStudio={() => setIsPromptStudioOpen(true)}
            onGenerateImageViaProxyForScene={handleGenerateImageViaProxyForScene}
            generatingImageSceneId={generatingImageSceneId}
            onUploadFileForScene={handleUploadFileForScene}
            onTriggerExport={() => setTriggerExportCounter((c) => c + 1)}
          />
        </div>
      </div>

      {/* Bottom Horizontal Storyboard & Timeline Track */}
      <TimelineStrip
        scenes={scenes}
        vaultItems={vaultItems}
        activeSceneId={activeSceneId}
        onSelectScene={(id, startSec) => {
          setActiveSceneId(id);
          setCurrentTimeSec(startSec + 0.05);
        }}
        onMoveScene={handleMoveScene}
        onSwapSceneMedia={handleSwapSceneMedia}
        onBatchSwapVideoImageMedia={handleBatchSwapVideoImageMedia}
        onUpdateScene={handleUpdateScene}
        currentTimeSec={currentTimeSec}
        onOpenPromptStudio={() => setIsPromptStudioOpen(true)}
        onUploadFileForScene={handleUploadFileForScene}
        onSmartBatchUploadFiles={handleSmartBatchUploadFiles}
      />

      {/* Full Script Breakdown, Prompt Generator & Intermediary Proxy API Studio Modal */}
      <ScriptPromptStudioModal
        isOpen={isPromptStudioOpen}
        onClose={() => setIsPromptStudioOpen(false)}
        scenes={scenes}
        vaultItems={vaultItems}
        aspectRatio={settings.aspectRatio}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        onParseRawScript={handleParseRawScript}
        isParsingScript={isParsingScript}
        onGenerateAIStory={handleGenerateAIStory}
        isGeneratingStory={isGeneratingStory}
        onUploadFileForScene={handleUploadFileForScene}
        onSmartBatchUploadFiles={handleSmartBatchUploadFiles}
        onUpdateScene={handleUpdateScene}
        isRunningAutoPilot={isRunningAutoPilot}
        autoPilotStepText={autoPilotStepText}
        proxyBaseUrl={proxyBaseUrl}
        onChangeProxyBaseUrl={setProxyBaseUrl}
        proxyModel={proxyModel}
        onChangeProxyModel={setProxyModel}
        onGenerateImageViaProxyForScene={handleGenerateImageViaProxyForScene}
        generatingImageSceneId={generatingImageSceneId}
      />
    </div>
  );
}
