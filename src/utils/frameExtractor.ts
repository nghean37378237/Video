import { VaultItem } from '../types';

/**
 * Extracts still image frames at specified timestamps (seconds) from a video URL
 * so users can populate their Media Vault with photos from any uploaded video or
 * the reference video.
 */
export async function extractFramesFromVideo(
  videoUrl: string,
  timestampsSec: number[],
  baseName: string
): Promise<VaultItem[]> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.src = videoUrl;
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;

    const extracted: VaultItem[] = [];
    let currentIdx = 0;

    const cleanup = () => {
      video.removeAttribute('src');
      video.load();
    };

    video.onerror = () => {
      cleanup();
      resolve(extracted);
    };

    video.onloadedmetadata = () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 720;
      canvas.height = video.videoHeight || 960;
      const ctx = canvas.getContext('2d');

      const captureNext = () => {
        if (currentIdx >= timestampsSec.length || !ctx) {
          cleanup();
          resolve(extracted);
          return;
        }
        const targetTime = Math.min(
          timestampsSec[currentIdx],
          Math.max(0, (video.duration || 180) - 0.2)
        );
        video.currentTime = targetTime;
      };

      video.onseeked = () => {
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
          const sec = Math.round(timestampsSec[currentIdx]);
          extracted.push({
            id: `frame-${Date.now()}-${currentIdx}`,
            name: `${baseName} (${formatSecLabel(sec)})`,
            type: 'image',
            url: dataUrl,
            thumbnailUrl: dataUrl,
            width: canvas.width,
            height: canvas.height,
            sourceTag: 'extracted',
            createdAt: `Trích từ ${formatSecLabel(sec)}`,
          });
        }
        currentIdx++;
        captureNext();
      };

      captureNext();
    };
  });
}

export function formatSecLabel(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const VIDEO_EXTENSIONS = new Set([
  'mp4',
  'mov',
  'webm',
  'mkv',
  'm4v',
  'avi',
  '3gp',
  'ogv',
  'ts',
  'mpeg',
  'mpg',
]);

const IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'bmp',
  'avif',
  'heic',
  'heif',
  'svg',
  'jfif',
  'tiff',
]);

/**
 * Detects whether a File is a 'video' or 'image' using both MIME type and file extension fallback.
 * Handles files downloaded from Kling AI, ChatGPT, or mobile devices that may have empty/generic MIME types.
 */
export function detectMediaKindFromFile(file: File): 'video' | 'image' | null {
  const mime = (file.type || '').toLowerCase().trim();
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('image/')) return 'image';

  const extMatch = (file.name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  if (extMatch) {
    const ext = extMatch[1];
    if (VIDEO_EXTENSIONS.has(ext)) return 'video';
    if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  }
  return null;
}

/**
 * Cleans up a raw filename for clear display in UI badges (removes extension, trims extra spaces).
 */
export function cleanDisplayFileName(rawName: string): string {
  const withoutExt = (rawName || '')
    .normalize('NFC')
    .replace(/\.[^/.]+$/, '')
    .trim();
  return withoutExt || 'Tư liệu mới';
}

/**
 * Parses an explicit scene number (1..maxScenes) from a Vietnamese or English filename.
 * Supports: "cảnh 1", "canh_01", "canh-2", "đoạn 3", "doan 3", "scene 04", "01.mp4", "1 - ngựa.png", "2_kling.mp4".
 * Avoids false matches on years (1959, 2026) or random hashes in AI-generated filenames.
 */
export function extractSceneNumberFromFileName(
  rawName: string,
  maxScenes: number
): number | null {
  const cleaned = cleanDisplayFileName(rawName).toLowerCase();
  // Remove 4-digit years or timestamps so "1959" or "20261030" never triggers scene matching
  const withoutLongNumbers = cleaned.replace(/\b\d{3,}\b/g, ' ');

  // 1. Explicit keyword prefix: "cảnh 1", "canh_1", "canh-01", "đoạn 2", "doan 2", "scene 1", "sc1"
  const keywordMatch = withoutLongNumbers.match(
    /(?:^|[\s_.-])(?:cảnh|canh|đoạn|doan|scene|sc)[\s_.:#-]*0*(\d{1,2})(?=$|[\s_.-])/i
  );
  if (keywordMatch) {
    const num = Number(keywordMatch[1]);
    if (num >= 1 && num <= maxScenes) return num;
  }

  // 2. Leading scene number at the very start of the filename: "1", "01", "01_kling", "2 - anh", "3.ngựa"
  const leadingMatch = withoutLongNumbers.match(/^#?0*(\d{1,2})(?:$|[\s_.:-])/);
  if (leadingMatch) {
    const num = Number(leadingMatch[1]);
    if (num >= 1 && num <= maxScenes) return num;
  }

  return null;
}

/**
 * Captures a preview thumbnail (JPEG data URL) from a video URL so timeline cards always show a clear image.
 */
export async function extractVideoThumbnail(videoUrl: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (val?: string) => {
      if (settled) return;
      settled = true;
      resolve(val);
    };

    const timer = setTimeout(() => finish(undefined), 2200);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = videoUrl;

    const cleanup = () => {
      video.removeAttribute('src');
      video.load();
    };

    video.onerror = () => {
      clearTimeout(timer);
      cleanup();
      finish(undefined);
    };

    video.onloadeddata = () => {
      try {
        video.currentTime = Math.min(0.15, (video.duration || 1) * 0.1);
      } catch {
        clearTimeout(timer);
        cleanup();
        finish(undefined);
      }
    };

    video.onseeked = () => {
      clearTimeout(timer);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(320, video.videoWidth || 320);
        canvas.height = Math.min(240, video.videoHeight || 240);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          cleanup();
          finish(dataUrl);
          return;
        }
      } catch {
        // ignore canvas errors
      }
      cleanup();
      finish(undefined);
    };
  });
}

export async function getMediaDuration(url: string, kind: 'video' | 'audio'): Promise<number> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (val: number) => {
      if (settled) return;
      settled = true;
      resolve(val);
    };

    const timer = setTimeout(() => {
      finish(7.5);
    }, 2500);

    const el = document.createElement(kind);
    el.preload = 'metadata';
    el.src = url;
    el.onloadedmetadata = () => {
      clearTimeout(timer);
      const d = el.duration;
      el.removeAttribute('src');
      finish(Number.isFinite(d) && d > 0.5 ? Math.round(d * 10) / 10 : 7.5);
    };
    el.onerror = () => {
      clearTimeout(timer);
      finish(7.5);
    };
  });
}

