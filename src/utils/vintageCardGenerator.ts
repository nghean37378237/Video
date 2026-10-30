/**
 * Generates high-resolution 3:4 vintage documentary archival visual cards
 * when a scene does not yet have an uploaded photo or Wikimedia archival photo,
 * ensuring the 1-Click Full Auto-Pilot ALWAYS produces a complete playable video immediately.
 */

export function generateVintageArchivalDataUrl(
  characterOrTitle: string,
  subtitle: string,
  sceneIndex: number
): string {
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 960;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Warm sepia / vintage silver gelatin darkroom background
  const palettes = [
    ['#1C1917', '#292524', '#D6D3D1'],
    ['#18181B', '#27272A', '#E4E4E7'],
    ['#1F1A14', '#33291F', '#E7D8C5'],
  ];
  const pal = palettes[sceneIndex % palettes.length];

  const grad = ctx.createRadialGradient(360, 420, 40, 360, 480, 620);
  grad.addColorStop(0, pal[1]);
  grad.addColorStop(1, pal[0]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 720, 960);

  // Subtle vintage archival frame lines
  ctx.strokeStyle = 'rgba(214, 211, 209, 0.22)';
  ctx.lineWidth = 2;
  ctx.strokeRect(44, 44, 632, 872);

  ctx.strokeStyle = 'rgba(214, 211, 209, 0.1)';
  ctx.lineWidth = 1;
  ctx.strokeRect(56, 56, 608, 848);

  // Classic film reel / western star emblem in center top
  ctx.save();
  ctx.translate(360, 340);
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 88, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, 72, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = 'rgba(212, 175, 55, 0.75)';
  ctx.font = '700 44px "Playfair Display", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`SCENE ${String(sceneIndex + 1).padStart(2, '0')}`, 0, 0);
  ctx.restore();

  // Character / Scene Title
  ctx.fillStyle = pal[2];
  ctx.font = '700 32px "Playfair Display", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(characterOrTitle.slice(0, 34).toUpperCase(), 360, 500);

  // Subtitle / Visual description wrapped
  ctx.fillStyle = 'rgba(214, 211, 209, 0.75)';
  ctx.font = 'italic 500 22px "Plus Jakarta Sans", sans-serif';
  const words = subtitle.split(/\s+/);
  let line = '';
  let y = 555;
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

  return canvas.toDataURL('image/jpeg', 0.85);
}
