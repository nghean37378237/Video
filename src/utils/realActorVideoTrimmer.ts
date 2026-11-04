import { StoryScene } from '../types';

export interface TrimmedActorVideoCut {
  id: string;
  title: string;
  videoUrl: string;
  thumbnailUrl: string;
  trimStartSec: number;
  trimEndSec: number;
  durationSec: number;
  width: number;
  height: number;
  sourceLabel: string;
}

export interface VerifiedActorPhotoFallback {
  title: string;
  dataUrl: string;
  width: number;
  height: number;
}

/**
 * Fetches 2-3 real archival videos of the actor (from Wikimedia Commons + Internet Archive via /api/archival/fetch-and-trim-videos)
 * and automatically cuts/trims them into non-overlapping clean highlight segments (trimStartSec -> trimEndSec).
 *
 * IMPORTANT: Does NOT synthesize fake videos from photos when a real video isn't available!
 * Any segment where a real video is not found keeps its real reference photo + Grok / Kling AI prompt
 * so the user can generate the video in Grok or Kling AI.
 */
export async function fetchAndAutoTrimActorRealVideos(
  characterName: string,
  targetScenes: StoryScene[],
  desiredCount = 3,
  onProgress?: (msg: string) => void
): Promise<{
  videoCuts: TrimmedActorVideoCut[];
  verifiedPhotos: VerifiedActorPhotoFallback[];
}> {
  const cleanName = characterName.trim() || 'Will Sampson';
  onProgress?.(`Đang tìm & tải ${desiredCount} nguồn video thật không dính chữ của "${cleanName}"...`);

  let apiCuts: Array<{
    title: string;
    videoUrl: string;
    dataUrl: string;
    trimStartSec: number;
    trimEndSec: number;
    width: number;
    height: number;
    sourceLabel?: string;
  }> = [];
  let fallbackPhotos: VerifiedActorPhotoFallback[] = [];

  try {
    const res = await fetch('/api/archival/fetch-and-trim-videos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: cleanName,
        count: desiredCount,
        sceneDurations: targetScenes
          .filter((s) => s.sceneType === 'video' || s.sceneType === 'image')
          .slice(0, desiredCount)
          .map((s) => Math.max(6, Math.round(s.durationSec || 8))),
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.videoCuts)) {
        apiCuts = data.videoCuts;
      }
      if (Array.isArray(data?.verifiedPhotos)) {
        fallbackPhotos = data.verifiedPhotos;
      }
    }
  } catch {
    // Fallback below
  }

  const videoCuts: TrimmedActorVideoCut[] = [];
  // Skip 00:00–00:13 opening MPAA rating & studio title cards
  const defaultCutWindows = [
    { start: 14, end: 22 },
    { start: 28, end: 36 },
    { start: 44, end: 52 },
  ];

  for (let i = 0; i < apiCuts.length && videoCuts.length < desiredCount; i++) {
    const c = apiCuts[i];
    if (!c.videoUrl) continue;
    const win = defaultCutWindows[i % defaultCutWindows.length];
    const trimStart = typeof c.trimStartSec === 'number' ? c.trimStartSec : win.start;
    const trimEnd =
      typeof c.trimEndSec === 'number' && c.trimEndSec > trimStart + 2
        ? c.trimEndSec
        : trimStart + 8;

    videoCuts.push({
      id: `real-cut-${Date.now()}-${i}`,
      title: c.title || `${cleanName} — Đoạn Cắt #${i + 1}`,
      videoUrl: c.videoUrl.includes('#') ? c.videoUrl : `${c.videoUrl}#cut=${i + 1}`,
      thumbnailUrl: c.dataUrl,
      trimStartSec: trimStart,
      trimEndSec: trimEnd,
      durationSec: Math.max(6, trimEnd - trimStart),
      width: c.width || 720,
      height: c.height || 540,
      sourceLabel: c.sourceLabel || `✂️ Đã cắt ${trimStart}s → ${trimEnd}s`,
    });
  }

  const textOverlayRegex =
    /\b(poster|cover|magazine|newspaper|clipping|quote|autograph|signed|lobby|title|plaque|grave|banner|ad|advertisement)\b/i;

  const cleanPhotos = fallbackPhotos.filter(
    (p) => Boolean(p.dataUrl) && !textOverlayRegex.test(p.title || '')
  );

  return {
    videoCuts,
    verifiedPhotos: cleanPhotos,
  };
}
