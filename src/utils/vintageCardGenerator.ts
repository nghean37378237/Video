/**
 * Generates high-resolution 3:4 vintage documentary archival visual cards
 * when a scene does not yet have an uploaded photo or Wikimedia archival photo,
 * ensuring the 1-Click Full Auto-Pilot ALWAYS produces a complete playable video immediately.
 */

export function generateVintageArchivalDataUrl(
  characterOrTitle: string,
  subtitle: string,
  sceneIndex: number,
  sceneType: 'video' | 'image' = 'image'
): string {
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 960;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Deep studio blueprint darkroom background
  const palettes = [
    ['#0B111E', '#162238', '#F8FAFC'],
    ['#111827', '#1E293B', '#F1F5F9'],
    ['#14111F', '#251E3E', '#F5F3FF'],
  ];
  const pal = palettes[sceneIndex % palettes.length];

  const grad = ctx.createRadialGradient(360, 420, 40, 360, 480, 620);
  grad.addColorStop(0, pal[1]);
  grad.addColorStop(1, pal[0]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 720, 960);

  // Subtle vintage archival frame lines
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.32)';
  ctx.lineWidth = 2;
  ctx.strokeRect(40, 40, 640, 880);

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
  ctx.lineWidth = 1;
  ctx.strokeRect(54, 54, 612, 852);

  // Top Pill: CHƯA CÓ ẢNH THẬT — ĐÃ TẠO PROMPT CHUẨN KLING AI
  ctx.fillStyle = 'rgba(245, 158, 11, 0.18)';
  ctx.fillRect(110, 95, 500, 46);
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.65)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(110, 95, 500, 46);

  ctx.fillStyle = '#FBBF24';
  ctx.font = '700 20px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CHƯA CÓ ẢNH THẬT • CÓ SẴN PROMPT KLING AI', 360, 118);

  // Classic film reel emblem in center top
  ctx.save();
  ctx.translate(360, 310);
  ctx.strokeStyle =
    sceneType === 'video' ? 'rgba(56, 189, 248, 0.55)' : 'rgba(16, 185, 129, 0.55)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, 92, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, 76, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = sceneType === 'video' ? '#38BDF8' : '#34D399';
  ctx.font = '700 38px "Playfair Display", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`CẢNH #${String(sceneIndex + 1).padStart(2, '0')}`, 0, -14);

  ctx.fillStyle = '#FDE68A';
  ctx.font = '700 18px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(sceneType === 'video' ? 'CẦN VIDEO KLING' : 'CẦN ẢNH KLING', 0, 24);
  ctx.restore();

  // Character / Scene Title
  ctx.fillStyle = pal[2];
  ctx.font = '700 30px "Playfair Display", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(characterOrTitle.slice(0, 32).toUpperCase(), 360, 465);

  // Subtitle / Visual description wrapped
  ctx.fillStyle = 'rgba(226, 232, 240, 0.85)';
  ctx.font = 'italic 500 22px "Plus Jakarta Sans", sans-serif';
  const words = subtitle.split(/\s+/);
  let line = '';
  let y = 520;
  for (let i = 0; i < words.length; i++) {
    const test = line + words[i] + ' ';
    if (ctx.measureText(test).width > 520 && line) {
      ctx.fillText(line.trim(), 360, y);
      line = words[i] + ' ';
      y += 32;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line.trim(), 360, y);

  // Bottom instruction
  ctx.fillStyle = 'rgba(56, 189, 248, 0.9)';
  ctx.font = '600 18px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Mở "Bảng Prompt" để Copy Prompt Chuẩn Kling AI vẽ cảnh này', 360, 845);

  return canvas.toDataURL('image/jpeg', 0.88);
}

