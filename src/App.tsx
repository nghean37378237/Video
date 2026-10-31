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
  detectProjectVoiceLanguage,
  masterAudioToConsistentStudioWav,
  resolveConsistentSceneText,
  VOICE_PERSONA_PROFILES,
} from './utils/voiceConsistencyEngine';
import { CanvasStage } from './components/CanvasStage';
import { MediaVaultPanel } from './components/MediaVaultPanel';
import { SceneInspector } from './components/SceneInspector';
import { TimelineStrip } from './components/TimelineStrip';
import { ScriptPromptStudioModal } from './components/ScriptPromptStudioModal';

export default function App() {
  const [vaultItems, setVaultItems] = useState<VaultItem[]>(INITIAL_VAULT_ITEMS);
  const [scenes, setScenes] = useState<StoryScene[]>(LORNE_GREENE_SCENES);
  const [settings, setSettings] = useState<ProjectSettings>(INITIAL_PROJECT_SETTINGS);
  const [activeSceneId, setActiveSceneId] = useState<string>(LORNE_GREENE_SCENES[0].id);
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

  // Automatically fetch real historical photos of any character from Wikimedia Commons
  const fetchArchivalPhotosInternal = async (characterQuery: string): Promise<VaultItem[]> => {
    try {
      const res = await fetch('/api/archival/fetch-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: characterQuery, limit: 10 }),
      });
      if (!res.ok) return [];
      const data = await res.json();
      if (!Array.isArray(data.photos) || data.photos.length === 0) return [];

      const fetchedItems: VaultItem[] = data.photos.map((p: any, idx: number) => ({
        id: `archival-${Date.now()}-${idx}`,
        name: p.title || `${characterQuery} #${idx + 1}`,
        type: 'image',
        url: p.dataUrl,
        thumbnailUrl: p.dataUrl,
        width: p.width,
        height: p.height,
        durationSec: 7,
        sourceTag: 'uploaded',
        createdAt: 'Ảnh lịch sử tự động',
      }));

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
      const { updatedScenes, matchedCount } = await matchAndAssignRealPhotosForScenes(
        scenes,
        characterQuery
      );
      if (matchedCount > 0) {
        setScenes(updatedScenes);
      }
      const items = await fetchArchivalPhotosInternal(characterQuery);
      const totalFound = matchedCount + items.length;
      if (totalFound > 0) {
        setStatusBanner(
          `Đã tự động lấy ${matchedCount} Ảnh Thực Tế gắn thẳng vào các cảnh (đỡ phải vẽ lại) và thêm ${items.length} ảnh tư liệu của "${characterQuery}" vào Kho!`
        );
      } else {
        setStatusBanner(
          `Không tìm thấy ảnh công khai cho "${characterQuery}". Bạn có thể bấm nút Vẽ Ảnh Gốc để AI vẽ cảnh này.`
        );
      }
    } finally {
      setIsFetchingArchival(false);
    }
  };

  const handleSelectPreset = (presetId: PresetId) => {
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
    setStatusBanner(
      `Đã chuyển sang ${presetMeta.title} (Đầy đủ kịch bản + Prompt Ảnh/Video Full Khung cho từng cảnh).`
    );
  };

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
        durationSec: Math.max(4, Math.min(15, Number(raw.durationSec) || 7)),
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

    return mapped;
  };

  // Strictly match and assign ONLY verified real historical photos of the character in smooth chronological order.
  // Scenes without a verified real photo are NEVER given random/duplicate photos; instead they are marked hasRealPhoto: false with a ready-to-copy Standard Kling AI Prompt!
  const matchAndAssignRealPhotosForScenes = async (
    targetScenes: StoryScene[],
    topicHint: string
  ): Promise<{ updatedScenes: StoryScene[]; matchedCount: number; missingCount: number }> => {
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
      if (!res.ok) {
        const missing = targetScenes.filter(
          (s) => (s.sceneType === 'video' || s.sceneType === 'image') && !s.hasRealPhoto
        ).length;
        return { updatedScenes: targetScenes, matchedCount: 0, missingCount: missing };
      }
      const data = await res.json();
      const matchedMap: Record<
        string,
        { title: string; dataUrl: string; width: number; height: number }
      > = data?.matchedBySceneId || {};

      const newVaultItems: VaultItem[] = [];
      let matchedCount = 0;
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
        if (!matched || !matched.dataUrl) {
          // Do NOT assign random or repeated photos! Keep clean Kling AI Blueprint card + Standard Kling Prompt
          missingCount++;
          return {
            ...sc,
            hasRealPhoto: false,
            realPhotoTitle: undefined,
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

        matchedCount++;
        const vaultItem: VaultItem = {
          id: `real-photo-${Date.now()}-${idx}`,
          name: `📸 Ảnh Thật Cảnh #${String(sc.order).padStart(2, '0')}: ${matched.title}`,
          type: 'image',
          url: matched.dataUrl,
          thumbnailUrl: matched.dataUrl,
          width: matched.width,
          height: matched.height,
          durationSec: sc.durationSec || 7,
          sourceTag: 'uploaded',
          createdAt: 'Ảnh thật chuẩn nhân vật',
        };
        newVaultItems.push(vaultItem);

        return {
          ...sc,
          mediaId: vaultItem.id,
          mediaUrl: vaultItem.url,
          mediaKind: 'image' as const,
          hasRealPhoto: true,
          realPhotoTitle: matched.title,
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

      return { updatedScenes, matchedCount, missingCount };
    } catch {
      const missing = targetScenes.filter(
        (s) => (s.sceneType === 'video' || s.sceneType === 'image') && !s.hasRealPhoto
      ).length;
      return { updatedScenes: targetScenes, matchedCount: 0, missingCount: missing };
    }
  };

  // Batch generate 100% UNIFORM TTS voiceovers from Scene #01 to the end (Locked Engine + Locked Language + 24kHz Studio Broadcast Mastering)
  const generateVoiceoversForScenesList = async (
    targetScenes: StoryScene[],
    lang: 'en' | 'vi',
    onStepProgress?: (msg: string) => void
  ): Promise<StoryScene[]> => {
    const updated = [...targetScenes];
    const voiceName = settings.ttsVoice || 'Charon';
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
        const batchData = await batchRes.json();
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
            const singleData = await singleRes.json();
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
          updated[i] = {
            ...sc,
            voiceoverUrl: masteredAudioUrl,
            voiceEngineUsed: `${voiceName}:${lang}:${engineForScene}`,
            durationSec: Math.max(
              4,
              Math.round((Math.ceil(durationSec * 10) / 10 + 0.35) * 10) / 10
            ),
          };
        } catch {
          const dur = await getMediaDuration(rawAudioUrl, 'audio');
          updated[i] = {
            ...sc,
            voiceoverUrl: rawAudioUrl,
            voiceEngineUsed: `${voiceName}:${lang}:${engineForScene}`,
            durationSec: Math.max(
              4,
              Math.round((Math.ceil(dur * 10) / 10 + 0.35) * 10) / 10
            ),
          };
        }
        setScenes([...updated]);
      }
    }

    setSettings((prev) => ({
      ...prev,
      audioMode: 'stitched-scenes',
      voiceLanguage: lang,
      lockedTtsEngine: lockedEngine,
    }));

    return updated;
  };

  // 1-CLICK FULL AUTO-PILOT PIPELINE (Script + Per-Scene Real Archival Photos + 100% TTS Voiceover + Auto-Play)
  const handleRunFullAutoPilot = async (
    characterOrTopic: string,
    lang: 'en' | 'vi',
    sceneCount: number
  ) => {
    if (isRunningAutoPilot || !characterOrTopic.trim()) return;
    setIsRunningAutoPilot(true);
    setIsPlaying(false);
    setStatusBanner(null);

    try {
      // Step 1: Generate Storyboard & Prompts
      setAutoPilotStepText('Bước 1/4: Đang viết kịch bản & chia cảnh Video/Ảnh...');
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
      const storyData = await storyRes.json();
      if (!storyRes.ok || !Array.isArray(storyData.scenes)) {
        throw new Error(storyData.error || 'Không thể tạo kịch bản.');
      }

      const initialScenes = mapApiScenesToStoryScenes(
        storyData.scenes,
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
        audioMode: 'stitched-scenes',
      }));

      // Step 2: Automatically match & attach ONLY verified real historical photos per scene in chronological order!
      setAutoPilotStepText(
        `Bước 2/4: Đang lọc Ảnh Thật chuẩn của "${characterOrTopic}" (không lấy ảnh lung tung) & tạo Prompt Kling AI cho cảnh thiếu ảnh...`
      );
      const {
        updatedScenes: scenesWithRealPhotos,
        matchedCount,
        missingCount,
      } = await matchAndAssignRealPhotosForScenes(initialScenes, characterOrTopic);
      setScenes(scenesWithRealPhotos);

      // Step 3: Generate AI Documentary Voiceover for all scenes
      const finalScenes = await generateVoiceoversForScenesList(
        scenesWithRealPhotos,
        lang,
        (msg) => setAutoPilotStepText(msg)
      );
      setScenes(finalScenes);

      // Step 4: Start playback of the completed stitched video
      setAutoPilotStepText('Bước 4/4: Hoàn tất! Đang phát video hoàn chỉnh...');
      setCurrentTimeSec(0);
      setIsPlaying(true);
      setStatusBanner(
        `⚡ Đã sắp xếp mượt mà "${characterOrTopic}": Lấy được ${matchedCount} Ảnh Thật chuẩn nhân vật (không lấy ảnh lung tung) + Tạo sẵn ${missingCount} Prompt Chuẩn Kling AI theo thứ tự cho các đoạn chưa có ảnh thật + Đọc thuyết minh đủ 100%!`
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

      const data = await response.json();
      if (!response.ok || !Array.isArray(data.scenes)) {
        throw new Error(data.error || 'Không thể tạo kịch bản.');
      }

      const initialScenes = mapApiScenesToStoryScenes(
        data.scenes,
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
        audioMode: 'stitched-scenes',
      }));
      setCurrentTimeSec(0);

      // Automatically fetch ONLY verified real photos for scenes; scenes without a real photo get a Standard Kling AI Prompt
      const { updatedScenes, matchedCount, missingCount } =
        await matchAndAssignRealPhotosForScenes(initialScenes, topic);
      setScenes(updatedScenes);
      setIsPromptStudioOpen(true);
      setStatusBanner(
        `Đã sắp xếp mượt mà ${updatedScenes.length} phân cảnh: Lấy được ${matchedCount} Ảnh Thật chuẩn nhân vật (không lấy ảnh lung tung) và tạo sẵn ${missingCount} Prompt Chuẩn Kling AI cho các cảnh chưa có ảnh thật!`
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
    targetSceneCount = 0
  ) => {
    setIsParsingScript(true);
    if (runAutoPilotAfter) setIsRunningAutoPilot(true);
    setStatusBanner(null);

    try {
      setAutoPilotStepText('Bước 1/4: Đang chia phân cảnh kịch bản theo thứ tự mượt mà...');
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

      const data = await response.json();
      if (!response.ok || !Array.isArray(data.scenes)) {
        throw new Error(data.error || 'Không thể phân tích kịch bản.');
      }

      const topicForPhotos = characterHint.trim() || settings.projectTitle || 'Hollywood Legend';
      const initialScenes = mapApiScenesToStoryScenes(
        data.scenes,
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
        audioMode: 'stitched-scenes',
      }));
      setCurrentTimeSec(0);

      setAutoPilotStepText(
        `Bước 2/4: Đang lọc Ảnh Thật chuẩn nhân vật & tạo Prompt Kling AI cho các cảnh thiếu ảnh...`
      );
      const {
        updatedScenes: scenesWithPhotos,
        matchedCount,
        missingCount,
      } = await matchAndAssignRealPhotosForScenes(initialScenes, topicForPhotos);
      setScenes(scenesWithPhotos);

      if (runAutoPilotAfter) {
        const finalScenes = await generateVoiceoversForScenesList(
          scenesWithPhotos,
          lang,
          (msg) => setAutoPilotStepText(msg)
        );
        setScenes(finalScenes);
        setCurrentTimeSec(0);
        setIsPlaying(true);
        setStatusBanner(
          `⚡ Đã dựng hoàn chỉnh từ kịch bản (${finalScenes.length} cảnh sắp xếp mượt mà: lấy ${matchedCount} Ảnh Thật chuẩn + tạo sẵn ${missingCount} Prompt Chuẩn Kling AI cho cảnh thiếu ảnh + đọc đủ 100%)!`
        );
      } else {
        setStatusBanner(
          `Đã sắp xếp kịch bản thành ${scenesWithPhotos.length} đoạn mượt mà: lấy được ${matchedCount} Ảnh Thật chuẩn nhân vật và tạo sẵn ${missingCount} Prompt Chuẩn Kling AI cho các đoạn chưa có ảnh thật!`
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
      const data = await res.json();
      if (!res.ok || !data.imageDataUrl) {
        throw new Error(data.error || 'Không thể vẽ ảnh.');
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
  const handleGenerateAllVoiceovers = async () => {
    if (isGeneratingAllTTS) return;
    setIsGeneratingAllTTS(true);

    try {
      const targetVoiceLang = detectProjectVoiceLanguage(scenes, settings);
      await generateVoiceoversForScenesList(
        scenes,
        targetVoiceLang,
        (msg) => setTtsProgressText(msg)
      );
      setSettings((prev) => ({
        ...prev,
        audioMode: 'stitched-scenes',
        voiceLanguage: targetVoiceLang,
      }));
      setStatusBanner(
        `🎙️ Đã đồng bộ Giọng Đọc ${settings.ttsVoice} (${
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

  const handleMoveScene = (sceneId: string, direction: -1 | 1) => {
    const idx = scenes.findIndex((s) => s.id === sceneId);
    if (idx < 0) return;
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= scenes.length) return;

    const copy = [...scenes];
    const [moved] = copy.splice(idx, 1);
    copy.splice(targetIdx, 0, moved);
    const reordered = copy.map((s, i) => ({ ...s, order: i + 1 }));
    setScenes(reordered);
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
          />
        </div>

        {/* Right Column: Scene Inspector, Prompts, Karaoke Subtitle Style & AI Voiceover */}
        <div className="col-span-4 lg:col-span-3 h-full min-h-0 overflow-hidden">
          <SceneInspector
            activeScene={activeScene}
            onUpdateScene={handleUpdateScene}
            onAddScene={handleAddScene}
            onDeleteScene={handleDeleteScene}
            settings={settings}
            onUpdateSettings={(patch) => setSettings((prev) => ({ ...prev, ...patch }))}
            onGenerateAllVoiceovers={handleGenerateAllVoiceovers}
            isGeneratingAllTTS={isGeneratingAllTTS}
            ttsProgressText={ttsProgressText}
            onOpenPromptStudio={() => setIsPromptStudioOpen(true)}
            onGenerateImageViaProxyForScene={handleGenerateImageViaProxyForScene}
            generatingImageSceneId={generatingImageSceneId}
            onUploadFileForScene={handleUploadFileForScene}
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
