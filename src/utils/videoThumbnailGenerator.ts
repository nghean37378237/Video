import { ProjectSettings, StoryScene, VaultItem } from '../types';

export type ThumbnailTemplateStyle =
  | 'cinema-gold'
  | 'viral-red-bar'
  | 'vintage-sepia-prestige'
  | 'clean-portrait';

export type ThumbnailAspectRatio = '3:4' | '16:9' | '9:16' | '1:1';

export interface ThumbnailConfig {
  template: ThumbnailTemplateStyle;
  ratio: ThumbnailAspectRatio;
  topBadgeText: string;
  characterTitle: string;
  hookHeadline: string;
  subHookText: string;
  showTextOverlay: boolean;
  showChannelBadge: boolean;
  autoHdrEnhance: boolean;
  backgroundImageUrl: string;
}

export interface ThumbnailHookPreset {
  id: string;
  label: string;
  topBadge: string;
  characterTitle: string;
  hookHeadline: string;
  subHookText: string;
}

export function getThumbnailDimensions(ratio: ThumbnailAspectRatio): {
  width: number;
  height: number;
  label: string;
} {
  switch (ratio) {
    case '16:9':
      return { width: 1920, height: 1080, label: '16:9 Ngang (YouTube / FB Video)' };
    case '9:16':
      return { width: 1080, height: 1920, label: '9:16 Dọc (Reels / TikTok / Shorts)' };
    case '1:1':
      return { width: 1080, height: 1080, label: '1:1 Vuông (Bài Đăng Page)' };
    case '3:4':
    default:
      return { width: 1080, height: 1440, label: '3:4 Chuẩn Page / Reels (1080×1440)' };
  }
}

export function extractCharacterMetaForThumbnail(
  scenes: StoryScene[],
  settings: ProjectSettings
): {
  characterName: string;
  lifespan: string;
} {
  const rawTitle = (settings.projectTitle || 'Will Sampson').split('—')[0].split('-')[0].trim();
  const characterName = rawTitle || 'Will Sampson';

  const allText = scenes.map((s) => `${s.title} ${s.narrationText}`).join(' ');
  const years = Array.from(allText.matchAll(/\b(18\d{2}|19\d{2}|20\d{2})\b/g)).map((m) =>
    parseInt(m[1], 10)
  );
  const validYears = years.filter((y) => y >= 1850 && y <= 2026);

  const lower = characterName.toLowerCase();
  if (lower.includes('will sampson')) {
    return { characterName: 'WILL SAMPSON', lifespan: '1933 – 1987' };
  }
  if (lower.includes('lorne greene')) {
    return { characterName: 'LORNE GREENE', lifespan: '1915 – 1987' };
  }
  if (lower.includes('clayton moore')) {
    return { characterName: 'CLAYTON MOORE', lifespan: '1914 – 1999' };
  }
  if (lower.includes('yul brynner')) {
    return { characterName: 'YUL BRYNNER', lifespan: '1920 – 1985' };
  }

  if (validYears.length >= 2) {
    const minY = Math.min(...validYears);
    const maxY = Math.max(...validYears);
    if (maxY - minY >= 20) {
      return { characterName: characterName.toUpperCase(), lifespan: `${minY} – ${maxY}` };
    }
  }

  return { characterName: characterName.toUpperCase(), lifespan: 'HOLLYWOOD LEGEND' };
}

