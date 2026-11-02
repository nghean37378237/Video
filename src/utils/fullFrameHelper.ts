/**
 * Utilities to ensure all Video & Image scenes have:
 * 1. Exact full-frame dimensions matching the project aspect ratio (3:4 -> 1080x1440, 9:16 -> 1080x1920, 16:9 -> 1920x1080)
 * 2. Prompts formatted specifically for KLING AI (Kling 1.6 / Kling 2.0 Master Image-to-Video & Text-to-Video)
 *    with Celebrity-Safe Visual Reference phrasing ("the subject in the reference frame...") so famous people
 *    are never blocked by celebrity name filters while preserving 100% exact facial identity from the real photo.
 * 3. 1-click export of a 100% full-bleed reference keyframe image to feed directly into Kling AI Image-to-Video.
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

export const KLING_NEGATIVE_PROMPT =
  'face morphing, loss of facial identity, changing face, distorted eyes, unnatural mouth movement, extra fingers, deformed limbs, blurry, low resolution, jittery camera, watermark, text overlay, black bars, letterbox, cropped head';

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
          'Full-frame vertical 9:16 aspect ratio (1080x1920px), full head-to-waist portrait with headroom, edge-to-edge full-bleed composition filling 100% of the canvas, no black bars, no cropped head, no borders --ar 9:16',
        fullFrameVideoSuffixEn:
          '[Kling AI I2V 9:16 - Preserve 100% exact facial identity and features from the reference image, high motion realism, 24fps, full-screen vertical 1080x1920px, no face morphing, no black bars]',
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
          '[Kling AI I2V 16:9 - Preserve 100% exact facial identity and features from the reference image, high motion realism, 24fps, full-screen widescreen 1920x1080px, no face morphing, no black bars]',
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
          'Full-frame vertical 3:4 aspect ratio (1080x1440px), medium portrait with full head and shoulders clearly visible in frame, edge-to-edge full-bleed composition filling 100% of the frame, no black bars, no cropped forehead, no letterbox --ar 3:4',
        fullFrameVideoSuffixEn:
          '[Kling AI I2V 3:4 - Preserve 100% exact facial identity and features from the reference image, high motion realism, 24fps, full-screen vertical 1080x1440px, no face morphing, no black bars]',
      };
  }
}

export function buildFullFrameImagePrompt(
  rawPrompt: string | undefined,
  ratio: AspectRatioOption = '3:4',
  fallbackTitle?: string
): string {
  const spec = getAspectRatioSpec(ratio);
  const cleaned = (rawPrompt || '')
    .trim()
    .replace(/--ar\s+\d+:\d+/gi, '')
    .replace(/\.\s*$/, '');
  if (!cleaned) {
    const subject = fallbackTitle ? `${fallbackTitle}, ` : '';
    return `${subject}Vintage 1960s archival documentary photography, dramatic classic lighting. ${spec.fullFrameSuffixEn}`;
  }
  if (cleaned.toLowerCase().includes('edge-to-edge full-bleed')) {
    return `${cleaned} ${spec.arTag}`;
  }
  return `${cleaned}. ${spec.fullFrameSuffixEn}`;
}

export type VideoScriptStyle = 'narrative-hook' | 'cinematic-action' | 'emotional-closeup';

/**
 * Converts a scene visual description into a Celebrity-Safe visual descriptor for Kling AI Image-to-Video.
 * Instead of relying on raw celebrity names that can trigger AI video filters, it anchors Kling AI
 * to "the subject in the reference frame" while keeping costume, setting, and lighting details intact.
 */
