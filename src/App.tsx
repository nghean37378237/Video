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
import { extractFramesFromVideo, getMediaDuration } from './utils/frameExtractor';
import { generateVintageArchivalDataUrl } from './utils/vintageCardGenerator';
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
  const [proxyModel, setProxyModel] = useState<string>('gpt-6-astra');
  const [generatingImageSceneId, setGeneratingImageSceneId] = useState<string | null>(null);

  const activeScene = scenes.find((s) => s.id === activeSceneId) || scenes[0];

  useEffect(() => {
    const handler = (e: Event) => {
      const customEvt = e as CustomEvent<'reference-video' | 'stitched-scenes'>;
      if (customEvt.detail) {
        setSettings((prev) => ({ ...prev, audioMode: customEvt.detail }));
      }
    };
    window.addEventListener('legendcut:audiomode', handler);
    return () => window.removeEventListener('legendcut:audiomode', handler);
  }, []);

  // Extract 8 vintage frames from the currently selected reference video into the Vault
  const handleExtractSampleFrames = useCallback(
    async (overrideUrl?: string, overrideLabel?: string) => {
      if (isExtractingFrames) return;
      setIsExtractingFrames(true);
      try {
        const videoUrl = overrideUrl || settings.referenceVideoUrl;
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

  useEffect(() => {
    handleExtractSampleFrames(REFERENCE_VIDEOS['lorne-greene'].url, 'Ảnh Lorne & Buck');
  }, []);

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
      const items = await fetchArchivalPhotosInternal(characterQuery);
      if (items.length > 0) {
        setStatusBanner(
          `Đã tự động tìm & tải ${items.length} ảnh tư liệu lịch sử thật của "${characterQuery}" vào Kho!`
        );
      } else {
        setStatusBanner(
          `Không tìm thấy ảnh công khai cho "${characterQuery}". Bạn có thể tải ảnh từ máy tính hoặc dùng Prompt tạo ảnh.`
        );
      }
    } finally {
      setIsFetchingArchival(false);
    }
  };

  // Switch between the 3 uploaded reference video presets (Lorne Greene, Clayton Moore, Yul Brynner)
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
      referenceVideoUrl: presetMeta.url,
      audioMode: 'reference-video',
    }));
    handleExtractSampleFrames(presetMeta.url, `Ảnh ${presetMeta.title.slice(0, 18)}`);
    setStatusBanner(
      `Đã chuyển sang ${presetMeta.title} (Đầy đủ kịch bản + Prompt Ảnh/Video cho từng cảnh).`
    );
  };

  const handleAddVaultItems = (newItems: VaultItem[]) => {
    setVaultItems((prev) => [...newItems, ...prev]);

    // Automatically match newly uploaded Videos to 'video' scenes and Images to 'image' scenes!
    const uploadedVideos = newItems.filter((i) => i.type === 'video');
    const uploadedImages = newItems.filter((i) => i.type === 'image');

    let vidIdx = 0;
    let imgIdx = 0;

    setScenes((prevScenes) =>
      prevScenes.map((sc, idx) => {
        if (sc.sceneType === 'quote' || sc.sceneType === 'outro') return sc;

        // 1. Check if any uploaded file starts with the exact scene number (e.g., "1.mp4", "02.png", "canh3.jpg")
        const sceneNum = idx + 1;
        const numberedMatch = newItems.find((item) => {
          const m = item.name.match(/(?:^|canh|scene|c)0*(\d+)(?:\D|$)/i);
          return m && Number(m[1]) === sceneNum;
        });

        if (numberedMatch) {
          return {
            ...sc,
            sceneType: numberedMatch.type === 'video' ? 'video' : 'image',
            mediaId: numberedMatch.id,
            mediaUrl: numberedMatch.url,
            mediaKind: numberedMatch.type === 'video' ? 'video' : 'image',
            videoTrimStartSec: 0,
            showBottomSubtitles: true,
          };
        }

        // 2. Otherwise match Videos to 'video' scenes and Images to 'image' scenes in order
        if (sc.sceneType === 'video' && vidIdx < uploadedVideos.length) {
          const v = uploadedVideos[vidIdx++];
          return {
            ...sc,
            mediaId: v.id,
            mediaUrl: v.url,
            mediaKind: 'video',
            videoTrimStartSec: 0,
            showBottomSubtitles: true,
          };
        }

        if (sc.sceneType === 'image' && imgIdx < uploadedImages.length) {
          const img = uploadedImages[imgIdx++];
          return {
            ...sc,
            mediaId: img.id,
            mediaUrl: img.url,
            mediaKind: 'image',
            videoTrimStartSec: 0,
            showBottomSubtitles: true,
          };
        }

        return sc;
      })
    );

    setStatusBanner(
      `Đã tự động nhận ${newItems.length} file (${uploadedVideos.length} Video Grok, ${uploadedImages.length} Ảnh) và tự động khớp vào đúng các phân cảnh tương ứng!`
    );
  };

  const handleSmartBatchUploadFiles = async (fileList: FileList) => {
    if (!fileList || fileList.length === 0) return;
    const newItems: VaultItem[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const objectUrl = URL.createObjectURL(file);
      const isVideo = file.type.startsWith('video/');
      const isImage = file.type.startsWith('image/');
      if (!isVideo && !isImage) continue;

      let durationSec = 7;
      if (isVideo) {
        durationSec = await getMediaDuration(objectUrl, 'video');
      }

      newItems.push({
        id: `batch-${Date.now()}-${i}`,
        name: file.name.replace(/\.[^/.]+$/, ''),
        type: isVideo ? 'video' : 'image',
        url: objectUrl,
        thumbnailUrl: isImage ? objectUrl : undefined,
        durationSec,
        sourceTag: 'uploaded',
        createdAt: 'Thả hàng loạt',
      });
    }

    if (newItems.length > 0) {
      handleAddVaultItems(newItems);
    }
  };

  const handleRemoveVaultItem = (id: string) => {
    setVaultItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleUpdateScene = (sceneId: string, patch: Partial<StoryScene>) => {
    setScenes((prev) =>
      prev.map((sc) => (sc.id === sceneId ? { ...sc, ...patch } : sc))
    );
  };

  const handleUploadFileForScene = async (sceneId: string, file: File) => {
    const objectUrl = URL.createObjectURL(file);
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    if (!isVideo && !isImage) return;

    let durationSec = 7;
    if (isVideo) {
      durationSec = await getMediaDuration(objectUrl, 'video');
    }

    const newItem: VaultItem = {
      id: `scene-upload-${Date.now()}`,
      name: file.name.replace(/\.[^/.]+$/, ''),
      type: isVideo ? 'video' : 'image',
      url: objectUrl,
      thumbnailUrl: isImage ? objectUrl : undefined,
      durationSec,
      sourceTag: 'uploaded',
      createdAt: 'Tải trực tiếp vào cảnh',
    };

    setVaultItems((prev) => [newItem, ...prev]);
    handleUpdateScene(sceneId, {
      sceneType: isVideo ? 'video' : 'image',
      mediaId: newItem.id,
      mediaUrl: newItem.url,
      mediaKind: isVideo ? 'video' : 'image',
      videoTrimStartSec: 0,
      videoTrimEndSec: durationSec,
      showBottomSubtitles: true,
    });
    setStatusBanner(`Đã gắn file "${newItem.name}" trực tiếp vào phân cảnh!`);
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
      showBottomSubtitles: true,
    });
    setStatusBanner(`Đã gán "${item.name}" vào Cảnh #${activeScene.order}.`);
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
      motionEffect: motions[newOrder % motions.length],
      colorFilter: 'color-warm',
      frameStyle: newOrder % 3 === 0 ? 'rounded-frame' : 'full-bleed',
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
        frameStyle: (idx % 3 === 1 ? 'rounded-frame' : sc.frameStyle) as FrameStyle,
        showBottomSubtitles: true,
      };
    });

    setScenes(updatedScenes);
    setCurrentTimeSec(0);
    setIsPlaying(true);
    setStatusBanner(
      `Đã tự động ghép ${pool.length} tư liệu (Video & Ảnh) trong Kho vào ${updatedScenes.length} phân cảnh hoàn chỉnh!`
    );
  };

  // Convert raw API scene objects into StoryScene[], assigning provided visual pool or procedural vintage cards
  const mapApiScenesToStoryScenes = (
    rawScenes: any[],
    lang: 'vi' | 'en',
    visualPool: VaultItem[],
    characterTitle: string
  ): StoryScene[] => {
    let poolIdx = 0;
    return rawScenes.map((raw: any, i: number) => {
      const sType: SceneType = ['video', 'image', 'quote', 'outro'].includes(raw.sceneType)
        ? raw.sceneType
        : 'image';

      let chosenMediaId: string | undefined;
      let chosenMediaUrl: string | undefined;
      let chosenMediaKind: 'video' | 'image' | undefined;

      if (sType === 'video' || sType === 'image') {
        if (visualPool.length > 0) {
          const asset = visualPool[poolIdx++ % visualPool.length];
          chosenMediaId = asset.id;
          chosenMediaUrl = asset.url;
          chosenMediaKind = asset.type === 'video' ? 'video' : 'image';
        } else {
          chosenMediaUrl = generateVintageArchivalDataUrl(
            characterTitle,
            raw.title || `Scene ${i + 1}`,
            i
          );
          chosenMediaKind = 'image';
        }
      }

      return {
        id: `ai-scene-${Date.now()}-${i}`,
        order: i + 1,
        title: raw.title || `Phân cảnh ${i + 1}`,
        sceneType: sType,
        mediaId: chosenMediaId,
        mediaUrl: chosenMediaUrl,
        mediaKind: chosenMediaKind,
        videoTrimStartSec: 0,
        durationSec: Math.max(4, Math.min(15, Number(raw.durationSec) || 7)),
        narrationText:
          lang === 'en' ? raw.narrationText : raw.translationText || raw.narrationText,
        translationText:
          lang === 'vi' ? raw.narrationText : raw.translationText || raw.narrationText,
        visualPrompt: raw.visualPrompt,
        imagePrompt: raw.imagePrompt,
        videoMotionPrompt: raw.videoMotionPrompt,
        archivalKeywords: raw.archivalKeywords,
        motionEffect: (['zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'static'].includes(
          raw.motionEffect
        )
          ? raw.motionEffect
          : 'zoom-in') as MotionEffect,
        colorFilter: (['color-warm', 'bw-vintage', 'sepia', 'original'].includes(raw.colorFilter)
          ? raw.colorFilter
          : 'bw-vintage') as ColorFilter,
        frameStyle: (['full-bleed', 'rounded-frame', 'cinema-letterbox'].includes(raw.frameStyle)
          ? raw.frameStyle
          : sType === 'image'
          ? 'rounded-frame'
          : 'full-bleed') as FrameStyle,
        showBottomSubtitles: sType !== 'quote' && sType !== 'outro',
      };
    });
  };

  // Batch generate TTS voiceovers for a given array of scenes
  const generateVoiceoversForScenesList = async (
    targetScenes: StoryScene[],
    lang: 'en' | 'vi',
    onStepProgress?: (msg: string) => void
  ): Promise<StoryScene[]> => {
    const updated = [...targetScenes];
    for (let i = 0; i < updated.length; i++) {
      const sc = updated[i];
      if (sc.sceneType === 'outro') continue;

      if (onStepProgress) {
        onStepProgress(`Bước 3/4: Đang đọc thuyết minh AI cảnh ${i + 1}/${updated.length}...`);
      }

      const textToSpeak =
        lang === 'vi' && sc.translationText ? sc.translationText : sc.narrationText;

      try {
        const res = await fetch('/api/tts/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: textToSpeak,
            voiceName: settings.ttsVoice,
            style: 'Deep, warm, calm documentary storyteller voice',
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.audioDataUrl) {
            const dur = await getMediaDuration(data.audioDataUrl, 'audio');
            updated[i] = {
              ...sc,
              voiceoverUrl: data.audioDataUrl,
              durationSec: Math.max(4, Math.ceil(dur * 10) / 10 + 0.4),
            };
            setScenes([...updated]);
          }
        }
      } catch {
        // Continue if a single TTS call fails
      }
    }
    return updated;
  };

  // 1-CLICK FULL AUTO-PILOT PIPELINE (Script + Archival Photos + TTS Voiceover + Auto-Play)
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
        }),
      });
      const storyData = await storyRes.json();
      if (!storyRes.ok || !Array.isArray(storyData.scenes)) {
        throw new Error(storyData.error || 'Không thể tạo kịch bản.');
      }

      // Step 2: Fetch Real Archival Historical Photos from Wikimedia Commons
      setAutoPilotStepText(`Bước 2/4: Đang tìm ảnh lịch sử thật của "${characterOrTopic}"...`);
      const fetchedPhotos = await fetchArchivalPhotosInternal(characterOrTopic);
      const userUploaded = vaultItems.filter(
        (i) => i.sourceTag === 'uploaded' && (i.type === 'image' || i.type === 'video')
      );
      const visualPool = fetchedPhotos.length > 0 ? fetchedPhotos : userUploaded;

      const builtScenes = mapApiScenesToStoryScenes(
        storyData.scenes,
        lang,
        visualPool,
        characterOrTopic
      );

      setScenes(builtScenes);
      setActiveSceneId(builtScenes[0]?.id || '');
      setSettings((prev) => ({
        ...prev,
        projectTitle: characterOrTopic.slice(0, 45),
        subtitleLanguage: lang,
        audioMode: 'stitched-scenes',
      }));

      // Step 3: Generate AI Documentary Voiceover for all scenes
      await generateVoiceoversForScenesList(builtScenes, lang, (msg) =>
        setAutoPilotStepText(msg)
      );

      // Step 4: Start playback of the completed stitched video
      setAutoPilotStepText('Bước 4/4: Hoàn tất! Đang phát video hoàn chỉnh...');
      setCurrentTimeSec(0);
      setIsPlaying(true);
      setStatusBanner(
        `⚡ Đã dựng tự động hoàn tất video về "${characterOrTopic}" (${builtScenes.length} cảnh, đã gắn ${fetchedPhotos.length} ảnh lịch sử + giọng đọc thuyết minh + nhạc nền)!`
      );
    } catch (err: any) {
      setStatusBanner(err?.message || 'Lỗi khi chạy tự động A-Z.');
    } finally {
      setIsRunningAutoPilot(false);
      setAutoPilotStepText('');
    }
  };

  // Generate only Storyboard + Prompts
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
        }),
      });

      const data = await response.json();
      if (!response.ok || !Array.isArray(data.scenes)) {
        throw new Error(data.error || 'Không thể tạo kịch bản.');
      }

      const uploadedAssets = vaultItems.filter(
        (i) => i.sourceTag === 'uploaded' && (i.type === 'image' || i.type === 'video')
      );
      const builtScenes = mapApiScenesToStoryScenes(
        data.scenes,
        lang,
        uploadedAssets,
        topic
      );
      setScenes(builtScenes);
      setActiveSceneId(builtScenes[0]?.id || '');
      setSettings((prev) => ({
        ...prev,
        projectTitle: topic.slice(0, 45),
        subtitleLanguage: lang,
        audioMode: 'stitched-scenes',
      }));
      setCurrentTimeSec(0);
      setIsPromptStudioOpen(true);
      setStatusBanner(
        `Đã tạo ${builtScenes.length} phân cảnh kèm bộ Prompt Video & Ảnh chi tiết (${data.provider || 'AI'})!`
      );
    } catch (err: any) {
      setStatusBanner(err?.message || 'Có lỗi khi tạo kịch bản AI.');
    } finally {
      setIsGeneratingStory(false);
    }
  };

  // Parse user's pasted raw script (from ChatGPT Pro) into Video/Image segments + optional Full Auto-Pilot
  const handleParseRawScript = async (
    rawScript: string,
    lang: 'en' | 'vi',
    runAutoPilotAfter = false,
    characterHint = ''
  ) => {
    setIsParsingScript(true);
    if (runAutoPilotAfter) setIsRunningAutoPilot(true);
    setStatusBanner(null);

    try {
      setAutoPilotStepText('Bước 1/4: Đang chia phân cảnh kịch bản qua API...');
      const response = await fetch('/api/story/parse-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawScript,
          language: lang,
          channelTitle: settings.channelTitle,
          channelSubtitle: settings.channelMotto,
          customBaseUrl: proxyBaseUrl,
          customModel: proxyModel,
        }),
      });

      const data = await response.json();
      if (!response.ok || !Array.isArray(data.scenes)) {
        throw new Error(data.error || 'Không thể phân tích kịch bản.');
      }

      let visualPool = vaultItems.filter(
        (i) => i.sourceTag === 'uploaded' && (i.type === 'image' || i.type === 'video')
      );

      if (runAutoPilotAfter && characterHint.trim()) {
        setAutoPilotStepText(`Bước 2/4: Đang tìm ảnh tư liệu thật của "${characterHint}"...`);
        const fetched = await fetchArchivalPhotosInternal(characterHint);
        if (fetched.length > 0) visualPool = fetched;
      }

      const builtScenes = mapApiScenesToStoryScenes(
        data.scenes,
        lang,
        visualPool,
        characterHint || 'Life Legends'
      );

      setScenes(builtScenes);
      setActiveSceneId(builtScenes[0]?.id || '');
      setSettings((prev) => ({
        ...prev,
        projectTitle: characterHint || prev.projectTitle,
        subtitleLanguage: lang,
        audioMode: 'stitched-scenes',
      }));
      setCurrentTimeSec(0);

      if (runAutoPilotAfter) {
        await generateVoiceoversForScenesList(builtScenes, lang, (msg) =>
          setAutoPilotStepText(msg)
        );
        setCurrentTimeSec(0);
        setIsPlaying(true);
        setStatusBanner(
          `⚡ Đã dựng tự động hoàn chỉnh từ kịch bản (${builtScenes.length} cảnh + Ảnh tư liệu + Giọng đọc thuyết minh)!`
        );
      } else {
        setStatusBanner(
          `Đã chia kịch bản thành ${builtScenes.length} đoạn (chỉ rõ đoạn nào cần Video, đoạn nào cần Ảnh tĩnh) kèm bộ Prompt!`
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

  // Generate an image directly via the Intermediary Proxy API (/v1/images/generations) and attach to scene
  const handleGenerateImageViaProxyForScene = async (scene: StoryScene) => {
    if (generatingImageSceneId) return;
    setGeneratingImageSceneId(scene.id);
    setStatusBanner(null);

    try {
      const prompt =
        scene.imagePrompt ||
        scene.visualPrompt ||
        `${scene.title}, vintage 1960s archival photograph, vertical 3:4 portrait`;
      const res = await fetch('/api/proxy/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          customBaseUrl: proxyBaseUrl,
          imageModel: 'dall-e-3',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.imageDataUrl) {
        throw new Error(data.error || 'Không thể vẽ ảnh qua API trung gian.');
      }

      const newItem: VaultItem = {
        id: `proxy-img-${Date.now()}`,
        name: `Ảnh AI Cảnh #${scene.order} (${scene.title.slice(0, 18)})`,
        type: 'image',
        url: data.imageDataUrl,
        thumbnailUrl: data.imageDataUrl,
        durationSec: scene.durationSec || 7,
        sourceTag: 'uploaded',
        createdAt: 'Vẽ qua API Trung Gian',
      };

      setVaultItems((prev) => [newItem, ...prev]);
      handleUpdateScene(scene.id, {
        mediaId: newItem.id,
        mediaUrl: newItem.url,
        mediaKind: 'image',
        showBottomSubtitles: true,
      });
      setStatusBanner(`Đã vẽ ảnh qua API trung gian và tự động gắn vào Cảnh #${scene.order}!`);
    } catch (err: any) {
      setStatusBanner(err?.message || 'Lỗi khi vẽ ảnh qua API trung gian.');
    } finally {
      setGeneratingImageSceneId(null);
    }
  };

  // Batch generate AI TTS voiceover for all current scenes
  const handleGenerateAllVoiceovers = async () => {
    if (isGeneratingAllTTS) return;
    setIsGeneratingAllTTS(true);

    try {
      await generateVoiceoversForScenesList(
        scenes,
        settings.subtitleLanguage === 'vi' ? 'vi' : 'en',
        (msg) => setTtsProgressText(msg)
      );
      setSettings((prev) => ({ ...prev, audioMode: 'stitched-scenes' }));
      setStatusBanner('Đã tạo xong giọng đọc AI cho toàn bộ các phân cảnh!');
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

    const newScene: StoryScene = {
      id: `scene-${Date.now()}`,
      order: newOrder,
      title:
        type === 'quote'
          ? 'Thẻ Chữ Trích Dẫn Đen'
          : type === 'outro'
          ? 'Huy Hiệu Life Legends'
          : `Phân cảnh mới #${newOrder}`,
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
          ? 'CẦN ẢNH TĨNH: Ảnh chân dung cổ điển đóng khung bo tròn'
          : 'THẺ CHỮ ĐEN TỰ ĐỘNG',
      imagePrompt:
        'Vintage 1960s black and white portrait photography, dramatic lighting, 3:4 vertical aspect ratio.',
      videoMotionPrompt:
        'The subject speaks calmly with subtle head movement, realistic vintage film texture.',
      motionEffect: 'zoom-in',
      colorFilter: 'bw-vintage',
      frameStyle: type === 'image' ? 'rounded-frame' : 'full-bleed',
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
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0B0F17] text-slate-100">
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
            href="#subtitles-lang"
            onClick={(e) => {
              e.preventDefault();
              setSettings((prev) => ({
                ...prev,
                subtitleLanguage: prev.subtitleLanguage === 'en' ? 'vi' : 'en',
              }));
            }}
            className="hover:text-amber-400 transition-colors whitespace-nowrap shrink-0"
          >
            Đổi Phụ Đề ({settings.subtitleLanguage === 'en' ? 'Anh → Việt' : 'Việt → Anh'})
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
        currentTimeSec={currentTimeSec}
        onOpenPromptStudio={() => setIsPromptStudioOpen(true)}
      />

      {/* Full Script Breakdown, Prompt Generator & Intermediary Proxy API Studio Modal */}
      <ScriptPromptStudioModal
        isOpen={isPromptStudioOpen}
        onClose={() => setIsPromptStudioOpen(false)}
        scenes={scenes}
        vaultItems={vaultItems}
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