export function getThumbnailHookPresets(
  scenes: StoryScene[],
  settings: ProjectSettings,
  lang: 'vi' | 'en'
): ThumbnailHookPreset[] {
  const { characterName, lifespan } = extractCharacterMetaForThumbnail(scenes, settings);
  const lower = characterName.toLowerCase();

  if (lang === 'en') {
    if (lower.includes('will sampson')) {
      return [
        {
          id: 'en-1',
          label: '🔥 Bản Hùng Ca Điện Ảnh',
          topBadge: '★ UNTOLD HOLLYWOOD LEGEND ★',
          characterTitle: `${characterName} (${lifespan})`,
          hookHeadline: 'NO ACTING LESSONS. ONE IMMORTAL ROLE.',
          subHookText: 'From Oklahoma Rodeo Cowboy to Oscar History',
        },
        {
          id: 'en-2',
          label: '⚡ Giật Tít Xúc Động',
          topBadge: 'THE TRUE STORY BEHIND THE GIANT',
          characterTitle: `${characterName} (${lifespan})`,
          hookHeadline: 'THE GENTLE GIANT WHO CHANGED HOLLYWOOD',
          subHookText: 'Gone at 53 — Never Forgotten',
        },
        {
          id: 'en-3',
          label: '🏆 Di Sản Bất Tử',
          topBadge: 'NATIVE AMERICAN HERITAGE TRIBUTE',
          characterTitle: `${characterName}`,
          hookHeadline: 'SOMETIMES ONE SINGLE ROLE CHANGES HISTORY',
          subHookText: `${lifespan} · Chief Bromden · Crazy Horse · Ten Bears`,
        },
      ];
    }

    return [
      {
        id: 'en-generic-1',
        label: '🔥 Bản Hùng Ca Điện Ảnh',
        topBadge: '★ UNTOLD HOLLYWOOD LEGEND ★',
        characterTitle: `${characterName} (${lifespan})`,
        hookHeadline: 'THE ICON WHO CONQUERED THE SILVER SCREEN',
        subHookText: 'Triumph, Heartbreak & An Immortal Legacy',
      },
      {
        id: 'en-generic-2',
        label: '⚡ Giật Tít Xúc Động',
        topBadge: 'BEHIND THE SPOTLIGHT',
        characterTitle: `${characterName}`,
        hookHeadline: 'WHAT THE WORLD NEVER KNEW ABOUT HIS FINAL YEARS',
        subHookText: `${lifespan} · A True Cinema Titan`,
      },
      {
        id: 'en-generic-3',
        label: '🏆 Di Sản Bất Tử',
        topBadge: 'GOLDEN AGE BIOGRAPHY',
        characterTitle: `${characterName} (${lifespan})`,
        hookHeadline: 'ONE PRESENCE. ONE VOICE. TIMELESS GREATNESS.',
        subHookText: 'Life Legends Documentary Tribute',
      },
    ];
  }

  // Vietnamese Presets
  if (lower.includes('will sampson')) {
    return [
      {
        id: 'vi-1',
        label: '🔥 Hùng Ca Điện Ảnh (Chuẩn Page)',
        topBadge: '★ HUYỀN THOẠI MÀN BẠC CHƯA KỂ ★',
        characterTitle: `${characterName} (${lifespan})`,
        hookHeadline: 'KHÔNG QUA TRƯỜNG LỚP — MỘT VAI DIỄN ĐỂ ĐỜI',
        subHookText: 'Từ Chàng Cao Bồi Rodeo Đến Biểu Tượng Bất Tử Của Hollywood',
      },
      {
        id: 'vi-2',
        label: '⚡ Giật Tít Cảm Xúc (Tăng Click)',
        topBadge: 'SỰ THẬT ĐẰNG SAU ÁNH HÀO QUANG',
        characterTitle: `${characterName} (${lifespan})`,
        hookHeadline: 'NGƯỜI KHỔNG LỒ DỊU DÀNG LÀM RUNG CHUYỂN HOLLYWOOD',
        subHookText: 'Ra Đi Ở Tuổi 53 & Di Sản Không Bao Giờ Phai',
      },
      {
        id: 'vi-3',
        label: '🏆 Tri Ân & Di Sản',
        topBadge: 'TIỂU SỬ ĐIỆN ẢNH KINH ĐIỂN',
        characterTitle: `${characterName}`,
        hookHeadline: 'CHỈ MỘT VAI DIỄN THAY ĐỔI LỊCH SỬ MÃI MÃI',
        subHookText: `${lifespan} · Bay Trên Tổ Chim Cúc Cu`,
      },
    ];
  }

  return [
    {
      id: 'vi-generic-1',
      label: '🔥 Hùng Ca Điện Ảnh (Chuẩn Page)',
      topBadge: '★ HUYỀN THOẠI MÀN BẠC CHƯA KỂ ★',
      characterTitle: `${characterName} (${lifespan})`,
      hookHeadline: 'CUỘC ĐỜI THĂNG TRẦM CỦA TƯỢNG ĐÀI ĐIỆN ẢNH',
      subHookText: 'Hào Quang Rực Rỡ & Những Góc Khuất Ít Ai Biết',
    },
    {
      id: 'vi-generic-2',
      label: '⚡ Giật Tít Cảm Xúc (Tăng Click)',
      topBadge: 'SỰ THẬT ĐẰNG SAU ÁNH HÀO QUANG',
      characterTitle: `${characterName} (${lifespan})`,
      hookHeadline: 'BÍ MẬT CHƯA TỪNG TIẾT LỘ PHÍA SAU MÀN NHUNG',
      subHookText: 'Hành Trình Trở Thành Huyền Thoại Bất Tử',
    },
    {
      id: 'vi-generic-3',
      label: '🏆 Tri Ân & Di Sản',
      topBadge: 'TIỂU SỬ ĐIỆN ẢNH KINH ĐIỂN',
      characterTitle: `${characterName}`,
      hookHeadline: 'MỘT ÁNH MẮT. MỘT GIỌNG NÓI. MỘT DI SẢN VĨNH CỬU.',
      subHookText: `${lifespan} · Life Legends Documentary`,
    },
  ];
}