export function sanitizeCelebritySafeSubjectForKling(rawDesc: string): string {
  const cleaned = (rawDesc || '')
    .replace(/Full-frame.*$/i, '')
    .replace(/\[Kling AI.*$/i, '')
    .replace(/--ar\s+\d+:\d+/gi, '')
    .replace(/^CẦN VIDEO:\s*/i, '')
    .replace(/^CẦN ẢNH TĨNH:\s*/i, '')
    .replace(/\.\s*$/, '')
    .trim();

  if (!cleaned) {
    return 'the main subject in the reference frame';
  }
  return `the subject in the reference frame (${cleaned})`;
}

/**
 * Generates a rich, 3-beat scripted video motion prompt ([0-2s] -> [2-4s] -> [4-6s])
 * specifically engineered for KLING AI (Kling 1.6 / Kling 2.0 Master Image-to-Video).
 * Uses celebrity-safe subject anchoring ("the subject in the reference frame") + explicit facial identity lock
 * so famous people are animated smoothly from their photo without filter blocks or face distortion.
 */
export function generateScriptedVideoMotionPrompt(options: {
  title?: string;
  narrationText?: string;
  imagePrompt?: string;
  visualPrompt?: string;
  style?: VideoScriptStyle;
  ratio?: AspectRatioOption;
}): string {
  const {
    title = '',
    narrationText = '',
    imagePrompt = '',
    visualPrompt = '',
    style = 'narrative-hook',
    ratio = '3:4',
  } = options;

  const spec = getAspectRatioSpec(ratio);
  const subjectAnchor = sanitizeCelebritySafeSubjectForKling(
    imagePrompt || visualPrompt || title || 'vintage documentary protagonist'
  );

  const snippet = narrationText
    ? narrationText.split(/[.!?]/)[0]?.trim().slice(0, 80)
    : '';

  if (style === 'cinematic-action') {
    return (
      `[Kling AI I2V - Lock Reference Face Identity] ` +
      `[0-2s Opening Action]: Starting from the uploaded reference keyframe of ${subjectAnchor}, the main character initiates a natural, purposeful physical movement with realistic body weight as atmospheric dust and sunlight shift across the scene -> ` +
      `[2-4s Story Turning Beat]: The character interacts authentically with the environment, turning their head with calm determination while maintaining 100% identical facial features${
        snippet ? ` evoking the mood of "${snippet}"` : ''
      } -> ` +
      `[4-6s Camera Control & Climax]: Smooth Kling camera tracking push-in to a heroic medium close-up, subtle wind movement in hair and vintage attire, authentic 1960s film grain. ${spec.fullFrameVideoSuffixEn}`
    );
  }

  if (style === 'emotional-closeup') {
    return (
      `[Kling AI I2V - Lock Reference Face Identity] ` +
      `[0-2s Quiet Reflection]: Starting from the reference photo of ${subjectAnchor}, the character holds a thoughtful, dignified pose with natural chest breathing, subtle eye blink, and lifelike micro-expressions -> ` +
      `[2-4s Emotional Shift]: The subject slowly turns their gaze toward the camera lens with a warm, nostalgic expression while keeping exact facial likeness${
        snippet ? ` conveying the emotion of "${snippet}"` : ''
      } -> ` +
      `[4-6s Camera Control & Climax]: Slow cinematic Kling dolly zoom-in on the eyes and face as warm golden rim light flares softly in the background. ${spec.fullFrameVideoSuffixEn}`
    );
  }

  // Default: 'narrative-hook' (3-beat storytelling + expressive talking/acting for Kling I2V)
  return (
    `[Kling AI I2V - Lock Reference Face Identity] ` +
    `[0-2s Scene Setup]: Starting from the reference frame of ${subjectAnchor}, the subject subtly shifts posture, blinks naturally, and makes direct, soulful eye contact with the camera -> ` +
    `[2-4s Expressive Acting & Speech]: Keeping 100% exact facial identity from the reference photo, the character speaks calmly and expressively with natural lip movement and a subtle, dignified hand or head gesture${
      snippet ? ` matching the line "${snippet}"` : ''
    } -> ` +
    `[4-6s Camera Control & Atmosphere]: Steady cinematic Kling dolly push-in to a warm medium portrait as gentle breeze and vintage film lighting bring the archival moment to life. ${spec.fullFrameVideoSuffixEn}`
  );
}

export function buildFullFrameVideoPrompt(
  rawVideoPrompt: string | undefined,
  rawImagePromptOrRatio?: string | AspectRatioOption,
  maybeRatioOrTitle?: AspectRatioOption | string,
  narrationHint?: string
): string {
  let ratio: AspectRatioOption = '3:4';
  let fallbackPrompt = '';
  let titleHint = '';

  if (
    rawImagePromptOrRatio === '3:4' ||
    rawImagePromptOrRatio === '9:16' ||
    rawImagePromptOrRatio === '16:9'
  ) {
    ratio = rawImagePromptOrRatio;
  } else if (typeof rawImagePromptOrRatio === 'string') {
    fallbackPrompt = rawImagePromptOrRatio;
  }

  if (
    maybeRatioOrTitle === '3:4' ||
    maybeRatioOrTitle === '9:16' ||
    maybeRatioOrTitle === '16:9'
  ) {
    ratio = maybeRatioOrTitle;
  } else if (typeof maybeRatioOrTitle === 'string') {
    titleHint = maybeRatioOrTitle;
  }

  const spec = getAspectRatioSpec(ratio);
  const base = (rawVideoPrompt || '')
    .trim()
    .replace(/--ar\s+\d+:\d+/gi, '')
    .replace(/\.\s*$/, '');

  // If no custom video prompt or it's a very short generic phrase, auto-upgrade to a 3-beat Kling I2V prompt
  if (!base || base.length < 45) {
    return generateScriptedVideoMotionPrompt({
      title: titleHint,
      narrationText: narrationHint,
      imagePrompt: fallbackPrompt || base,
      style: 'narrative-hook',
      ratio,
    });
  }

  // If the prompt doesn't have scripted timeline beats yet, wrap it into a clear 3-beat Kling I2V directorial sequence
  const hasBeats = /\[0-2s|\[2-4s|Beat 1|->/i.test(base);
  const klingPrefix = /Kling AI/i.test(base)
    ? ''
    : '[Kling AI I2V - Lock Reference Face Identity] ';
  const scriptedCore = hasBeats
    ? `${klingPrefix}${base}`
    : `${klingPrefix}[0-2s Opening Beat]: Starting from the uploaded reference image, preserve 100% exact facial identity with natural breathing and subtle environmental motion -> [2-4s Main Story Action]: ${base} -> [4-6s Camera Control & Climax]: Smooth cinematic Kling dolly push-in holding on an expressive close-up`;

  if (scriptedCore.toLowerCase().includes('kling ai i2v') && scriptedCore.includes(spec.ratio)) {
    return scriptedCore;
  }
  return `${scriptedCore}. ${spec.fullFrameVideoSuffixEn}`;
}

/**
 * Smart full-frame drawing helper that ensures:
 * - Zero black bars (100% edge-to-edge canvas coverage)
 * - Never cuts off a person's head/eyes on portrait or square photos (top-weighted vertical alignment)
 */
export function drawFullBleedSmartPortrait(
  ctx: CanvasRenderingContext2D,
  source: HTMLImageElement | HTMLVideoElement,
  sourceW: number,
  sourceH: number,
  targetW: number,
  targetH: number
) {
  const scaleCover = Math.max(targetW / sourceW, targetH / sourceH);
  const dw = sourceW * scaleCover;
  const dh = sourceH * scaleCover;
  const dx = (targetW - dw) / 2;
  // Use top-weighted alignment (0.16) when vertical overflow happens so heads/eyes are never cropped off
  const dy = dh > targetH ? (targetH - dh) * 0.16 : (targetH - dh) / 2;
  ctx.drawImage(source, dx, dy, dw, dh);
}

/**
 * Renders an image or video frame onto an offscreen canvas at the exact full-bleed
 * target dimensions (e.g., 1080x1440 for 3:4) and triggers a PNG download for Kling AI Image-to-Video.
 */
export async function downloadFullFrameImageForGrok(
  mediaUrl: string,
  mediaKind: 'image' | 'video' | 'audio' | undefined,
  ratio: AspectRatioOption,
  filenameBase: string
): Promise<void> {
  const spec = getAspectRatioSpec(ratio);
  const canvas = document.createElement('canvas');
  canvas.width = spec.width;
  canvas.height = spec.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = '#07090E';
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
        drawFullBleedSmartPortrait(ctx, video, vw, vh, spec.width, spec.height);
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
        drawFullBleedSmartPortrait(ctx, img, iw, ih, spec.width, spec.height);
        resolve();
      };
      img.onerror = () => resolve();
      img.src = mediaUrl;
    });
  }

  const dataUrl = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = dataUrl;
  const cleanName = filenameBase.replace(/-Grok$/i, '-KlingAI');
  a.download = `${cleanName}-FullFrame-${spec.ratio.replace(':', 'x')}-${spec.width}x${spec.height}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export const downloadFullFrameImageForKling = downloadFullFrameImageForGrok;

export function getChronologicalStageInfo(order: number, totalScenes: number): {
  stageVi: string;
  stageEn: string;
  cameraTransitionEn: string;
} {
  const narrativeTotal = Math.max(1, totalScenes - 1);
  const progress = Math.min(1, Math.max(0, (order - 1) / Math.max(1, narrativeTotal - 1)));

  if (order === 1) {
    return {
      stageVi: 'Mở Đầu Ấn Tượng (Hook)',
      stageEn: 'Iconic Opening Hook — commanding presence and signature gaze',
      cameraTransitionEn: 'Smooth opening dolly push-in from medium portrait to expressive close-up',
    };
  }
  if (progress < 0.28) {
    return {
      stageVi: 'Thời Trẻ & Những Bước Chân Đầu Tiên',
      stageEn: 'Early Years & Humble Beginnings — youthful determination and vintage period atmosphere',
      cameraTransitionEn: 'Gentle left-to-right cinematic tracking shot bridging seamlessly from the opening scene',
    };
  }
  if (progress < 0.55) {
    return {
      stageVi: 'Bước Ngoặt Sự Nghiệp & Khẳng Định Tên Tuổi',
      stageEn: 'Breakthrough Era — rising star power, classic studio lighting, and decisive action',
      cameraTransitionEn: 'Steady eye-level Kling camera push-in matching the rising narrative momentum',
    };
  }
  if (progress < 0.8) {
    return {
      stageVi: 'Đỉnh Cao Huyền Thoại & Thử Thách Nội Tâm',
      stageEn: 'Peak Iconic Era & Deeper Character — weathered gravitas, dramatic chiaroscuro lighting',
      cameraTransitionEn: 'Slow emotional arc pan around the subject with warm golden-hour rim light',
    };
  }
  return {
    stageVi: 'Di Sản Bất Hủ & Kết Thúc Cảm Xúc',
    stageEn: 'Enduring Legacy & Reflective Finale — timeless dignity, warm nostalgic glow',
    cameraTransitionEn: 'Slow dignified pull-back and lingering hold before fading into the closing crest',
  };
}

/**
 * Builds a complete, ready-to-copy Standard Kling AI Prompt Pack for any scene
 * (especially scenes where no verified real photo of the character could be found online),
 * ordered smoothly along the chronological narrative arc (#01 -> #N).
 */
export function buildStandardKlingDrawPrompt(options: {
  order: number;
  totalScenes: number;
  characterName: string;
  title: string;
  narrationText: string;
  rawImagePrompt?: string;
  rawVideoPrompt?: string;
  sceneType: 'video' | 'image' | 'quote' | 'outro';
  ratio?: AspectRatioOption;
}): {
  stageVi: string;
  klingImagePrompt: string;
  klingVideoPrompt: string;
  combinedBlock: string;
} {
  const {
    order,
    totalScenes,
    characterName,
    title,
    narrationText,
    rawImagePrompt,
    rawVideoPrompt,
    sceneType,
    ratio = '3:4',
  } = options;

  const spec = getAspectRatioSpec(ratio);
  const stage = getChronologicalStageInfo(order, totalScenes);
  const cleanChar = (characterName || '').trim() || 'the legendary protagonist';

  const baseImgDesc = (rawImagePrompt || title || narrationText || '')
    .replace(/Full-frame.*$/i, '')
    .replace(/--ar\s+\d+:\d+/gi, '')
    .replace(/\.\s*$/, '')
    .trim();

  const hasCharNameInImg =
    cleanChar.length > 2 && baseImgDesc.toLowerCase().includes(cleanChar.toLowerCase());

  const enrichedImageCore = `${
    hasCharNameInImg ? '' : `Authentic historical documentary portrait of ${cleanChar}, `
  }${baseImgDesc}. Narrative stage: ${
    stage.stageEn
  }. Photorealistic 35mm Kodak Tri-X & Kodachrome archival cinematography, natural skin texture, expressive eyes, dramatic classic Hollywood lighting`;

  const klingImagePrompt = buildFullFrameImagePrompt(enrichedImageCore, ratio, title);

  const baseVidPrompt = buildFullFrameVideoPrompt(
    rawVideoPrompt,
    klingImagePrompt,
    ratio,
    narrationText
  );

  const klingVideoPrompt = baseVidPrompt.includes(stage.cameraTransitionEn)
    ? baseVidPrompt
    : `${baseVidPrompt.replace(/\.\s*\[Kling AI I2V/i, `. Smooth transition continuity: ${stage.cameraTransitionEn}. [Kling AI I2V`)}`;

  const roleLabel =
    sceneType === 'video'
      ? `ĐOẠN VIDEO KLING AI (Tạo Ảnh Gốc -> Chuyển Động I2V)`
      : `ĐOẠN ẢNH TĨNH KLING AI (Vẽ Ảnh Chuẩn Nhân Vật Full Khung ${spec.ratio})`;

  const combinedBlock =
    `=== CẢNH #${String(order).padStart(2, '0')}/${String(totalScenes).padStart(2, '0')} [${stage.stageVi}] — ${title} (${roleLabel}) ===\n` +
    `• Lời bình khớp cảnh: "${narrationText}"\n` +
    `• [BƯỚC 1 - PROMPT VẼ ẢNH CHUẨN KLING AI / CHATGPT PRO (${spec.ratio} - ${spec.width}x${spec.height}px)]:\n${klingImagePrompt}\n` +
    (sceneType === 'video'
      ? `• [BƯỚC 2 - PROMPT CHUYỂN ĐỘNG KLING AI IMAGE-TO-VIDEO 3 NHỊP MƯỢT MÀ]:\n${klingVideoPrompt}\n` +
        `• [NEGATIVE PROMPT KLING AI]:\n${KLING_NEGATIVE_PROMPT}`
      : `• [GỢI Ý NẾU MUỐN LÀM VIDEO KLING AI CHO CẢNH NÀY]:\n${klingVideoPrompt}`);

  return {
    stageVi: stage.stageVi,
    klingImagePrompt,
    klingVideoPrompt,
    combinedBlock,
  };
}

