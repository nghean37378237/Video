import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Download,
  Film,
  SkipBack,
  SkipForward,
  CheckCircle2,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { ProjectSettings, StoryScene, TransitionStyle, VaultItem } from '../types';
import { FIXED_OUTRO_LOGO_URL, REFERENCE_VIDEOS } from '../data/lorneGreenePreset';
import { soundEngine } from '../utils/audioSynth';
import { formatSecLabel } from '../utils/frameExtractor';
import { BG_MUSIC_STYLE_LABELS } from '../utils/voiceConsistencyEngine';

const SAMPLE_VIDEO_URLS = new Set(
  Object.values(REFERENCE_VIDEOS)
    .map((v) => v.url)
    .filter(Boolean)
);

const easeInOutSine = (t: number): number => -(Math.cos(Math.PI * Math.min(1, Math.max(0, t))) - 1) / 2;

const easeInOutCubic = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

interface CanvasStageProps {
  scenes: StoryScene[];
  vaultItems: VaultItem[];
  settings: ProjectSettings;
  activeSceneId: string;
  onSelectScene: (id: string) => void;
  currentTimeSec: number;
  onTimeUpdate: (sec: number) => void;
  isPlaying: boolean;
  onTogglePlay: (playing: boolean) => void;
  triggerExportCounter: number;
  onEnsureVoiceoversBeforeExport?: (
    overrideVoice?: ProjectSettings['ttsVoice'],
    overrideLang?: 'vi' | 'en'
  ) => Promise<void>;
}

