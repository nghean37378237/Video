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

export async function getMediaDuration(url: string, kind: 'video' | 'audio'): Promise<number> {
  return new Promise((resolve) => {
    const el = document.createElement(kind);
    el.src = url;
    el.onloadedmetadata = () => {
      const d = el.duration;
      el.removeAttribute('src');
      resolve(Number.isFinite(d) && d > 0 ? Math.round(d * 10) / 10 : 8);
    };
    el.onerror = () => resolve(8);
  });
}