export interface RealFootageSceneGuide {
  filmTitleVi: string;
  clipInstructionVi: string;
  searchQueryEn: string;
  youtubeSearchUrl: string;
  youtubeMovieClipsUrl: string;
  internetArchiveUrl: string;
  wikimediaVideoUrl: string;
  pexelsBrollUrl: string;
}

/**
 * Suggests the exact movie, TV episode, interview, or archival documentary source
 * where the user can find and clip REAL footage of the character for a given scene.
 */
export function getRealFootageGuideForScene(options: {
  sceneId?: string;
  order: number;
  title: string;
  narrationText: string;
  archivalKeywords?: string;
  durationSec: number;
  characterName?: string;
}): RealFootageSceneGuide {
  const {
    sceneId = '',
    order,
    title = '',
    narrationText = '',
    archivalKeywords = '',
    durationSec = 8,
    characterName = '',
  } = options;

  const durInt = Math.max(5, Math.round(durationSec || 8));
  const combinedText = `${title} ${narrationText} ${archivalKeywords}`.toLowerCase();
  const cleanChar =
    (characterName || '')
      .replace(/[—–-].*$/, '')
      .replace(/\(.*?\)/g, '')
      .trim() || 'Will Sampson';

  let filmTitleVi = '';
  let clipInstructionVi = '';
  let searchQueryEn = '';
  let brollQueryEn = '1970s western landscape sunset';

  // 1. Exact scene-by-scene real movie guide for Will Sampson preset & scenes
  if (sceneId.startsWith('ws-') || /will sampson|bromden|ten bears|cuckoo/i.test(combinedText)) {
    if (sceneId === 'ws-1' || order === 1) {
      filmTitleVi = 'Phim "One Flew Over the Cuckoo’s Nest" (Bay Trên Tổ Chim Cúc Cu - 1975)';
      clipInstructionVi = `Cắt ${durInt}s cảnh cận mặt Chief Bromden (Will Sampson) đứng trầm tĩnh, ánh mắt sâu thẳm quan sát trong phòng bệnh viện (đầu phim hoặc cảnh họp nhóm).`;
      searchQueryEn = 'Will Sampson Chief Bromden One Flew Over the Cuckoos Nest 1975 closeup scene HD';
    } else if (sceneId === 'ws-2' || /heritage|gentle giant|cowboy hat/i.test(combinedText)) {
      filmTitleVi = 'Phim "Fish Hawk" (1979) hoặc Phỏng vấn hậu trường Will Sampson (1976–1980)';
      clipInstructionVi = `Cắt ${durInt}s cảnh Will Sampson ngoài đời đội mũ cao bồi mỉm cười hiền hậu hoặc cảnh mở đầu ấm áp trong phim "Fish Hawk" (1979).`;
      searchQueryEn = 'Will Sampson Fish Hawk 1979 interview Native American actor';
    } else if (sceneId === 'ws-4' || /grew up tall|six and a half feet|oklahoma/i.test(combinedText)) {
      filmTitleVi = 'Tư liệu "1950s Oklahoma Ranch & Muscogee Creek Archival" / Phim "Fish Hawk" (1979)';
      clipInstructionVi = `Cắt ${durInt}s cảnh toàn thân (low-angle) tôn chiều cao 1m98 của Will Sampson đứng bên hàng rào gỗ trang trại.`;
      searchQueryEn = 'Will Sampson tall cowboy ranch scene Fish Hawk 1979';
    } else if (sceneId === 'ws-5' || /rodeo|bucking bronco/i.test(combinedText)) {
      filmTitleVi = 'Tư liệu thật "1960s-1970s American West Rodeo Bronc Riding Archival Footage"';
      clipInstructionVi = `Cắt ${durInt}s cảnh đấu trường Rodeo miền Tây nước Mỹ thập niên 1960–1970: cao bồi cưỡi ngựa bất kham (bucking bronco) tung bụi mù mịt.`;
      searchQueryEn = '1960s 1970s vintage rodeo saddle bronc riding archival footage';
      brollQueryEn = 'rodeo cowboy horse dust arena';
    } else if (sceneId === 'ws-6' || /paintbrush|painted|artist/i.test(combinedText)) {
      filmTitleVi = 'Tư liệu "Will Sampson Muscogee Creek Painter / Gilcrease Museum Documentary"';
      clipInstructionVi = `Cắt ${durInt}s cảnh nghệ sĩ bản địa cầm cọ vẽ tranh sơn dầu hoặc cận cảnh các bức tranh lịch sử bộ tộc Creek của Will Sampson.`;
      searchQueryEn = 'Will Sampson Native American artist paintings documentary';
      brollQueryEn = 'artist painting canvas brush vintage';
    } else if (sceneId === 'ws-7' || /search for a very special|says nothing/i.test(combinedText)) {
      filmTitleVi = 'Phim "One Flew Over the Cuckoo’s Nest" (1975) — Cảnh Chief Bromden cầm chổi quét hành lang';
      clipInstructionVi = `Cắt ${durInt}s cảnh Chief Bromden (Will Sampson) cao lớn lặng lẽ cầm chổi quét sàn bệnh viện, giả câm điếc nhưng lặng lẽ lắng nghe mọi chuyện.`;
      searchQueryEn = 'One Flew Over the Cuckoos Nest Chief Bromden sweeping broom scene';
    } else if (sceneId === 'ws-9' || /jack nicholson|1975/i.test(combinedText)) {
      filmTitleVi = 'Phim "One Flew Over the Cuckoo’s Nest" (1975) — Cảnh কẹo cao su Juicy Fruit cùng Jack Nicholson';
      clipInstructionVi = `Cắt ${durInt}s cảnh kinh điển McMurphy (Jack Nicholson) mời Chief Bromden (Will Sampson) thanh kẹo cao su Juicy Fruit và Bromden lần đầu cất tiếng nói: "Thank you" (hoặc cảnh hai người đánh bóng rổ).`;
      searchQueryEn = 'One Flew Over the Cuckoos Nest Juicy Fruit scene Jack Nicholson Will Sampson';
    } else if (sceneId === 'ws-10' || /academy awards|five oscars/i.test(combinedText)) {
      filmTitleVi = 'Lễ trao giải "48th Academy Awards (Oscars 1976)" — One Flew Over the Cuckoo’s Nest thắng 5 giải';
      clipInstructionVi = `Cắt ${durInt}s cảnh đoàn làm phim "One Flew Over the Cuckoo’s Nest" bước lên sân khấu nhận tượng vàng Oscar năm 1976.`;
      searchQueryEn = 'One Flew Over the Cuckoos Nest Oscars 1976 Best Picture Academy Awards';
    } else if (sceneId === 'ws-11' || /final scene|escape|cheering/i.test(combinedText)) {
      filmTitleVi = 'Phim "One Flew Over the Cuckoo’s Nest" (1975) — Cảnh Kết Huyền Thoại (Chief Bromden Escape Ending)';
      clipInstructionVi = `Cắt ${durInt}s phân cảnh cuối phim: Chief Bromden dùng sức mạnh phi thường nhấc bổng bệ đá cẩm thạch, đập vỡ chấn sắt cửa sổ và chạy băng ra cánh đồng sương sớm tự do.`;
      searchQueryEn = 'One Flew Over the Cuckoos Nest ending scene Chief Bromden escape HD';
    } else if (sceneId === 'ws-12' || /ten bears|josey wales|clint eastwood/i.test(combinedText)) {
      filmTitleVi = 'Phim Viễn Tây "The Outlaw Josey Wales" (1976) — Cảnh Tù trưởng Ten Bears & Clint Eastwood';
      clipInstructionVi = `Cắt ${durInt}s cảnh kinh điển Tù trưởng Comanche Ten Bears (Will Sampson) đối diện Josey Wales (Clint Eastwood) dưới nắng sa mạc và nói lời hòa bình ("It shall be life...").`;
      searchQueryEn = 'The Outlaw Josey Wales 1976 Chief Ten Bears Clint Eastwood Will Sampson scene';
    } else if (sceneId === 'ws-13' || /1983|registry|performing arts|poltergeist/i.test(combinedText)) {
      filmTitleVi = 'Phim "Poltergeist II: The Other Side" (1986 - vai Taylor) hoặc "Vegas" (1978–1981)';
      clipInstructionVi = `Cắt ${durInt}s cảnh Will Sampson thập niên 1980 (vai pháp sư bản địa Taylor đầy uy nghi trong "Poltergeist II" 1986 hoặc phỏng vấn năm 1983).`;
      searchQueryEn = 'Will Sampson Poltergeist II 1986 Taylor scene HD';
    } else {
      filmTitleVi = 'Tổng hợp Tribute "One Flew Over the Cuckoo’s Nest" (1975) & "The Outlaw Josey Wales" (1976)';
      clipInstructionVi = `Cắt ${durInt}s cảnh cận mặt Will Sampson mỉm cười ấm áp và gật đầu chào tạm biệt (cuối cảnh Juicy Fruit hoặc cuối cảnh Ten Bears).`;
      searchQueryEn = 'Will Sampson tribute Chief Bromden Ten Bears scene';
    }
  } else if (sceneId.startsWith('lg-') || /lorne greene|bonanza|buck/i.test(combinedText)) {
    if (order === 1) {
      filmTitleVi = 'Phim truyền hình "Bonanza" (NBC, 1959–1973) — Cảnh Ben Cartwright cưỡi ngựa Buck';
      clipInstructionVi = `Cắt ${durInt}s cảnh Lorne Greene (vai Ben Cartwright) cưỡi chú ngựa lông vàng Buck bên hồ Tahoe trong phần mở đầu Bonanza.`;
      searchQueryEn = 'Lorne Greene Ben Cartwright riding Buck horse Bonanza scene';
    } else {
      filmTitleVi = 'Phần Mở Đầu Kinh Điển "Bonanza Opening Credits" (1959)';
      clipInstructionVi = `Cắt ${durInt}s cảnh tấm bản đồ Ponderosa bốc cháy và 4 cha con nhà Cartwright (Lorne Greene, Pernell Roberts, Dan Blocker, Michael Landon) phi ngựa tới trước hiên nhà.`;
      searchQueryEn = 'Bonanza 1959 opening intro theme Cartwright family riding';
    }
  } else {
    // Generic smart detector for any historical actor/character (e.g. Clint Eastwood, Yul Brynner, Clayton Moore, John Wayne)
    const quotedFilmMatch = narrationText.match(
      /\b(One Flew Over the Cuckoo's Nest|The Outlaw Josey Wales|Bonanza|The Magnificent Seven|The King and I|Westworld|The Lone Ranger|The Good, the Bad and the Ugly|Unforgiven|Rawhide)\b/i
    );
    const detectedFilm = quotedFilmMatch ? quotedFilmMatch[1] : '';
    filmTitleVi = detectedFilm
      ? `Phim "${detectedFilm}" — Trích đoạn thật của ${cleanChar}`
      : `Trích đoạn phim kinh điển / Phỏng vấn tư liệu của ${cleanChar} (${title})`;
    clipInstructionVi = `Tìm trên YouTube hoặc Internet Archive theo từ khóa bên dưới, tải và cắt lấy ${durInt}s đoạn nhân vật ${cleanChar} xuất hiện rõ mặt nhất (không dính chữ phụ đề). Bạn có thể thả cả video dài vào cảnh này rồi chỉnh ô "Cắt từ giây" bên dưới!`;
    searchQueryEn = detectedFilm
      ? `${cleanChar} ${detectedFilm} movie scene HD`
      : `${archivalKeywords || `${cleanChar} classic movie scene interview`} footage`;
  }

  return {
    filmTitleVi,
    clipInstructionVi,
    searchQueryEn,
    youtubeSearchUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQueryEn)}`,
    youtubeMovieClipsUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${cleanChar} movieclips scene HD`)}`,
    internetArchiveUrl: `https://archive.org/search?query=${encodeURIComponent(cleanChar)}&and[]=mediatype%3A%22movies%22`,
    wikimediaVideoUrl: `https://commons.wikimedia.org/w/index.php?search=${encodeURIComponent(`filetype:video ${cleanChar}`)}`,
    pexelsBrollUrl: `https://www.pexels.com/search/videos/${encodeURIComponent(brollQueryEn)}/`,
  };
}