export const CanvasStage: React.FC<CanvasStageProps> = ({
  scenes,
  vaultItems,
  settings,
  activeSceneId,
  onSelectScene,
  currentTimeSec,
  onTimeUpdate,
  isPlaying,
  onTogglePlay,
  triggerExportCounter,
  onEnsureVoiceoversBeforeExport,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const refVideoEl = useRef<HTMLVideoElement | null>(null);
  const voiceAudioEl = useRef<HTMLAudioElement | null>(null);
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const videoPoolRef = useRef<Map<string, HTMLVideoElement>>(new Map());

  // High-precision 60fps playhead ref to prevent React re-render jitter during transitions
  const playheadRef = useRef<number>(currentTimeSec);
  const lastUiSyncRef = useRef<number>(0);
  const lastInternalTimeUpdateRef = useRef<number>(currentTimeSec);
  const playAnchorWallTimeRef = useRef<number | null>(null);
  const playAnchorMediaTimeRef = useRef<number>(0);
  const exportStartWallTimeRef = useRef<number | null>(null);
  const exportTargetDurationRef = useRef<number>(0);

  const [isMuted, setIsMuted] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportedVideoUrl, setExportedVideoUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const totalDurationSec = scenes.reduce((acc, s) => acc + Math.round(s.durationSec || 5), 0);

  // Keep playheadRef synced ONLY when paused or when user explicitly scrubs slider / jumps scenes externally
  useEffect(() => {
    if (isExporting) return;
    const isExternalSeek = Math.abs(currentTimeSec - lastInternalTimeUpdateRef.current) > 0.05;
    if (!isPlaying || isExternalSeek) {
      playheadRef.current = currentTimeSec;
      lastInternalTimeUpdateRef.current = currentTimeSec;
      playAnchorMediaTimeRef.current = currentTimeSec;
      playAnchorWallTimeRef.current = isPlaying ? performance.now() : null;
    }
  }, [currentTimeSec, isPlaying, isExporting]);

  // Anchor wall-clock timer whenever play state toggles
  useEffect(() => {
    if (isPlaying) {
      playAnchorMediaTimeRef.current = playheadRef.current;
      playAnchorWallTimeRef.current = performance.now();
    } else {
      playAnchorWallTimeRef.current = null;
    }
  }, [isPlaying]);

  const getCanvasDimensions = () => {
    if (settings.aspectRatio === '9:16') return { width: 720, height: 1280 };
    if (settings.aspectRatio === '16:9') return { width: 1280, height: 720 };
    return { width: 720, height: 960 }; // 3:4 default
  };

  const { width: canvasW, height: canvasH } = getCanvasDimensions();

  const getSceneAtTime = useCallback(
    (timeSec: number) => {
      let accumulated = 0;
      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const dur = Math.max(1, scene.durationSec || 5);
        if (timeSec >= accumulated && timeSec < accumulated + dur) {
          const localTimeSec = timeSec - accumulated;
          const timeRemainingSec = dur - localTimeSec;
          const nextScene = i < scenes.length - 1 ? scenes[i + 1] : undefined;
          return {
            scene,
            nextScene,
            index: i,
            sceneStartSec: accumulated,
            sceneDurationSec: dur,
            localTimeSec,
            timeRemainingSec,
            progress: Math.min(1, Math.max(0, localTimeSec / dur)),
          };
        }
        accumulated += dur;
      }
      const last = scenes[scenes.length - 1];
      const lastDur = Math.max(1, last?.durationSec || 5);
      return {
        scene: last,
        nextScene: undefined,
        index: Math.max(0, scenes.length - 1),
        sceneStartSec: Math.max(0, accumulated - lastDur),
        sceneDurationSec: lastDur,
        localTimeSec: lastDur,
        timeRemainingSec: 0,
        progress: 1,
      };
    },
    [scenes]
  );

  // Preload both Image and Video assets into dedicated offscreen elements so scene transitions never stall or flash black
  useEffect(() => {
    const imageUrls = new Set<string>([FIXED_OUTRO_LOGO_URL]);
    const videoUrls = new Set<string>();

    vaultItems.forEach((item) => {
      if (item.type === 'image' && item.url) imageUrls.add(item.url);
      if (item.thumbnailUrl) imageUrls.add(item.thumbnailUrl);
      if (item.type === 'video' && item.url && !SAMPLE_VIDEO_URLS.has(item.url)) {
        videoUrls.add(item.url);
      }
    });

    scenes.forEach((sc) => {
      const vaultItem = vaultItems.find((v) => v.id === sc.mediaId);
      const url = vaultItem?.url || sc.mediaUrl;
      const kind = vaultItem?.type || sc.mediaKind;
      if (!url) return;
      if (kind === 'image') {
        imageUrls.add(url);
      } else if (kind === 'video' && !SAMPLE_VIDEO_URLS.has(url)) {
        videoUrls.add(url);
      }
    });

    imageUrls.forEach((url) => {
      if (!imageCacheRef.current.has(url)) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = url;
        imageCacheRef.current.set(url, img);
      }
    });

    videoUrls.forEach((url) => {
      if (!videoPoolRef.current.has(url)) {
        const vid = document.createElement('video');
        vid.crossOrigin = 'anonymous';
        vid.playsInline = true;
        vid.muted = true;
        vid.loop = true;
        vid.preload = 'auto';
        vid.src = url;
        vid.load();
        videoPoolRef.current.set(url, vid);
      }
    });
  }, [vaultItems, scenes]);

  // Cleanup pooled video elements on unmount
  useEffect(() => {
    return () => {
      videoPoolRef.current.forEach((vid) => {
        vid.pause();
        vid.removeAttribute('src');
      });
      videoPoolRef.current.clear();
    };
  }, []);

  const lastSyncedSceneIdRef = useRef<string>('');
  const lastTickRef = useRef<number>(performance.now());

  useEffect(() => {
    soundEngine.setSpeakerMuted(isMuted);
  }, [isMuted]);

  useEffect(() => {
    const refVid = refVideoEl.current;
    const voiceAud = voiceAudioEl.current;

    // Route voiceover and reference video elements into the Web Audio mixer & recording stream
    if (voiceAud) soundEngine.connectMediaElement(voiceAud);
    if (refVid) soundEngine.connectMediaElement(refVid);

    if (!isPlaying) {
      refVid?.pause();
      voiceAud?.pause();
      videoPoolRef.current.forEach((v) => v.pause());
      soundEngine.stopBackgroundMusic();
      return;
    }

    lastTickRef.current = performance.now();

    if (settings.audioMode === 'stitched-scenes') {
      soundEngine.startBackgroundMusic(
        settings.bgMusicStyle,
        settings.bgMusicVolume,
        settings.customBgMusicUrl
      );
    } else {
      soundEngine.stopBackgroundMusic();
    }
  }, [
    isPlaying,
    settings.audioMode,
    settings.bgMusicStyle,
    settings.bgMusicVolume,
    settings.customBgMusicUrl,
  ]);

  // Helper to resolve a scene's media URL & kind
  const resolveSceneMedia = useCallback(
    (scene: StoryScene | undefined) => {
      if (!scene) return { url: undefined, kind: undefined };
      const vaultItem = vaultItems.find((v) => v.id === scene.mediaId);
      return {
        url: vaultItem?.url || scene.mediaUrl,
        kind: vaultItem?.type || scene.mediaKind,
      };
    },
    [vaultItems]
  );

  // Sync active & upcoming video/audio elements smoothly
  const syncMediaElementsAtTime = useCallback(
    (timeSec: number) => {
      const info = getSceneAtTime(timeSec);
      if (!info.scene) return;

      const { scene, nextScene, localTimeSec, timeRemainingSec } = info;
      const refVid = refVideoEl.current;
      const voiceAud = voiceAudioEl.current;

      const { url: activeMediaUrl, kind: activeMediaKind } = resolveSceneMedia(scene);
      const { url: nextMediaUrl, kind: nextMediaKind } = resolveSceneMedia(nextScene);

      // 1. Sync pooled custom videos (active scene + pre-warming next scene 1.5s before cut!)
      const activeVidEl =
        activeMediaKind === 'video' && activeMediaUrl ? videoPoolRef.current.get(activeMediaUrl) : undefined;
      const shouldWarmNextVideo =
        nextScene && timeRemainingSec <= Math.max(1.5, (settings.transitionDurationSec ?? 0.75) + 0.6);
      const nextVidEl =
        shouldWarmNextVideo && nextMediaKind === 'video' && nextMediaUrl
          ? videoPoolRef.current.get(nextMediaUrl)
          : undefined;

      videoPoolRef.current.forEach((vidEl) => {
        if (vidEl !== activeVidEl && vidEl !== nextVidEl && !vidEl.paused) {
          vidEl.pause();
        }
      });

      if (activeVidEl) {
        activeVidEl.muted = true;
        const vidDur = Math.max(1, activeVidEl.duration || 10);
        const trimStart = Math.min(Math.max(0, scene.videoTrimStartSec || 0), Math.max(0, vidDur - 0.5));
        const trimEnd =
          scene.videoTrimEndSec && scene.videoTrimEndSec > trimStart + 0.5
            ? Math.min(vidDur, scene.videoTrimEndSec)
            : vidDur;
        const clipWindowDur = Math.max(0.5, trimEnd - trimStart);
        const targetTime = trimStart + (localTimeSec % clipWindowDur);
        if (Math.abs(activeVidEl.currentTime - targetTime) > 0.35) {
          try {
            activeVidEl.currentTime = targetTime;
          } catch {
            // Ignore seek before metadata
          }
        }
        if (isPlaying && activeVidEl.paused) {
          activeVidEl.play().catch(() => {});
        }
      }

      // Pre-warm incoming scene's video so during cross-dissolve both videos play simultaneously at 60fps
      if (nextVidEl && nextScene) {
        nextVidEl.muted = true;
        const vidDur = Math.max(1, nextVidEl.duration || 10);
        const nextTrimStart = Math.min(Math.max(0, nextScene.videoTrimStartSec || 0), Math.max(0, vidDur - 0.5));
        const nextTrimEnd =
          nextScene.videoTrimEndSec && nextScene.videoTrimEndSec > nextTrimStart + 0.5
            ? Math.min(vidDur, nextScene.videoTrimEndSec)
            : vidDur;
        const nextClipWindowDur = Math.max(0.5, nextTrimEnd - nextTrimStart);
        const transDur = Math.min(
          settings.transitionDurationSec ?? 0.75,
          info.sceneDurationSec * 0.45,
          (nextScene.durationSec || 5) * 0.45
        );
        const overlapElapsed = Math.max(0, transDur - timeRemainingSec);
        const targetNextTime = nextTrimStart + (overlapElapsed % nextClipWindowDur);

        if (nextVidEl !== activeVidEl && Math.abs(nextVidEl.currentTime - targetNextTime) > 0.35) {
          try {
            nextVidEl.currentTime = targetNextTime;
          } catch {
            // Ignore
          }
        }
        if (isPlaying && nextVidEl.paused) {
          nextVidEl.play().catch(() => {});
        }
      }

      // 2. Sync Scene Voiceover Audio reliably on start, resume, scrub, and scene transitions with locked pitch & speed
      if (voiceAud) {
        const voiceSyncKey = `${scene.id}::${scene.voiceoverUrl || ''}`;
        let justSwitchedScene = false;
        if (lastSyncedSceneIdRef.current !== voiceSyncKey) {
          lastSyncedSceneIdRef.current = voiceSyncKey;
          justSwitchedScene = true;
          if (scene.voiceoverUrl) {
            voiceAud.src = scene.voiceoverUrl;
            voiceAud.defaultPlaybackRate = 1.0;
            voiceAud.playbackRate = 1.0;
            if ('preservesPitch' in voiceAud) {
              (voiceAud as any).preservesPitch = true;
            }
            voiceAud.load();
          } else {
            voiceAud.pause();
            voiceAud.removeAttribute('src');
          }
        }

        if (scene.voiceoverUrl) {
          const isPreMixedRefClip = scene.voiceoverUrl.includes('/ws_scene_');
          soundEngine.setPreMixedVoiceActive(isPreMixedRefClip);
          // Keep HTMLAudioElement unmuted so MediaElementAudioSourceNode always feeds full voiceover audio into the recording stream; speaker mute is controlled via soundEngine.setSpeakerMuted(isMuted)
          voiceAud.muted = false;
          voiceAud.playbackRate = 1.0;
          const edgeFade =
            timeRemainingSec < 0.14 ? Math.max(0, timeRemainingSec / 0.14) : 1;
          voiceAud.volume = Math.min(1, Math.max(0, settings.voiceoverVolume * edgeFade));

          const hasKnownDuration =
            Number.isFinite(voiceAud.duration) && voiceAud.duration > 0;
          const effectiveAudioDur = hasKnownDuration
            ? voiceAud.duration
            : Math.max(1, scene.durationSec - 0.2);

          if (localTimeSec < effectiveAudioDur - 0.12) {
            const shouldSeek =
              hasKnownDuration &&
              (justSwitchedScene
                ? localTimeSec > 0.45 && Math.abs(voiceAud.currentTime - localTimeSec) > 0.45
                : Math.abs(voiceAud.currentTime - localTimeSec) > 1.85);
            if (shouldSeek) {
              try {
                voiceAud.currentTime = Math.min(voiceAud.duration - 0.05, localTimeSec);
              } catch {
                // Ignore seek error before readyState
              }
            }
            if (isPlaying && voiceAud.paused) {
              voiceAud.play().catch(() => {});
            }
          }
          if (!isPlaying && !voiceAud.paused) {
            voiceAud.pause();
          }
        } else {
          soundEngine.setPreMixedVoiceActive(false);
          if (!voiceAud.paused) {
            voiceAud.pause();
          }
        }
      }

      // 3. Legacy Reference Video fallback if used
      if (refVid && settings.referenceVideoUrl) {
        refVid.muted = settings.audioMode !== 'reference-video';
        refVid.volume = settings.voiceoverVolume;
      }
    },
    [
      getSceneAtTime,
      resolveSceneMedia,
      isPlaying,
      settings.voiceoverVolume,
      settings.audioMode,
      settings.referenceVideoUrl,
      settings.transitionDurationSec,
    ]
  );

  // Sync media whenever user scrubs while paused
  useEffect(() => {
    if (!isPlaying) {
      syncMediaElementsAtTime(currentTimeSec);
    }
  }, [currentTimeSec, isPlaying, syncMediaElementsAtTime]);

  // Draw full-frame image/video with continuous Cinema Ken Burns drift, optical transition transforms, and subtle 35mm lens vignette
  const drawMediaWithKenBurns = (
    ctx: CanvasRenderingContext2D,
    source: HTMLVideoElement | HTMLImageElement,
    sourceW: number,
    sourceH: number,
    progress: number,
    motion: StoryScene['motionEffect'],
    filter: StoryScene['colorFilter'],
    extraScale = 1,
    extraOffsetX = 0,
    extraBlurPx = 0
  ) => {
    if (!sourceW || !sourceH) return;

    ctx.save();

    const filterParts: string[] = [];
    if (filter === 'bw-vintage') {
      filterParts.push('grayscale(100%) contrast(115%) brightness(96%)');
    } else if (filter === 'sepia') {
      filterParts.push('sepia(75%) contrast(110%) brightness(95%)');
    } else if (filter === 'color-warm') {
      filterParts.push('saturate(115%) contrast(106%) sepia(15%)');
    }
    if (extraBlurPx > 0.15) {
      filterParts.push(`blur(${extraBlurPx.toFixed(1)}px)`);
    }

    ctx.filter = filterParts.length > 0 ? filterParts.join(' ') : 'none';

    // Blend linear drift (40%) + sinusoidal ease (60%) so camera motion keeps floating smoothly right through the transition
    const clampedP = Math.min(1, Math.max(0, progress));
    const smoothP = clampedP * 0.4 + easeInOutSine(clampedP) * 0.6;

    let scale = 1.0;
    let translateX = 0;
    let translateY = 0;

    if (motion === 'zoom-in') {
      scale = 1.0 + smoothP * 0.125;
      translateY = -smoothP * canvasH * 0.015;
    } else if (motion === 'zoom-out') {
      scale = 1.125 - smoothP * 0.125;
      translateY = (smoothP - 0.5) * canvasH * 0.015;
    } else if (motion === 'pan-left') {
      scale = 1.1;
      translateX = (0.5 - smoothP) * canvasW * 0.075;
    } else if (motion === 'pan-right') {
      scale = 1.1;
      translateX = (smoothP - 0.5) * canvasW * 0.075;
    }

    scale *= extraScale;
    translateX += extraOffsetX;

    // Fill 100% of the canvas edge-to-edge and protect portrait heads/eyes with 0.14 vertical bias
    const scaleCover = Math.max(canvasW / sourceW, canvasH / sourceH);
    const drawW = sourceW * scaleCover * scale;
    const drawH = sourceH * scaleCover * scale;
    const drawX = (canvasW - drawW) / 2 + translateX;
    const verticalBias = drawH > canvasH ? 0.14 : 0.5;
    const drawY = (canvasH - drawH) * verticalBias + translateY;

    ctx.drawImage(source, drawX, drawY, drawW, drawH);

    // Subtle 35mm cinema lens vignette so all frames feel unified like a theatrical documentary
    ctx.filter = 'none';
    const vigGrad = ctx.createRadialGradient(
      canvasW / 2,
      canvasH * 0.46,
      canvasW * 0.34,
      canvasW / 2,
      canvasH / 2,
      canvasH * 0.72
    );
    vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
    vigGrad.addColorStop(1, 'rgba(3,5,10,0.34)');
    ctx.fillStyle = vigGrad;
    ctx.fillRect(0, 0, canvasW, canvasH);

    ctx.restore();
  };

  const drawRoundedFilmFrame = (ctx: CanvasRenderingContext2D) => {
    ctx.save();
    const borderThickness = Math.round(canvasW * 0.026);
    const radius = Math.round(canvasW * 0.045);

    const grad = ctx.createRadialGradient(
      canvasW / 2,
      canvasH / 2,
      canvasW * 0.3,
      canvasW / 2,
      canvasH / 2,
      canvasH * 0.65
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvasW, canvasH);

    ctx.beginPath();
    ctx.rect(0, 0, canvasW, canvasH);
    ctx.roundRect(
      borderThickness,
      borderThickness,
      canvasW - borderThickness * 2,
      canvasH - borderThickness * 2,
      radius
    );
    ctx.fillStyle = '#070709';
    ctx.fill('evenodd');

    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(
      borderThickness,
      borderThickness,
      canvasW - borderThickness * 2,
      canvasH - borderThickness * 2,
      radius
    );
    ctx.stroke();
    ctx.restore();
  };

  const drawFilmDust = (ctx: CanvasRenderingContext2D, timeSec: number) => {
    ctx.save();
    const seed = Math.floor(timeSec * 12);
    for (let i = 0; i < 4; i++) {
      const hash = Math.sin(seed * 91.7 + i * 37.3) * 10000;
      const frac = hash - Math.floor(hash);
      if (frac > 0.68) {
        const x = ((Math.sin(seed * 17.1 + i) + 1) * 0.5) * canvasW;
        const y = ((Math.cos(seed * 29.4 + i) + 1) * 0.5) * canvasH;
        const r = 1 + (frac - 0.68) * 6;
        ctx.fillStyle = i % 2 === 0 ? 'rgba(255,250,240,0.38)' : 'rgba(20,20,20,0.45)';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  };

  const drawQuoteIntertitle = (
    ctx: CanvasRenderingContext2D,
    scene: StoryScene,
    progress: number
  ) => {
    ctx.save();
    ctx.fillStyle = '#040406';
    ctx.fillRect(0, 0, canvasW, canvasH);

    const text =
      settings.subtitleLanguage === 'vi' && scene.translationText
        ? scene.translationText
        : scene.narrationText;

    const words = text.split(/\s+/).filter(Boolean);
    const visibleWordCount = Math.max(
      1,
      Math.min(words.length, Math.ceil((progress / 0.88) * words.length))
    );

    ctx.font = `italic 700 ${Math.round(canvasW * 0.039)}px "Plus Jakarta Sans", Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const maxWidth = canvasW * 0.78;
    const lines: { word: string; globalIdx: number }[][] = [];
    let currentLine: { word: string; globalIdx: number }[] = [];

    words.forEach((word, idx) => {
      const testLine = [...currentLine.map((w) => w.word), word].join(' ');
      if (ctx.measureText(testLine).width > maxWidth && currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = [{ word, globalIdx: idx }];
      } else {
        currentLine.push({ word, globalIdx: idx });
      }
    });
    if (currentLine.length > 0) lines.push(currentLine);

    const lineHeight = Math.round(canvasW * 0.056);
    const totalBlockHeight = lines.length * lineHeight;
    const startY = (canvasH - totalBlockHeight) / 2 + lineHeight / 2;

    lines.forEach((lineWords, lineIdx) => {
      const lineStr = lineWords.map((w) => w.word).join(' ');
      const y = startY + lineIdx * lineHeight;
      const totalLineW = ctx.measureText(lineStr).width;
      let cursorX = (canvasW - totalLineW) / 2;

      lineWords.forEach((wObj) => {
        const isRevealed = wObj.globalIdx < visibleWordCount;
        const isCurrent = wObj.globalIdx === visibleWordCount - 1;
        ctx.fillStyle = !isRevealed
          ? 'rgba(255,255,255,0.16)'
          : isCurrent
          ? '#FFFFFF'
          : 'rgba(248,250,252,0.94)';

        ctx.textAlign = 'left';
        ctx.fillText(wObj.word, cursorX, y);
        cursorX += ctx.measureText(wObj.word + ' ').width;
      });
    });

    ctx.restore();
  };

  const drawOutroCrest = (ctx: CanvasRenderingContext2D, progress: number) => {
    ctx.save();
    const fixedLogoImg = imageCacheRef.current.get(FIXED_OUTRO_LOGO_URL);
    if (fixedLogoImg && fixedLogoImg.complete && fixedLogoImg.naturalWidth > 0) {
      const smoothP = easeInOutSine(progress);
      const scale = 1.0 + smoothP * 0.06;
      const scaleCover = Math.max(
        canvasW / fixedLogoImg.naturalWidth,
        canvasH / fixedLogoImg.naturalHeight
      );
      const drawW = fixedLogoImg.naturalWidth * scaleCover * scale;
      const drawH = fixedLogoImg.naturalHeight * scaleCover * scale;
      const drawX = (canvasW - drawW) / 2;
      const drawY = (canvasH - drawH) / 2;
      ctx.drawImage(fixedLogoImg, drawX, drawY, drawW, drawH);
      ctx.restore();
      return;
    }

    const bgGrad = ctx.createRadialGradient(
      canvasW / 2,
      canvasH / 2,
      20,
      canvasW / 2,
      canvasH / 2,
      canvasH * 0.65
    );
    bgGrad.addColorStop(0, '#0C1E35');
    bgGrad.addColorStop(0.65, '#07111E');
    bgGrad.addColorStop(1, '#03060C');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, canvasW, canvasH);

    const centerX = canvasW / 2;
    const centerY = canvasH / 2;
    const outerR = Math.min(canvasW, canvasH) * 0.36 * (0.95 + easeInOutSine(progress) * 0.05);

    ctx.strokeStyle = '#C59B27';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(centerX, centerY, outerR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(197, 155, 39, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(centerX, centerY, outerR * 0.76, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#D4AF37';
    ctx.font = `700 ${Math.round(outerR * 0.52)}px "Playfair Display", Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(settings.channelInitials || 'HM', centerX, centerY - outerR * 0.16);

    ctx.save();
    ctx.translate(centerX, centerY + outerR * 0.25);
    ctx.fillStyle = '#C59B27';
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(-outerR * 0.45, -28);
    ctx.lineTo(-outerR * 0.32, 6);
    ctx.lineTo(0, 26);
    ctx.lineTo(outerR * 0.32, 6);
    ctx.lineTo(outerR * 0.45, -28);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#E5C158';
    ctx.font = `700 ${Math.round(outerR * 0.16)}px "Playfair Display", Georgia, serif`;
    ctx.fillText((settings.channelTitle || 'LIFE LEGENDS').toUpperCase(), centerX, centerY - outerR * 0.85);

    ctx.fillStyle = '#CBD5E1';
    ctx.font = `600 ${Math.round(outerR * 0.095)}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText(
      (settings.channelMotto || 'THEIR LEGACY. YOUR INSPIRATION.').toUpperCase(),
      centerX,
      centerY + outerR * 0.86
    );

    ctx.restore();
  };

  // Sweeping warm 35mm Kodak film light-leak overlay during transitions
  const drawWarmFilmLightLeak = (ctx: CanvasRenderingContext2D, t: number) => {
    const intensity = Math.sin(t * Math.PI);
    if (intensity <= 0.01) return;

    ctx.save();
    const leakX = canvasW * (0.15 + t * 0.7);
    const leakY = canvasH * (0.35 + Math.sin(t * Math.PI) * 0.15);
    const grad = ctx.createRadialGradient(
      leakX,
      leakY,
      canvasW * 0.05,
      leakX,
      leakY,
      canvasW * 0.85
    );
    grad.addColorStop(0, `rgba(255, 215, 140, ${(intensity * 0.42).toFixed(3)})`);
    grad.addColorStop(0.45, `rgba(235, 145, 65, ${(intensity * 0.22).toFixed(3)})`);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.restore();
  };

  // Render a single scene's visual layer with optional optical transition transforms (scale, pan offset, rack-focus blur)
  const renderSingleSceneVisual = (
    ctx: CanvasRenderingContext2D,
    scene: StoryScene,
    progress: number,
    alpha: number,
    extraScale = 1,
    extraOffsetX = 0,
    extraBlurPx = 0
  ) => {
    if (alpha <= 0.005) return;

    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0, alpha));

    if (scene.sceneType === 'quote') {
      drawQuoteIntertitle(ctx, scene, progress);
    } else if (scene.sceneType === 'outro') {
      drawOutroCrest(ctx, progress);
    } else {
      const { url: mediaUrl, kind: mediaKind } = resolveSceneMedia(scene);
      let drawn = false;

      if (mediaKind === 'image' && mediaUrl) {
        const img = imageCacheRef.current.get(mediaUrl);
        if (img && img.complete && img.naturalWidth > 0) {
          drawMediaWithKenBurns(
            ctx,
            img,
            img.naturalWidth,
            img.naturalHeight,
            progress,
            scene.motionEffect,
            scene.colorFilter,
            extraScale,
            extraOffsetX,
            extraBlurPx
          );
          drawn = true;
        }
      } else if (mediaKind === 'video' && mediaUrl) {
        const isSample = SAMPLE_VIDEO_URLS.has(mediaUrl);
        const vidEl = isSample ? refVideoEl.current : videoPoolRef.current.get(mediaUrl);
        if (vidEl && vidEl.readyState >= 2) {
          drawMediaWithKenBurns(
            ctx,
            vidEl,
            vidEl.videoWidth || 720,
            vidEl.videoHeight || 960,
            progress,
            scene.motionEffect,
            scene.colorFilter,
            extraScale,
            extraOffsetX,
            extraBlurPx
          );
          drawn = true;
        }
      }

      if (!drawn) {
        const grad = ctx.createLinearGradient(0, 0, canvasW, canvasH);
        grad.addColorStop(0, '#111827');
        grad.addColorStop(1, '#07090E');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvasW, canvasH);

        ctx.fillStyle = '#F59E0B';
        ctx.font = `700 ${Math.round(canvasW * 0.032)}px "Plus Jakarta Sans", sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(
          scene.sceneType === 'video'
            ? '🎥 ĐOẠN NÀY CẦN VIDEO (HOẶC VẼ ẢNH TRƯỚC)'
            : '🖼️ ĐOẠN NÀY CẦN ẢNH TĨNH FULL KHUNG',
          canvasW / 2,
          canvasH * 0.42
        );

        ctx.fillStyle = '#94A3B8';
        ctx.font = `500 ${Math.round(canvasW * 0.024)}px "Plus Jakarta Sans", sans-serif`;
        const hint = (scene.visualPrompt || scene.title).slice(0, 65);
        ctx.fillText(hint, canvasW / 2, canvasH * 0.48);
      }

      if (scene.frameStyle === 'rounded-frame') {
        drawRoundedFilmFrame(ctx);
      }
    }

    ctx.restore();
  };

  const drawKaraokeSubtitles = (
    ctx: CanvasRenderingContext2D,
    scene: StoryScene,
    progress: number,
    localTimeSec: number,
    timeRemainingSec: number
  ) => {
    if (!scene.showBottomSubtitles || scene.sceneType === 'quote' || scene.sceneType === 'outro') {
      return;
    }

    const primaryText =
      settings.subtitleLanguage === 'vi' && scene.translationText
        ? scene.translationText
        : scene.narrationText;

    if (!primaryText) return;

    // Smoothly fade subtitles in during the first 0.22s and out during the last 0.25s of each scene
    const fadeIn = Math.min(1, localTimeSec / 0.22);
    const fadeOut = Math.min(1, timeRemainingSec / 0.25);
    const captionAlpha = Math.max(0, Math.min(fadeIn, fadeOut));
    if (captionAlpha <= 0.02) return;

    ctx.save();
    ctx.globalAlpha = captionAlpha;

    const scrimGrad = ctx.createLinearGradient(0, canvasH * 0.72, 0, canvasH);
    scrimGrad.addColorStop(0, 'rgba(0,0,0,0)');
    scrimGrad.addColorStop(0.45, 'rgba(0,0,0,0.68)');
    scrimGrad.addColorStop(1, 'rgba(0,0,0,0.88)');
    ctx.fillStyle = scrimGrad;
    ctx.fillRect(0, canvasH * 0.72, canvasW, canvasH * 0.28);

    const words = primaryText
      .replace(/[—–]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);

    if (words.length === 0) {
      ctx.restore();
      return;
    }

    const exactWordFloat = progress * words.length;
    const activeWordIndex = Math.min(
      words.length - 1,
      Math.max(0, Math.floor(exactWordFloat))
    );

    const chunkSize = Math.max(2, Math.min(6, settings.wordsPerLine || 4));
    const chunkIndex = Math.floor(activeWordIndex / chunkSize);
    const chunkWords = words.slice(chunkIndex * chunkSize, (chunkIndex + 1) * chunkSize);
    const activeInChunk = activeWordIndex - chunkIndex * chunkSize;

    // Subtle upward glide when a new phrase chunk appears
    const chunkProgress = (exactWordFloat - chunkIndex * chunkSize) / chunkSize;
    const slideOffsetY = (1 - Math.min(1, chunkProgress * 5)) * 4;

    const fontSize = Math.round(canvasW * 0.044);
    ctx.font = `italic 700 ${fontSize}px "Oswald", "Plus Jakarta Sans", sans-serif`;
    ctx.textBaseline = 'middle';

    const upperWords = chunkWords.map((w) => w.toUpperCase());
    const fullLineText = upperWords.join(' ');
    const totalWidth = ctx.measureText(fullLineText).width;

    const yPos = (canvasH * (settings.subtitleYPercent || 86)) / 100 + slideOffsetY;
    let cursorX = (canvasW - totalWidth) / 2;

    upperWords.forEach((word, idx) => {
      const isHighlighted = idx === activeInChunk;

      ctx.save();
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = Math.max(5, Math.round(fontSize * 0.22));
      ctx.shadowColor = 'rgba(0,0,0,0.95)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 3;

      ctx.textAlign = 'left';
      ctx.strokeText(word, cursorX, yPos);

      ctx.fillStyle = isHighlighted ? settings.activeWordColor || '#FFD700' : '#FFFFFF';
      ctx.fillText(word, cursorX, yPos);
      ctx.restore();

      cursorX += ctx.measureText(word + ' ').width;
    });

    if (settings.subtitleLanguage === 'bilingual' && scene.translationText) {
      ctx.font = `500 ${Math.round(canvasW * 0.024)}px "Plus Jakarta Sans", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(254, 240, 138, 0.92)';
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 4;
      const maxChars = 68;
      const viLine =
        scene.translationText.length > maxChars
          ? scene.translationText.slice(0, maxChars) + '…'
          : scene.translationText;
      ctx.fillText(viLine, canvasW / 2, yPos + fontSize * 1.05);
    }

    ctx.restore();
  };

  const drawAudioEqualizerBadge = (
    ctx: CanvasRenderingContext2D,
    timeSec: number,
    playing: boolean
  ) => {
    if (!settings.showWaveformBadge) return;

    ctx.save();
    const barCount = 13;
    const barW = 2.5;
    const gap = 2;
    const totalW = barCount * (barW + gap);
    const startX = canvasW - totalW - Math.round(canvasW * 0.045);
    const baseY = canvasH - Math.round(canvasH * 0.035);

    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(startX - 2, baseY, totalW + 4, 1.5);

    for (let i = 0; i < barCount; i++) {
      const wave = playing
        ? Math.abs(Math.sin(timeSec * 8.5 + i * 0.9) * Math.cos(timeSec * 4.2 - i * 0.5))
        : 0.2;
      const peakProfile = i === 3 || i === 9 ? 1.35 : i % 2 === 0 ? 0.85 : 0.55;
      const barH = Math.max(3, Math.round(wave * 18 * peakProfile));
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.fillRect(startX + i * (barW + gap), baseY - barH, barW, barH);
    }
    ctx.restore();
  };

  // Unified 60fps Master Clock & Smooth Dual-Layer Transition Render Loop (1:1 Real Wall-Clock Locked)
  useEffect(() => {
    let animFrameId: number;
    let exportBackupTimer: ReturnType<typeof setInterval> | null = null;
    lastTickRef.current = performance.now();

    const stepAndRender = (now: number) => {
      const targetTotalDuration =
        isExporting && exportTargetDurationRef.current > 0
          ? exportTargetDurationRef.current
          : totalDurationSec;

      if (isPlaying) {
        if (isExporting && exportStartWallTimeRef.current !== null) {
          // Strict 1:1 wall-clock lock during export so exported video duration === totalDurationSec down to the millisecond
          playheadRef.current = Math.max(0, (now - exportStartWallTimeRef.current) / 1000);
        } else {
          if (playAnchorWallTimeRef.current === null) {
            playAnchorWallTimeRef.current = now;
            playAnchorMediaTimeRef.current = playheadRef.current;
          }
          playheadRef.current =
            playAnchorMediaTimeRef.current +
            Math.max(0, (now - playAnchorWallTimeRef.current) / 1000);
        }
        lastTickRef.current = now;

        if (playheadRef.current >= targetTotalDuration) {
          playheadRef.current = 0;
          lastInternalTimeUpdateRef.current = 0;
          playAnchorMediaTimeRef.current = 0;
          playAnchorWallTimeRef.current = null;
          exportStartWallTimeRef.current = null;
          onTimeUpdate(0);
          onTogglePlay(false);
          if (isExporting && mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
          }
          return;
        }

        // Sync UI scrubber & active scene at ~20fps so React state updates never block 60fps canvas rendering
        if (now - lastUiSyncRef.current > 48) {
          lastUiSyncRef.current = now;
          const t = playheadRef.current;
          lastInternalTimeUpdateRef.current = t;
          onTimeUpdate(t);
          const currentInfo = getSceneAtTime(t);
          if (currentInfo.scene && currentInfo.scene.id !== activeSceneId) {
            onSelectScene(currentInfo.scene.id);
          }
          if (isExporting) {
            setExportProgress(Math.min(99, Math.round((t / targetTotalDuration) * 100)));
          }
        }
      } else {
        lastTickRef.current = now;
      }

      const activeTimeSec = playheadRef.current;
      syncMediaElementsAtTime(activeTimeSec);

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const info = getSceneAtTime(activeTimeSec);
          const {
            scene,
            nextScene,
            sceneDurationSec,
            localTimeSec,
            timeRemainingSec,
            progress,
          } = info;

          ctx.clearRect(0, 0, canvasW, canvasH);
          ctx.fillStyle = '#040406';
          ctx.fillRect(0, 0, canvasW, canvasH);

          if (scene) {
            const configuredStyle: TransitionStyle = settings.transitionStyle || 'cinema-auto';
            const rawTransDur =
              configuredStyle === 'cut'
                ? 0.25
                : Math.max(0.5, settings.transitionDurationSec ?? 1.2);
            const effectiveTransDur = nextScene
              ? Math.min(
                  rawTransDur,
                  sceneDurationSec * 0.45,
                  Math.max(1, nextScene.durationSec || 5) * 0.45
                )
              : 0;

            // Compute continuous Ken Burns progress for the active scene (accounting for its pre-roll overlap in the previous scene so motion NEVER resets at localTimeSec = 0!)
            const prevScene = info.index > 0 ? scenes[info.index - 1] : undefined;
            const prevOverlapDur = prevScene
              ? Math.min(
                  rawTransDur,
                  Math.max(1, prevScene.durationSec || 5) * 0.45,
                  sceneDurationSec * 0.45
                )
              : 0;
            const continuousActiveProgress = Math.min(
              1,
              Math.max(0, (localTimeSec + prevOverlapDur) / (sceneDurationSec + prevOverlapDur))
            );

            const isTransitioning =
              Boolean(nextScene) &&
              effectiveTransDur > 0 &&
              timeRemainingSec <= effectiveTransDur;

            if (isTransitioning && nextScene) {
              const rawT = Math.min(1, Math.max(0, 1 - timeRemainingSec / effectiveTransDur));
              const easedT = easeInOutCubic(rawT);

              // Incoming scene starts its continuous Ken Burns progress at 0 and reaches effectiveTransDur / (nextDur + effectiveTransDur) right at the scene boundary
              const nextDur = Math.max(1, nextScene.durationSec || 5);
              const nextContinuousProgress = Math.min(
                1,
                (rawT * effectiveTransDur) / (nextDur + effectiveTransDur)
              );

              const involvesQuoteOrOutro =
                scene.sceneType === 'quote' ||
                nextScene.sceneType === 'quote' ||
                nextScene.sceneType === 'outro';

              // Resolve effective transition mode when 'cinema-auto' is active
              let activeMode: TransitionStyle = configuredStyle;
              if (configuredStyle === 'cinema-auto') {
                if (involvesQuoteOrOutro) {
                  activeMode = 'dip-to-black';
                } else {
                  const autoCycle: TransitionStyle[] = ['crossfade', 'film-glow', 'cinema-zoom'];
                  activeMode = autoCycle[info.index % autoCycle.length];
                }
              } else if (involvesQuoteOrOutro && configuredStyle !== 'cut') {
                activeMode = 'dip-to-black';
              }

              // Equal-power crossfade alphas so mid-transition brightness never dips
              const outAlpha = Math.cos(easedT * Math.PI * 0.5);
              const inAlpha = Math.sin(easedT * Math.PI * 0.5);

              if (activeMode === 'dip-to-black') {
                // Velvet Cinema Dip-to-Black with gentle focal softening
                if (rawT < 0.5) {
                  const subT = easeInOutCubic(rawT * 2);
                  renderSingleSceneVisual(
                    ctx,
                    scene,
                    continuousActiveProgress,
                    1 - subT,
                    1 + subT * 0.025,
                    0,
                    subT * 3.5
                  );
                } else {
                  const subT = easeInOutCubic((rawT - 0.5) * 2);
                  renderSingleSceneVisual(
                    ctx,
                    nextScene,
                    nextContinuousProgress,
                    subT,
                    1.025 - subT * 0.025,
                    0,
                    (1 - subT) * 3.5
                  );
                }
              } else if (activeMode === 'cinema-zoom') {
                // Smooth 3D Lens Zoom Transition: Outgoing pushes in with depth blur while incoming emerges into crisp focus
                renderSingleSceneVisual(
                  ctx,
                  scene,
                  continuousActiveProgress,
                  outAlpha,
                  1 + easedT * 0.11,
                  0,
                  easedT * 5.5
                );
                renderSingleSceneVisual(
                  ctx,
                  nextScene,
                  nextContinuousProgress,
                  inAlpha,
                  0.93 + easedT * 0.07,
                  0,
                  (1 - easedT) * 5.5
                );
              } else if (activeMode === 'cinema-pan') {
                // Smooth Cinema Whip-Pan Glide with directional motion blur
                const dir = info.index % 2 === 0 ? -1 : 1;
                const motionBlur = Math.sin(easedT * Math.PI) * 6;
                renderSingleSceneVisual(
                  ctx,
                  scene,
                  continuousActiveProgress,
                  1 - easedT * 0.85,
                  1.03,
                  dir * easedT * canvasW * 0.28,
                  motionBlur
                );
                renderSingleSceneVisual(
                  ctx,
                  nextScene,
                  nextContinuousProgress,
                  easedT,
                  1.03,
                  -dir * (1 - easedT) * canvasW * 0.28,
                  motionBlur
                );
              } else if (activeMode === 'film-glow') {
                // Optical Focus Dissolve + Sweeping 35mm Warm Golden Film Light Leak
                renderSingleSceneVisual(
                  ctx,
                  scene,
                  continuousActiveProgress,
                  1,
                  1 + easedT * 0.04,
                  0,
                  easedT * 4
                );
                renderSingleSceneVisual(
                  ctx,
                  nextScene,
                  nextContinuousProgress,
                  easedT,
                  1.04 - easedT * 0.04,
                  0,
                  (1 - easedT) * 4
                );
                drawWarmFilmLightLeak(ctx, easedT);
              } else {
                // Default 'crossfade': Optical Focus Pull Dissolve (Outgoing softens & drifts in, incoming pulls into sharp focus)
                renderSingleSceneVisual(
                  ctx,
                  scene,
                  continuousActiveProgress,
                  1,
                  1 + easedT * 0.038,
                  0,
                  easedT * 4.2
                );
                renderSingleSceneVisual(
                  ctx,
                  nextScene,
                  nextContinuousProgress,
                  easedT,
                  1.038 - easedT * 0.038,
                  0,
                  (1 - easedT) * 4.2
                );
              }
            } else {
              // Standard single scene rendering with gentle cinema fade-in on the very first scene (first 0.55s)
              const firstSceneFadeIn =
                info.index === 0 && localTimeSec < 0.55
                  ? easeInOutSine(localTimeSec / 0.55)
                  : 1;
              const firstSceneBlur =
                info.index === 0 && localTimeSec < 0.55
                  ? (1 - easeInOutSine(localTimeSec / 0.55)) * 4
                  : 0;
              renderSingleSceneVisual(
                ctx,
                scene,
                continuousActiveProgress,
                firstSceneFadeIn,
                1,
                0,
                firstSceneBlur
              );
            }

            if (settings.enableFilmGrain) {
              drawFilmDust(ctx, activeTimeSec);
            }

            drawKaraokeSubtitles(ctx, scene, progress, localTimeSec, timeRemainingSec);
            drawAudioEqualizerBadge(ctx, activeTimeSec, isPlaying);
          }
        }
      }

    };

    const loop = (now: number) => {
      stepAndRender(now);
      animFrameId = requestAnimationFrame(loop);
    };

    animFrameId = requestAnimationFrame(loop);

    // Backup 30fps wall-clock ticker during video export so backgrounding the browser tab never stretches export duration
    if (isExporting && isPlaying) {
      exportBackupTimer = setInterval(() => {
        stepAndRender(performance.now());
      }, 33);
    }

    return () => {
      cancelAnimationFrame(animFrameId);
      if (exportBackupTimer) {
        clearInterval(exportBackupTimer);
      }
    };
  }, [
    isPlaying,
    totalDurationSec,
    isExporting,
    canvasW,
    canvasH,
    getSceneAtTime,
    syncMediaElementsAtTime,
    settings,
    activeSceneId,
    onSelectScene,
    onTimeUpdate,
    onTogglePlay,
  ]);

  // Handle Full Video Export via MediaRecorder (with full Voiceover + Background Music mixed in & 1:1 Exact Duration Lock)
  const startVideoExport = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || isExporting) return;

    // Pause current playback first so we start cleanly from 0:00
    onTogglePlay(false);
    setExportedVideoUrl(null);
    setIsExporting(true);
    setExportProgress(1);
    recordedChunksRef.current = [];

    // Lock the exact timeline duration from current scenes
    const lockedDurationSec = scenes.reduce((acc, s) => acc + Math.round(s.durationSec || 5), 0);
    exportTargetDurationRef.current = lockedDurationSec;

    // If any narrative scene is missing TTS voiceover OR has a different voice persona than the currently selected settings.ttsVoice, auto-sync before export!
    const currentVoice = settings.ttsVoice || 'Charon';
    const currentLang = settings.voiceLanguage;
    const needsVoiceSync = scenes.some((s) => {
      if (s.sceneType === 'outro' || !s.narrationText?.trim()) return false;
      if (!s.voiceoverUrl) return true;
      if (s.voiceEngineUsed && !s.voiceEngineUsed.startsWith(`${currentVoice}:`)) return true;
      if (currentLang && s.voiceEngineUsed && !s.voiceEngineUsed.startsWith(`${currentVoice}:${currentLang}:`)) {
        return true;
      }
      if (s.voiceoverUrl.includes('/ws_scene_') && (currentVoice !== 'Charon' || currentLang === 'vi')) {
        return true;
      }
      return false;
    });
    if (needsVoiceSync && onEnsureVoiceoversBeforeExport) {
      try {
        await onEnsureVoiceoversBeforeExport(currentVoice, currentLang);
      } catch {
        // Continue export even if a scene failed
      }
    }

    // Ensure Web Audio mixer is active and both voiceAudioEl and refVideoEl are connected to the recording destination
    soundEngine.init();
    if (voiceAudioEl.current) {
      voiceAudioEl.current.muted = false;
      soundEngine.connectMediaElement(voiceAudioEl.current);
    }
    if (refVideoEl.current) {
      soundEngine.connectMediaElement(refVideoEl.current);
      refVideoEl.current.currentTime = 0;
    }

    lastSyncedSceneIdRef.current = '';
    playheadRef.current = 0;
    lastInternalTimeUpdateRef.current = 0;
    playAnchorMediaTimeRef.current = 0;
    onTimeUpdate(0);
    if (scenes[0]) {
      onSelectScene(scenes[0].id);
    }

    const canvasStream = canvas.captureStream(30);
    const audioStream = soundEngine.getRecordingStream();
    if (audioStream) {
      audioStream.getAudioTracks().forEach((track) => {
        canvasStream.addTrack(track);
      });
    }

    const mimeTypes = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4',
    ];
    const selectedMime = mimeTypes.find((m) => MediaRecorder.isTypeSupported(m)) || '';

    try {
      const recorder = new MediaRecorder(
        canvasStream,
        selectedMime
          ? {
              mimeType: selectedMime,
              videoBitsPerSecond: 4500000,
              audioBitsPerSecond: 192000,
            }
          : undefined
      );

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        exportStartWallTimeRef.current = null;
        const blob = new Blob(recordedChunksRef.current, {
          type: selectedMime || 'video/webm',
        });
        const url = URL.createObjectURL(blob);
        setExportedVideoUrl(url);
        setIsExporting(false);
        setExportProgress(100);
      };

      mediaRecorderRef.current = recorder;
      const startNow = performance.now();
      exportStartWallTimeRef.current = startNow;
      playAnchorWallTimeRef.current = startNow;
      recorder.start(250);
      onTogglePlay(true);
    } catch (err) {
      console.error('MediaRecorder error:', err);
      exportStartWallTimeRef.current = null;
      setIsExporting(false);
    }
  }, [
    isExporting,
    scenes,
    onEnsureVoiceoversBeforeExport,
    onTimeUpdate,
    onSelectScene,
    onTogglePlay,
  ]);

  const stopExportEarly = () => {
    exportStartWallTimeRef.current = null;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      onTogglePlay(false);
    }
  };

  const prevTriggerRef = useRef(triggerExportCounter);
  useEffect(() => {
    if (triggerExportCounter > prevTriggerRef.current) {
      prevTriggerRef.current = triggerExportCounter;
      startVideoExport();
    }
  }, [triggerExportCounter, startVideoExport]);

  const activeSceneInfo = getSceneAtTime(currentTimeSec);

  const [isSyncingVoiceBeforePlay, setIsSyncingVoiceBeforePlay] = useState(false);

  const handleTogglePlayWithSavedVoice = async () => {
    if (isPlaying) {
      onTogglePlay(false);
      return;
    }
    if (isSyncingVoiceBeforePlay) return;

    const currentVoice = settings.ttsVoice || 'Charon';
    const currentLang = settings.voiceLanguage;
    const needsVoiceSync = scenes.some((s) => {
      if (s.sceneType === 'outro' || !s.narrationText?.trim()) return false;
      if (!s.voiceoverUrl) return true;
      if (s.voiceEngineUsed && !s.voiceEngineUsed.startsWith(`${currentVoice}:`)) return true;
      if (
        currentLang &&
        s.voiceEngineUsed &&
        !s.voiceEngineUsed.startsWith(`${currentVoice}:${currentLang}:`)
      ) {
        return true;
      }
      if (
        s.voiceoverUrl.includes('/ws_scene_') &&
        (currentVoice !== 'Charon' || currentLang === 'vi')
      ) {
        return true;
      }
      return false;
    });

    if (needsVoiceSync && onEnsureVoiceoversBeforeExport) {
      setIsSyncingVoiceBeforePlay(true);
      try {
        await onEnsureVoiceoversBeforeExport(currentVoice, currentLang);
      } catch {
        // Continue playback
      } finally {
        setIsSyncingVoiceBeforePlay(false);
      }
    }

    onTogglePlay(true);
  };

  const jumpScene = (delta: number) => {
    const targetIdx = Math.max(0, Math.min(scenes.length - 1, activeSceneInfo.index + delta));
    let acc = 0;
    for (let i = 0; i < targetIdx; i++) {
      acc += scenes[i].durationSec || 5;
    }
    playheadRef.current = acc + 0.05;
    onSelectScene(scenes[targetIdx].id);
    onTimeUpdate(acc + 0.05);
  };

  return (
    <div className="flex flex-col h-full bg-[#0B0F17] select-none">
      <video
        ref={refVideoEl}
        src={settings.referenceVideoUrl || undefined}
        data-ref-src={settings.referenceVideoUrl}
        crossOrigin="anonymous"
        playsInline
        preload="auto"
        className="hidden"
      />
      <audio ref={voiceAudioEl} crossOrigin="anonymous" className="hidden" />

      {/* Top Stage Info Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800/80 bg-[#111827]/60">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Film className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="font-medium text-slate-200 truncate max-w-[220px]">
            Cảnh {activeSceneInfo.index + 1}/{scenes.length}: {activeSceneInfo.scene?.title}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono-tabular text-amber-400">
            {activeSceneInfo.scene?.sceneType === 'video'
              ? 'CẦN VIDEO'
              : activeSceneInfo.scene?.sceneType === 'image'
              ? 'CẦN ẢNH TĨNH'
              : activeSceneInfo.scene?.sceneType === 'quote'
              ? 'THẺ CHỮ ĐEN'
              : 'LOGO KẾT'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Always-visible Cinema Transition Style Selector on Top Stage Bar */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900/95 border border-amber-500/40 text-[11px]">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-slate-300 hidden sm:inline">Chuyển cảnh:</span>
            <select
              value={settings.transitionStyle || 'cinema-auto'}
              onChange={(e) => {
                const evt = new CustomEvent('legendcut:transition', {
                  detail: e.target.value as TransitionStyle,
                });
                window.dispatchEvent(evt);
              }}
              className="bg-transparent text-amber-400 font-semibold focus:outline-none cursor-pointer"
            >
              <option value="cinema-auto" className="bg-slate-900 text-slate-100">
                🎬 Điện Ảnh Tự Động (Mượt Như Phim)
              </option>
              <option value="crossfade" className="bg-slate-900 text-slate-100">
                ✨ Hòa Tan Tiêu Cự (Optical Dissolve)
              </option>
              <option value="film-glow" className="bg-slate-900 text-slate-100">
                🎞️ Cháy Sáng Phim 35mm (Light Leak)
              </option>
              <option value="cinema-zoom" className="bg-slate-900 text-slate-100">
                🔍 Thu Phóng Tiêu Cự (Lens Zoom)
              </option>
              <option value="cinema-pan" className="bg-slate-900 text-slate-100">
                ↔️ Lướt Máy Quay (Smooth Whip Pan)
              </option>
              <option value="dip-to-black" className="bg-slate-900 text-slate-100">
                🌑 Mờ Sâu Qua Đen (Velvet Fade)
              </option>
              <option value="cut" className="bg-slate-900 text-slate-100">
                ⚡ Cắt Nhanh (Quick Cut)
              </option>
            </select>
          </div>

          {exportedVideoUrl && (
            <a
              href={exportedVideoUrl}
              download={`${settings.projectTitle.replace(/\s+/g, '_')}.webm`}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-md hover:bg-emerald-500/30 transition-colors whitespace-nowrap shrink-0"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Tải Video Đã Ghép (.webm)
            </a>
          )}

          {isExporting ? (
            <button
              onClick={stopExportEarly}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold bg-rose-600 text-white rounded-md hover:bg-rose-500 transition-colors whitespace-nowrap shrink-0"
            >
              Đang ghi hình {exportProgress}% (Dừng & Lưu ngay)
            </button>
          ) : (
            <button
              onClick={startVideoExport}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold bg-amber-500 text-slate-950 rounded-md hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Ghi & Xuất Video
            </button>
          )}
        </div>
      </div>

      {/* Main Viewport Canvas Container */}
      <div className="relative flex-1 flex items-center justify-center p-4 overflow-hidden bg-[#070A10]">
        <div
          className="relative flex items-center justify-center shadow-2xl border border-slate-800/90 rounded-lg overflow-hidden bg-black"
          style={{
            maxHeight: '100%',
            maxWidth: '100%',
            aspectRatio:
              settings.aspectRatio === '9:16'
                ? '9 / 16'
                : settings.aspectRatio === '16:9'
                ? '16 / 9'
                : '3 / 4',
          }}
        >
          <canvas
            ref={canvasRef}
            width={canvasW}
            height={canvasH}
            onClick={() => handleTogglePlayWithSavedVoice()}
            className="w-full h-full object-contain cursor-pointer"
          />
        </div>
      </div>

      {/* Player Transport & Scrubber Bar */}
      <div className="px-4 py-3 border-t border-slate-800/80 bg-[#111827]">
        <div className="flex items-center gap-3 mb-2.5">
          <span className="text-xs font-mono-tabular text-amber-400 w-12 text-right">
            {formatSecLabel(currentTimeSec)}
          </span>
          <input
            type="range"
            min={0}
            max={Math.max(1, totalDurationSec)}
            step={0.05}
            value={currentTimeSec}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              playheadRef.current = val;
              onTimeUpdate(val);
            }}
            className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
          />
          <span className="text-xs font-mono-tabular text-slate-400 w-12">
            {formatSecLabel(totalDurationSec)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                playheadRef.current = 0;
                onTimeUpdate(0);
                onTogglePlay(false);
              }}
              title="Về đầu video"
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={() => jumpScene(-1)}
              title="Cảnh trước"
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors"
            >
              <SkipBack className="w-4 h-4" />
            </button>
            <button
              onClick={handleTogglePlayWithSavedVoice}
              disabled={isSyncingVoiceBeforePlay}
              className="flex items-center gap-2 px-4 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-semibold text-xs rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              {isSyncingVoiceBeforePlay ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Đang áp giọng {settings.ttsVoice} đã lưu...
                </>
              ) : isPlaying ? (
                <>
                  <Pause className="w-4 h-4 fill-current" />
                  Tạm dừng
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  Phát Video Ghép ({settings.ttsVoice})
                </>
              )}
            </button>
            <button
              onClick={() => jumpScene(1)}
              title="Cảnh tiếp theo"
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors"
            >
              <SkipForward className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsMuted(!isMuted)}
              title={isMuted ? 'Bật âm thanh' : 'Tắt âm thanh'}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors"
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
            <button
              onClick={() => {
                const evt = new CustomEvent('legendcut:audiomode', { detail: 'stitched-scenes' });
                window.dispatchEvent(evt);
              }}
              className="px-2.5 py-1 text-[11px] font-semibold rounded bg-amber-500 text-slate-950 transition-colors whitespace-nowrap shrink-0"
            >
              💾 Giọng {settings.ttsVoice} ({(settings.voiceLanguage || 'en').toUpperCase()}) +{' '}
              {BG_MUSIC_STYLE_LABELS[settings.bgMusicStyle]}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