export function collectAvailableThumbnailImages(
  scenes: StoryScene[],
  vaultItems: VaultItem[]
): Array<{ id: string; label: string; url: string }> {
  const candidates: Array<{ id: string; label: string; url: string }> = [];
  const seen = new Set<string>();

  const pushUnique = (id: string, label: string, url?: string) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    candidates.push({ id, label, url });
  };

  scenes.forEach((sc, idx) => {
    if (sc.sceneType === 'outro' || sc.sceneType === 'quote') return;
    const vItem = vaultItems.find((v) => v.id === sc.mediaId);
    const num = String(idx + 1).padStart(2, '0');
    if (sc.mediaKind === 'image' && sc.mediaUrl) {
      pushUnique(`sc-img-${sc.id}`, `Cảnh #${num}: ${sc.title.slice(0, 24)}`, sc.mediaUrl);
    }
    if (vItem?.thumbnailUrl) {
      pushUnique(`sc-thumb-${sc.id}`, `Khung Cảnh #${num}: ${sc.title.slice(0, 22)}`, vItem.thumbnailUrl);
    }
    if (sc.characterRefPhotoUrl) {
      pushUnique(`sc-ref-${sc.id}`, `Ảnh Gốc Cảnh #${num}`, sc.characterRefPhotoUrl);
    }
  });

  vaultItems.forEach((item, idx) => {
    if (item.type === 'image' && item.url) {
      pushUnique(`vault-${item.id}`, item.name || `Ảnh Kho #${idx + 1}`, item.url);
    } else if (item.thumbnailUrl) {
      pushUnique(`vault-th-${item.id}`, item.name || `Video Kho #${idx + 1}`, item.thumbnailUrl);
    }
  });

  return candidates;
}

export function buildAiThumbnailGenerationPrompt(
  scenes: StoryScene[],
  settings: ProjectSettings,
  ratio: ThumbnailAspectRatio
): string {
  const { characterName, lifespan } = extractCharacterMetaForThumbnail(scenes, settings);
  const ratioSpec = getThumbnailDimensions(ratio);
  return `Masterpiece YouTube & Facebook Page documentary video thumbnail (${ratio}, ${ratioSpec.width}x${ratioSpec.height}), dramatic hyper-detailed cinematic portrait of ${characterName} (${lifespan}), expressive weathered face, piercing soulful eyes looking into the camera, warm golden-hour rim lighting against a rich dark atmospheric cinema backdrop, 35mm Kodak Portra 400 film photography, shallow depth of field, ultra-sharp facial texture, edge-to-edge full-bleed composition, no borders, no watermarks.`;
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = 3
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const testLine = `${currentLine} ${word}`;
    if (ctx.measureText(testLine).width <= maxWidth) {
      currentLine = testLine;
    } else {
      lines.push(currentLine);
      currentLine = word;
      if (lines.length >= maxLines - 1) {
        const remaining = [currentLine, ...words.slice(i + 1)].join(' ');
        currentLine = remaining;
        break;
      }
    }
  }
  lines.push(currentLine);
  return lines.slice(0, maxLines);
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

