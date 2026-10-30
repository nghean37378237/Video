/**
 * Utilities to ensure all Video & Image scenes have:
 * 1. Exact full-frame dimensions matching the project aspect ratio (3:4 -> 1080x1440, 9:16 -> 1080x1920, 16:9 -> 1920x1080)
 * 2. Prompts formatted with explicit full-bleed aspect ratio & resolution instructions
 * 3. 1-click export of a 100% full-bleed reference keyframe image to feed directly into Grok Video / Kling / Sora
 */

export type AspectRatioOption = '3:4' | '9:16' | '16:9';

export interface AspectRatioSpec {
  ratio: AspectRatioOption;
  width: number;
  height: number;
  cssAspect: string;
  arTag: string;
  labelVi: string;
  fullFrameSuffixEn: string;
  fullFrameVideoSuffixEn: string;
}

export function getAspectRatioSpec(ratio: AspectRatioOption = '3:4'): AspectRatioSpec {
  switch (ratio) {
    case '9:16':
      return {
        ratio: '9:16',
        width: 1080,
        height: 1920,
        cssAspect: '9 / 16',
        arTag: '--ar 9:16',
        labelVi: 'Dọc 9:16 Full Khung (1080×1920px)',
        fullFrameSuffixEn:
          'Full-frame vertical 9:16 aspect ratio (1080x1920px), edge-to-edge full-bleed composition filling 100% of the canvas, no black bars, no white borders, no vignette frame --ar 9:16',
        fullFrameVideoSuffixEn:
          'Full-screen vertical 9:16 video (1080x1920px), edge-to-edge full frame motion filling 100% of the screen, no black bars or letterbox --ar 9:16',
      };
    case '16:9':
      return {
        ratio: '16:9',
        width: 1920,
        height: 1080,
        cssAspect: '16 / 9',
        arTag: '--ar 16:9',
        labelVi: 'Ngang 16:9 Full Khung (1920×1080px)',
        fullFrameSuffixEn:
          'Full-frame widescreen 16:9 aspect ratio (1920x1080px), edge-to-edge full-bleed composition filling 100% of the canvas, no black bars, no borders --ar 16:9',
        fullFrameVideoSuffixEn:
          'Full-screen widescreen 16:9 video (1920x1080px), edge-to-edge full frame motion filling 100% of the screen, no black bars --ar 16:9',
      };
    case '3:4':
    default:
      return {
        ratio: '3:4',
        width: 1080,
        height: 1440,
        cssAspect: '3 / 4',
        arTag: '--ar 3:4',
        labelVi: 'Dọc 3:4 Full Khung Chuẩn Life Legends (1080×1440px)',
        fullFrameSuffixEn:
          'Full-frame vertical 3:4 aspect ratio (1080x1440px), edge-to-edge full-bleed composition filling 100% of the frame, no black bars, no white borders, no letterbox --ar 3:4',
        fullFrameVideoSuffixEn:
          'Full-screen vertical 3:4 video (1080x1440px), edge-to-edge full frame motion filling 100% of the screen, no black bars or borders --ar 3:4',
      };
  }
}

export function buildFullFrameImagePrompt(
  rawPrompt: string | undefined,
  ratio: AspectRatioOption = '3:4'
): string {
  const spec = getAspectRatioSpec(ratio);
  const cleaned = (rawPrompt || '')
    .trim()
    .replace(/--ar\s+\d+:\d+/gi, '')
    .replace(/\.\s*$/, '');
  if (!cleaned) {
    return `Vintage 1960s archival documentary photography, dramatic classic lighting. ${spec.fullFrameSuffixEn}`;
  }
  if (cleaned.toLowerCase().includes('edge-to-edge full-bleed')) {
    return `${cleaned} ${spec.arTag}`;
  }
  return `${cleaned}. ${spec.fullFrameSuffixEn}`;
}

export function buildFullFrameVideoPrompt(
  rawVideoPrompt: string | undefined,
  rawImagePrompt: string | undefined,
  ratio: AspectRatioOption = '3:4'
): string {
  const spec = getAspectRatioSpec(ratio);
  const base = (rawVideoPrompt || rawImagePrompt || '')
    .trim()
    .replace(/--ar\s+\d+:\d+/gi, '')
    .replace(/\.\s*$/, '');
  if (!base) {
    return `Natural cinematic documentary motion, subtle camera push-in, lifelike facial expression. ${spec.fullFrameVideoSuffixEn}`;
  }
  if (base.toLowerCase().includes('full-screen') && base.includes(spec.ratio)) {
    return `${base} ${spec.arTag}`;
  }
  return `${base}. ${spec.fullFrameVideoSuffixEn}`;
}

/**
 * Renders an image or video frame onto an offscreen canvas at the exact full-bleed
 * target dimensions (e.g., 1080x1440 for 3:4) using object-fit: cover and triggers a PNG download.
 */
export async function downloadFullFrameImageForGrok(
  mediaUrl: string,
  mediaKind: 'image' | 'video' | undefined,
  ratio: AspectRatioOption,
  filenameBase: string
): Promise<void> {
  const spec = getAspectRatioSpec(ratio);
  const canvas = document.createElement('canvas');
  canvas.width = spec.width;
  canvas.height = spec.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, spec.width, spec.height);

  if (mediaKind === 'video') {
    await new Promise<void>((resolve) => {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.playsInline = true;
      video.src = mediaUrl;

      const cleanup = () => {
        video.removeAttribute('src');
        video.load();
      };

      const timer = setTimeout(() => {
        cleanup();
        resolve();
      }, 4000);

      video.onloadeddata = () => {
        video.currentTime = Math.min(1, (video.duration || 2) * 0.2);
      };

      video.onseeked = () => {
        clearTimeout(timer);
        const vw = video.videoWidth || spec.width;
        const vh = video.videoHeight || spec.height;
        const scale = Math.max(spec.width / vw, spec.height / vh);
        const dw = vw * scale;
        const dh = vh * scale;
        const dx = (spec.width - dw) / 2;
        const dy = (spec.height - dh) / 2;
        ctx.drawImage(video, dx, dy, dw, dh);
        cleanup();
        resolve();
      };

      video.onerror = () => {
        clearTimeout(timer);
        cleanup();
        resolve();
      };
    });
  } else {
    await new Promise<void>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const iw = img.naturalWidth || spec.width;
        const ih = img.naturalHeight || spec.height;
        const scale = Math.max(spec.width / iw, spec.height / ih);
        const dw = iw * scale;
        const dh = ih * scale;
        const dx = (spec.width - dw) / 2;
        const dy = (spec.height - dh) / 2;
        ctx.drawImage(img, dx, dy, dw, dh);
        resolve();
      };
      img.onerror = () => resolve();
      img.src = mediaUrl;
    });
  }

  const dataUrl = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `${filenameBase}-FullFrame-${spec.ratio.replace(':', 'x')}-${spec.width}x${spec.height}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
