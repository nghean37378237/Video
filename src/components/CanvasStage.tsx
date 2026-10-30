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
} from 'lucide-react';
import { ProjectSettings, StoryScene, VaultItem } from '../types';
import { REFERENCE_VIDEOS } from '../data/lorneGreenePreset';
import { soundEngine } from '../utils/audioSynth';
import { formatSecLabel } from '../utils/frameExtractor';

const SAMPLE_VIDEO_URLS = new Set(Object.values(REFERENCE_VIDEOS).map((v) => v.url));

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
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const refVideoEl = useRef<HTMLVideoElement | null>(null);
  const customVideoEl = useRef<HTMLVideoElement | null>(null);
  const voiceAudioEl = useRef<HTMLAudioElement | null>(null);
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

  const [isMuted, setIsMuted] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportedVideoUrl, setExportedVideoUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const totalDurationSec = scenes.reduce((acc, s) => acc + (s.durationSec || 5), 0);

  const getCanvasDimensions = () => {
    if (settings.aspectRatio === '9:16') return { width: 720, height: 1280 };
    if (settings.aspectRatio === '16:9') return { width: 1280, height: 720 };
    return { width: 720, height: 960 }; // 3:4 default matching all 3 reference videos
  };

  const { width: canvasW, height: canvasH } = getCanvasDimensions();

  const getSceneAtTime = useCallback(
    (timeSec: number) => {
      let accumulated = 0;
      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const dur = Math.max(1, scene.durationSec || 5);
        if (timeSec >= accumulated && timeSec < accumulated + dur) {
          return {
            scene,
            index: i,
            sceneStartSec: accumulated,
            localTimeSec: timeSec - accumulated,
            progress: Math.min(1, Math.max(0, (timeSec - accumulated) / dur)),
          };
        }
        accumulated += dur;
      }
      const last = scenes[scenes.length - 1];
      return {
        scene: last,
        index: scenes.length - 1,
        sceneStartSec: Math.max(0, accumulated - (last?.durationSec || 5)),
        localTimeSec: last?.durationSec || 0,
        progress: 1,
      };
    },
    [scenes]
  );

  // Preload image assets in scenes & vault
  useEffect(() => {
    const urlsToLoad = new Set<string>();
    vaultItems.forEach((item) => {
      if (item.type === 'image' && item.url) urlsToLoad.add(item.url);
      if (item.thumbnailUrl) urlsToLoad.add(item.thumbnailUrl);
    });
    scenes.forEach((sc) => {
      if (sc.mediaKind === 'image' && sc.mediaUrl) urlsToLoad.add(sc.mediaUrl);
    });

    urlsToLoad.forEach((url) => {
      if (!imageCacheRef.current.has(url)) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = url;
        imageCacheRef.current.set(url, img);
      }
    });
  }, [vaultItems, scenes]);

  const lastSyncedSceneIdRef = useRef<string>('');
  const lastTickRef = useRef<number>(performance.now());

  useEffect(() => {
    const refVid = refVideoEl.current;
    const custVid = customVideoEl.current;
    const voiceAud = voiceAudioEl.current;

    if (!isPlaying) {
      refVid?.pause();
      custVid?.pause();
      voiceAud?.pause();
      soundEngine.stopBackgroundMusic();
      return;
    }

    lastTickRef.current = performance.now();

    if (settings.audioMode === 'stitched-scenes') {
      soundEngine.startBackgroundMusic(
        settings.bgMusicStyle,
        isMuted ? 0 : settings.bgMusicVolume
      );
    } else {
      soundEngine.stopBackgroundMusic();
    }
  }, [isPlaying, settings.audioMode, settings.bgMusicStyle, settings.bgMusicVolume, isMuted]);

  // Master clock loop
  useEffect(() => {
    if (!isPlaying) return;

    let animFrameId: number;
    let currentSec = currentTimeSec;

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - lastTickRef.current) / 1000);
      lastTickRef.current = now;

      currentSec += dt;
      if (currentSec >= totalDurationSec) {
        currentSec = totalDurationSec;
        onTimeUpdate(0);
        onTogglePlay(false);
        if (isExporting && mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
        return;
      }

      onTimeUpdate(currentSec);
      if (isExporting) {
        setExportProgress(Math.min(99, Math.round((currentSec / totalDurationSec) * 100)));
      }
      animFrameId = requestAnimationFrame(tick);
    };

    animFrameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameId);
  }, [isPlaying, totalDurationSec, isExporting]);

  // Sync underlying video/audio elements with currentTimeSec
  useEffect(() => {
    const info = getSceneAtTime(currentTimeSec);
    if (!info.scene) return;

    if (info.scene.id !== activeSceneId && isPlaying) {
      onSelectScene(info.scene.id);
    }

    const { scene, localTimeSec } = info;
    const refVid = refVideoEl.current;
    const custVid = customVideoEl.current;
    const voiceAud = voiceAudioEl.current;

    const resolvedVaultItem = vaultItems.find((v) => v.id === scene.mediaId);
    const activeMediaUrl = resolvedVaultItem?.url || scene.mediaUrl;
    const activeMediaKind = resolvedVaultItem?.type || scene.mediaKind;
    const isSampleVideoUrl = activeMediaUrl ? SAMPLE_VIDEO_URLS.has(activeMediaUrl) : false;

    // 1. Handle Reference Video synchronization
    if (refVid) {
      const desiredRefSrc = isSampleVideoUrl && activeMediaUrl ? activeMediaUrl : settings.referenceVideoUrl;
      if (refVid.getAttribute('data-ref-src') !== desiredRefSrc) {
        refVid.src = desiredRefSrc;
        refVid.setAttribute('data-ref-src', desiredRefSrc);
      }

      refVid.muted = isMuted || settings.audioMode !== 'reference-video';
      refVid.volume = settings.voiceoverVolume;

      const targetRefTime =
        scene.videoTrimStartSec !== undefined
          ? scene.videoTrimStartSec + localTimeSec
          : currentTimeSec;

      if (Math.abs(refVid.currentTime - targetRefTime) > 0.45) {
        try {
          refVid.currentTime = Math.min(refVid.duration || 185, targetRefTime);
        } catch {
          // Ignore seek errors before metadata loads
        }
      }
      if (isPlaying && refVid.paused) {
        refVid.play().catch(() => {});
      } else if (!isPlaying && !refVid.paused) {
        refVid.pause();
      }
    }

    // 2. Handle Custom Vault Video synchronization
    if (custVid && activeMediaKind === 'video' && activeMediaUrl && !isSampleVideoUrl) {
      if (custVid.getAttribute('data-src') !== activeMediaUrl) {
        custVid.src = activeMediaUrl;
        custVid.setAttribute('data-src', activeMediaUrl);
      }
      custVid.muted = true;
      const trimStart = scene.videoTrimStartSec || 0;
      const targetTime = trimStart + localTimeSec;
      if (Math.abs(custVid.currentTime - targetTime) > 0.45) {
        try {
          custVid.currentTime = targetTime % Math.max(1, custVid.duration || 10);
        } catch {
          // Ignore
        }
      }
      if (isPlaying && custVid.paused) {
        custVid.play().catch(() => {});
      }
    } else if (custVid && !custVid.paused) {
      custVid.pause();
    }

    // 3. Handle Scene Voiceover Audio
    if (voiceAud) {
      if (lastSyncedSceneIdRef.current !== scene.id) {
        lastSyncedSceneIdRef.current = scene.id;
        if (scene.voiceoverUrl) {
          voiceAud.src = scene.voiceoverUrl;
          voiceAud.currentTime = Math.min(localTimeSec, voiceAud.duration || 0);
          if (isPlaying) {
            voiceAud.play().catch(() => {});
          }
        } else {
          voiceAud.pause();
          voiceAud.removeAttribute('src');
        }
      }
      voiceAud.muted = isMuted;
      voiceAud.volume = settings.voiceoverVolume;
    }
  }, [
    currentTimeSec,
    getSceneAtTime,
    activeSceneId,
    isPlaying,
    isMuted,
    settings.audioMode,
    settings.voiceoverVolume,
    settings.referenceVideoUrl,
    vaultItems,
    onSelectScene,
  ]);

  // Draw full-frame image/video with Ken Burns motion and smart portrait head-protection
  const drawMediaWithKenBurns = (
    ctx: CanvasRenderingContext2D,
    source: HTMLVideoElement | HTMLImageElement,
    sourceW: number,
    sourceH: number,
    progress: number,
    motion: StoryScene['motionEffect'],
    filter: StoryScene['colorFilter'],
    _frameStyle: StoryScene['frameStyle']
  ) => {
    if (!sourceW || !sourceH) return;

    ctx.save();

    let baseFilter = '';
    if (filter === 'bw-vintage') {
      baseFilter = 'grayscale(100%) contrast(115%) brightness(96%)';
    } else if (filter === 'sepia') {
      baseFilter = 'sepia(75%) contrast(110%) brightness(95%)';
    } else if (filter === 'color-warm') {
      baseFilter = 'saturate(115%) contrast(106%) sepia(15%)';
    }

    ctx.filter = baseFilter || 'none';

    let scale = 1.0;
    let translateX = 0;
    const translateY = 0;

    if (motion === 'zoom-in') {
      scale = 1.0 + progress * 0.12;
    } else if (motion === 'zoom-out') {
      scale = 1.12 - progress * 0.12;
    } else if (motion === 'pan-left') {
      scale = 1.1;
      translateX = (0.5 - progress) * canvasW * 0.07;
    } else if (motion === 'pan-right') {
      scale = 1.1;
      translateX = (progress - 0.5) * canvasW * 0.07;
    }

    // Always fill 100% of the canvas edge-to-edge (no black letterbox bars)
    // and use top-weighted vertical alignment (0.14) when vertical overflow occurs so portrait heads/eyes are never cut off
    const scaleCover = Math.max(canvasW / sourceW, canvasH / sourceH);
    const drawW = sourceW * scaleCover * scale;
    const drawH = sourceH * scaleCover * scale;
    const drawX = (canvasW - drawW) / 2 + translateX;
    const verticalBias = drawH > canvasH ? 0.14 : 0.5;
    const drawY = (canvasH - drawH) * verticalBias + translateY;

    ctx.drawImage(source, drawX, drawY, drawW, drawH);

    ctx.restore();
  };

  // Render rounded vintage film frame border (like 0:31 in Lorne Greene, 1:15 in Clayton Moore, 0:29 in Yul Brynner)
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
    const outerR = Math.min(canvasW, canvasH) * 0.36 * (0.95 + progress * 0.05);

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
    ctx.fillText(settings.channelInitials || 'LL', centerX, centerY - outerR * 0.16);

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

  const drawKaraokeSubtitles = (
    ctx: CanvasRenderingContext2D,
    scene: StoryScene,
    progress: number
  ) => {
    if (!scene.showBottomSubtitles || scene.sceneType === 'quote' || scene.sceneType === 'outro') {
      return;
    }

    const primaryText =
      settings.subtitleLanguage === 'vi' && scene.translationText
        ? scene.translationText
        : scene.narrationText;

    if (!primaryText) return;

    ctx.save();

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

    const activeWordIndex = Math.min(
      words.length - 1,
      Math.max(0, Math.floor(progress * words.length))
    );

    const chunkSize = Math.max(2, Math.min(6, settings.wordsPerLine || 4));
    const chunkIndex = Math.floor(activeWordIndex / chunkSize);
    const chunkWords = words.slice(chunkIndex * chunkSize, (chunkIndex + 1) * chunkSize);
    const activeInChunk = activeWordIndex - chunkIndex * chunkSize;

    const fontSize = Math.round(canvasW * 0.044);
    ctx.font = `italic 700 ${fontSize}px "Oswald", "Plus Jakarta Sans", sans-serif`;
    ctx.textBaseline = 'middle';

    const upperWords = chunkWords.map((w) => w.toUpperCase());
    const fullLineText = upperWords.join(' ');
    const totalWidth = ctx.measureText(fullLineText).width;

    const yPos = (canvasH * (settings.subtitleYPercent || 86)) / 100;
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

  // Continuous 60fps Canvas Render Loop
  useEffect(() => {
    let renderId: number;

    const renderFrame = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const { scene, progress } = getSceneAtTime(currentTimeSec);
      ctx.clearRect(0, 0, canvasW, canvasH);
      ctx.fillStyle = '#040406';
      ctx.fillRect(0, 0, canvasW, canvasH);

      if (scene) {
        if (scene.sceneType === 'quote') {
          drawQuoteIntertitle(ctx, scene, progress);
        } else if (scene.sceneType === 'outro') {
          drawOutroCrest(ctx, progress);
        } else {
          const vaultItem = vaultItems.find((v) => v.id === scene.mediaId);
          const mediaUrl = vaultItem?.url || scene.mediaUrl;
          const mediaKind = vaultItem?.type || scene.mediaKind;

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
                scene.frameStyle
              );
              drawn = true;
            }
          } else if (mediaKind === 'video' && mediaUrl) {
            const isSample = SAMPLE_VIDEO_URLS.has(mediaUrl);
            const vidEl = isSample ? refVideoEl.current : customVideoEl.current;
            if (vidEl && vidEl.readyState >= 2) {
              drawMediaWithKenBurns(
                ctx,
                vidEl,
                vidEl.videoWidth || 720,
                vidEl.videoHeight || 960,
                progress,
                scene.motionEffect,
                scene.colorFilter,
                scene.frameStyle
              );
              drawn = true;
            }
          }

          if (!drawn) {
            // Fallback instructional card showing what asset is needed for this scene
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
                ? '🎥 ĐOẠN NÀY CẦN BỎ VIDEO VÀO KHO'
                : '🖼️ ĐOẠN NÀY CẦN BỎ ẢNH TĨNH VÀO KHO',
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

          if (settings.enableFilmGrain) {
            drawFilmDust(ctx, currentTimeSec);
          }

          drawKaraokeSubtitles(ctx, scene, progress);
        }

        drawAudioEqualizerBadge(ctx, currentTimeSec, isPlaying);
      }

      renderId = requestAnimationFrame(renderFrame);
    };

    renderId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(renderId);
  }, [
    currentTimeSec,
    canvasW,
    canvasH,
    getSceneAtTime,
    vaultItems,
    settings,
    isPlaying,
  ]);

  // Handle Full Video Export via MediaRecorder
  const startVideoExport = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || isExporting) return;

    setExportedVideoUrl(null);
    setIsExporting(true);
    setExportProgress(1);
    recordedChunksRef.current = [];

    onTimeUpdate(0);
    if (refVideoEl.current) {
      refVideoEl.current.currentTime = 0;
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
        selectedMime ? { mimeType: selectedMime, videoBitsPerSecond: 4500000 } : undefined
      );

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, {
          type: selectedMime || 'video/webm',
        });
        const url = URL.createObjectURL(blob);
        setExportedVideoUrl(url);
        setIsExporting(false);
        setExportProgress(100);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      onTogglePlay(true);
    } catch (err) {
      console.error('MediaRecorder error:', err);
      setIsExporting(false);
    }
  }, [isExporting, onTimeUpdate, onTogglePlay]);

  const stopExportEarly = () => {
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

  const jumpScene = (delta: number) => {
    const targetIdx = Math.max(0, Math.min(scenes.length - 1, activeSceneInfo.index + delta));
    let acc = 0;
    for (let i = 0; i < targetIdx; i++) {
      acc += scenes[i].durationSec || 5;
    }
    onSelectScene(scenes[targetIdx].id);
    onTimeUpdate(acc + 0.05);
  };

  return (
    <div className="flex flex-col h-full bg-[#0B0F17] select-none">
      <video
        ref={refVideoEl}
        src={settings.referenceVideoUrl}
        data-ref-src={settings.referenceVideoUrl}
        crossOrigin="anonymous"
        playsInline
        preload="auto"
        className="hidden"
      />
      <video
        ref={customVideoEl}
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
          <span className="font-medium text-slate-200 truncate max-w-[240px]">
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
            onClick={() => onTogglePlay(!isPlaying)}
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
            step={0.1}
            value={currentTimeSec}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              onTimeUpdate(val);
            }}
            className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
          />
          <span className="text-xs font-mono-tabular text-slate-400 w-12">
            {formatSecLabel(totalDurationSec)}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
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
              onClick={() => onTogglePlay(!isPlaying)}
              className="flex items-center gap-2 px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              {isPlaying ? (
                <>
                  <Pause className="w-4 h-4 fill-current" />
                  Tạm dừng
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  Phát Video Ghép
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

          <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
            <button
              onClick={() => {
                const evt = new CustomEvent('legendcut:audiomode', { detail: 'reference-video' });
                window.dispatchEvent(evt);
              }}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                settings.audioMode === 'reference-video'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Âm thanh Video Mẫu
            </button>
            <button
              onClick={() => {
                const evt = new CustomEvent('legendcut:audiomode', { detail: 'stitched-scenes' });
                window.dispatchEvent(evt);
              }}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                settings.audioMode === 'stitched-scenes'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Nhạc Nền + Giọng Đọc Ghép
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