export function renderVideoThumbnailToCanvas(
  canvas: HTMLCanvasElement,
  config: ThumbnailConfig,
  loadedImage: HTMLImageElement | null
) {
  const { width: W, height: H } = getThumbnailDimensions(config.ratio);
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.save();
  ctx.clearRect(0, 0, W, H);

  // 1. Base dark cinema background
  const bgGrad = ctx.createRadialGradient(W * 0.5, H * 0.35, W * 0.08, W * 0.5, H * 0.5, Math.max(W, H) * 0.85);
  bgGrad.addColorStop(0, '#271E14');
  bgGrad.addColorStop(0.55, '#111622');
  bgGrad.addColorStop(1, '#05070B');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // 2. Draw Portrait Image with Safe 6% Border Crop & Optional HDR Contrast Pop
  if (loadedImage && loadedImage.complete && loadedImage.naturalWidth > 0) {
    ctx.save();
    if (config.template === 'vintage-sepia-prestige') {
      ctx.filter = config.autoHdrEnhance
        ? 'sepia(34%) contrast(120%) brightness(106%) saturate(112%)'
        : 'sepia(28%) contrast(108%)';
    } else if (config.autoHdrEnhance) {
      ctx.filter = 'contrast(118%) brightness(106%) saturate(116%)';
    }

    const nw = loadedImage.naturalWidth;
    const nh = loadedImage.naturalHeight;
    // Safe 6% inset crop to strip any archival border/caption
    const sx = Math.round(nw * 0.06);
    const sy = Math.round(nh * 0.06);
    const sw = Math.max(1, nw - sx * 2);
    const sh = Math.max(1, nh - sy * 2);

    const imgAspect = sw / sh;
    const canvasAspect = W / H;
    let drawW = W;
    let drawH = H;
    let dx = 0;
    let dy = 0;

    if (imgAspect > canvasAspect) {
      drawH = H;
      drawW = H * imgAspect;
      dx = (W - drawW) * 0.5;
      dy = 0;
    } else {
      drawW = W;
      drawH = W / imgAspect;
      dx = 0;
      // Favor upper-middle face region of portrait
      dy = (H - drawH) * 0.22;
    }

    ctx.drawImage(loadedImage, sx, sy, sw, sh, dx, dy, drawW, drawH);
    ctx.restore();
  }

  // 3. Cinematic Rim-Glow & Vignette Overlays
  // Warm golden top-center key light glow
  const rimGlow = ctx.createRadialGradient(
    W * 0.5,
    H * 0.26,
    W * 0.04,
    W * 0.5,
    H * 0.26,
    W * 0.65
  );
  rimGlow.addColorStop(0, 'rgba(245, 158, 11, 0.16)');
  rimGlow.addColorStop(0.6, 'rgba(245, 158, 11, 0.04)');
  rimGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = rimGlow;
  ctx.fillRect(0, 0, W, H);

  // Edge vignette
  const edgeVig = ctx.createRadialGradient(
    W * 0.5,
    H * 0.42,
    Math.min(W, H) * 0.28,
    W * 0.5,
    H * 0.5,
    Math.max(W, H) * 0.78
  );
  edgeVig.addColorStop(0, 'rgba(0,0,0,0)');
  edgeVig.addColorStop(0.7, 'rgba(5,7,12,0.32)');
  edgeVig.addColorStop(1, 'rgba(3,5,9,0.82)');
  ctx.fillStyle = edgeVig;
  ctx.fillRect(0, 0, W, H);

  // If user selected clean portrait with NO text overlay, draw optional subtle border and return
  if (!config.showTextOverlay || config.template === 'clean-portrait') {
    if (config.template === 'vintage-sepia-prestige') {
      const pad = Math.round(Math.min(W, H) * 0.028);
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.65)';
      ctx.lineWidth = Math.max(2, Math.round(W * 0.003));
      ctx.strokeRect(pad, pad, W - pad * 2, H - pad * 2);
    }
    ctx.restore();
    return;
  }

  // 4. Bottom & Top Scrims for 100% Typography Legibility on Mobile Feeds
  const topScrim = ctx.createLinearGradient(0, 0, 0, H * 0.22);
  topScrim.addColorStop(0, 'rgba(4, 6, 11, 0.82)');
  topScrim.addColorStop(1, 'rgba(4, 6, 11, 0)');
  ctx.fillStyle = topScrim;
  ctx.fillRect(0, 0, W, H * 0.22);

  const bottomScrim = ctx.createLinearGradient(0, H * 0.46, 0, H);
  bottomScrim.addColorStop(0, 'rgba(4, 6, 11, 0)');
  bottomScrim.addColorStop(0.32, 'rgba(6, 9, 15, 0.76)');
  bottomScrim.addColorStop(0.68, 'rgba(6, 9, 15, 0.94)');
  bottomScrim.addColorStop(1, 'rgba(3, 5, 10, 0.98)');
  ctx.fillStyle = bottomScrim;
  ctx.fillRect(0, H * 0.46, W, H * 0.54);

  // Decorative Frame for Vintage Prestige or Cinema Gold
  const framePad = Math.round(Math.min(W, H) * 0.026);
  if (config.template === 'vintage-sepia-prestige' || config.template === 'cinema-gold') {
    ctx.save();
    ctx.strokeStyle =
      config.template === 'vintage-sepia-prestige'
        ? 'rgba(217, 169, 92, 0.72)'
        : 'rgba(245, 158, 11, 0.42)';
    ctx.lineWidth = Math.max(2, Math.round(W * 0.0028));
    drawRoundedRectPath(
      ctx,
      framePad,
      framePad,
      W - framePad * 2,
      H - framePad * 2,
      Math.round(W * 0.016)
    );
    ctx.stroke();
    ctx.restore();
  }

  // 5. Top Badge Ribbon + Optional Channel Crest
  const baseUnit = Math.min(W, H);
  const topY = framePad + Math.round(H * 0.032);

  if (config.topBadgeText.trim()) {
    ctx.save();
    const badgeFontPx = Math.round(baseUnit * 0.025);
    ctx.font = `800 ${badgeFontPx}px "Plus Jakarta Sans", sans-serif`;
    const badgeText = config.topBadgeText.trim().toUpperCase();
    const textWidth = ctx.measureText(badgeText).width;
    const pillPadX = Math.round(baseUnit * 0.028);
    const pillH = Math.round(badgeFontPx * 1.95);
    const pillW = Math.min(W * 0.88, textWidth + pillPadX * 2);
    const pillX = (W - pillW) / 2;

    if (config.template === 'viral-red-bar') {
      const redGrad = ctx.createLinearGradient(pillX, topY, pillX + pillW, topY);
      redGrad.addColorStop(0, '#B91C1C');
      redGrad.addColorStop(0.5, '#DC2626');
      redGrad.addColorStop(1, '#991B1B');
      ctx.fillStyle = redGrad;
      ctx.strokeStyle = '#FCA5A5';
    } else {
      const darkGoldGrad = ctx.createLinearGradient(pillX, topY, pillX + pillW, topY);
      darkGoldGrad.addColorStop(0, 'rgba(15, 23, 42, 0.92)');
      darkGoldGrad.addColorStop(0.5, 'rgba(30, 41, 59, 0.92)');
      darkGoldGrad.addColorStop(1, 'rgba(15, 23, 42, 0.92)');
      ctx.fillStyle = darkGoldGrad;
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.85)';
    }

    ctx.lineWidth = Math.max(2, Math.round(baseUnit * 0.0022));
    drawRoundedRectPath(ctx, pillX, topY, pillW, pillH, pillH / 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = config.template === 'viral-red-bar' ? '#FFFFFF' : '#FBBF24';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, W / 2, topY + pillH / 2 + 1);
    ctx.restore();
  }

  // 6. Bottom Typography Block: Character Name Plate + Big Hook Headline + Sub-Hook
  const contentMaxW = W * 0.86;
  const centerX = W / 2;

  // Measure & wrap Main Hook Headline first
  const headlineFontSize = Math.round(
    baseUnit * (config.ratio === '16:9' ? 0.068 : 0.062)
  );
  const headlineFontFamily =
    config.template === 'vintage-sepia-prestige'
      ? '"Playfair Display", Georgia, serif'
      : '"Plus Jakarta Sans", sans-serif';

  ctx.font = `900 ${headlineFontSize}px ${headlineFontFamily}`;
  const headlineLines = wrapCanvasText(
    ctx,
    config.hookHeadline.toUpperCase(),
    contentMaxW,
    3
  );
  const headlineLineHeight = Math.round(headlineFontSize * 1.16);
  const totalHeadlineH = headlineLines.length * headlineLineHeight;

  // Sub-hook height
  const subFontSize = Math.round(baseUnit * 0.027);
  const hasSubHook = Boolean(config.subHookText.trim());
  const bottomMargin = framePad + Math.round(H * 0.045);

  const subHookY = H - bottomMargin;
  const headlineBottomY = hasSubHook
    ? subHookY - Math.round(subFontSize * 2.1)
    : H - bottomMargin;
  const headlineStartY = headlineBottomY - totalHeadlineH + headlineLineHeight * 0.8;

  // Character Name Ribbon above the Main Hook Headline
  if (config.characterTitle.trim()) {
    ctx.save();
    const charFontSize = Math.round(baseUnit * 0.032);
    ctx.font = `800 ${charFontSize}px "Plus Jakarta Sans", sans-serif`;
    const charText = config.characterTitle.trim().toUpperCase();
    const charTextW = ctx.measureText(charText).width;
    const charPadX = Math.round(baseUnit * 0.028);
    const charPillH = Math.round(charFontSize * 1.75);
    const charPillW = Math.min(W * 0.88, charTextW + charPadX * 2);
    const charPillX = centerX - charPillW / 2;
    const charPillY = headlineStartY - headlineFontSize * 0.95 - charPillH;

    // Gold gradient bar for Character Name
    const goldBar = ctx.createLinearGradient(charPillX, charPillY, charPillX + charPillW, charPillY);
    goldBar.addColorStop(0, '#D97706');
    goldBar.addColorStop(0.5, '#F59E0B');
    goldBar.addColorStop(1, '#B45309');
    ctx.fillStyle = goldBar;
    drawRoundedRectPath(ctx, charPillX, charPillY, charPillW, charPillH, Math.round(charPillH * 0.22));
    ctx.fill();

    ctx.fillStyle = '#090D16';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(charText, centerX, charPillY + charPillH / 2 + 1);
    ctx.restore();
  }

  // Draw Main Hook Headline Lines with Bold Cinema Shadow & Stroke
  ctx.save();
  ctx.font = `900 ${headlineFontSize}px ${headlineFontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  headlineLines.forEach((line, idx) => {
    const lineY = headlineStartY + idx * headlineLineHeight;

    // Deep drop shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
    ctx.shadowBlur = Math.round(headlineFontSize * 0.35);
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = Math.round(headlineFontSize * 0.1);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = Math.max(4, Math.round(headlineFontSize * 0.16));
    ctx.lineJoin = 'round';
    ctx.strokeText(line, centerX, lineY);
    ctx.restore();

    // Alternate white and warm gold on multi-line hooks for viral visual impact
    if (config.template === 'viral-red-bar') {
      ctx.fillStyle = idx === headlineLines.length - 1 ? '#FDE047' : '#FFFFFF';
    } else if (config.template === 'cinema-gold') {
      const textGrad = ctx.createLinearGradient(0, lineY - headlineFontSize, 0, lineY + 6);
      if (idx === 0 && headlineLines.length > 1) {
        textGrad.addColorStop(0, '#FFFFFF');
        textGrad.addColorStop(1, '#E2E8F0');
      } else {
        textGrad.addColorStop(0, '#FEF08A');
        textGrad.addColorStop(0.55, '#FBBF24');
        textGrad.addColorStop(1, '#D97706');
      }
      ctx.fillStyle = textGrad;
    } else {
      ctx.fillStyle = idx % 2 === 0 ? '#FEF3C7' : '#FBBF24';
    }

    ctx.fillText(line, centerX, lineY);
  });
  ctx.restore();

  // Draw Sub-Hook Text + Decorative Gold Divider Line
  if (hasSubHook) {
    ctx.save();
    const dividerY = subHookY - Math.round(subFontSize * 1.45);
    const divW = Math.round(W * 0.28);
    const divGrad = ctx.createLinearGradient(centerX - divW / 2, dividerY, centerX + divW / 2, dividerY);
    divGrad.addColorStop(0, 'rgba(245, 158, 11, 0)');
    divGrad.addColorStop(0.5, 'rgba(245, 158, 11, 0.9)');
    divGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
    ctx.strokeStyle = divGrad;
    ctx.lineWidth = Math.max(2, Math.round(baseUnit * 0.0025));
    ctx.beginPath();
    ctx.moveTo(centerX - divW / 2, dividerY);
    ctx.lineTo(centerX + divW / 2, dividerY);
    ctx.stroke();

    ctx.font = `600 ${subFontSize}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = '#E2E8F0';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 8;
    ctx.fillText(config.subHookText.trim(), centerX, subHookY);
    ctx.restore();
  }

  // Optional subtle Channel Signature in bottom-right corner
  if (config.showChannelBadge) {
    ctx.save();
    const tagFontSize = Math.round(baseUnit * 0.018);
    ctx.font = `700 ${tagFontSize}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = 'rgba(251, 191, 36, 0.78)';
    ctx.textAlign = 'right';
    ctx.fillText(
      'LIFE LEGENDS · HM',
      W - framePad - Math.round(W * 0.02),
      framePad + Math.round(H * 0.025)
    );
    ctx.restore();
  }

  ctx.restore();
}
