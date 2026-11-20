// Vice City Cover Studio — the cover renderer. Draws a multi-panel GTA-style poster
// onto a canvas: photo panels with pan/zoom framing, a colour grade, a synthwave sun,
// palm silhouettes, film grain, a vignette, and bold Anton/Oswald lettering.
// Everything here is deterministic (the grain uses a fixed-seed PRNG), so two renders
// of the same state produce the same pixels.

/** Colour grades: tint colours and the sun's colours, per grade id. */
export const GRADES = {
  sunset: {
    label: 'Vice Sunset',
    wash: 'rgba(255, 90, 60, 0.10)',
    top: 'rgba(255, 140, 90, 0.00)',
    bottom: 'rgba(190, 30, 110, 0.42)',
    sunTop: '#ffd23e',
    sunBottom: '#ff7a3d',
    band: '#170a24',
  },
  neon: {
    label: 'Neon Nights',
    wash: 'rgba(40, 120, 255, 0.12)',
    top: 'rgba(40, 200, 255, 0.05)',
    bottom: 'rgba(120, 20, 180, 0.45)',
    sunTop: '#ff5da2',
    sunBottom: '#7b2fff',
    band: '#0a0618',
  },
  golden: {
    label: 'Golden Hour',
    wash: 'rgba(255, 170, 40, 0.12)',
    top: 'rgba(255, 200, 90, 0.04)',
    bottom: 'rgba(200, 110, 20, 0.38)',
    sunTop: '#ffe08a',
    sunBottom: '#ff9a3d',
    band: '#241206',
  },
  noir: {
    label: 'Noir',
    wash: 'rgba(10, 10, 20, 0.16)',
    top: 'rgba(255, 255, 255, 0.03)',
    bottom: 'rgba(0, 0, 0, 0.45)',
    sunTop: '#f2f2f2',
    sunBottom: '#8f8f8f',
    band: '#0b0b0e',
  },
};

/** Layouts: each returns the panel rectangles (fractions of the canvas) it uses. */
export const LAYOUTS = {
  poster: { label: 'Poster · 6 panels', panels: 6 },
  duo: { label: 'Duo · 2 panels', panels: 2 },
  solo: { label: 'Solo · 1 photo', panels: 1 },
};

/** Sizes the export offers, in pixels. */
export const SIZES = {
  square: { label: '1080 × 1080 · square', w: 1080, h: 1080 },
  portrait: { label: '1080 × 1350 · portrait', w: 1080, h: 1350 },
  wide: { label: '1920 × 1080 · wide', w: 1920, h: 1080 },
};

/** A tiny seeded PRNG (mulberry32) so the film grain is identical every render. */
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let grainTile = null;
/** A 96 x 96 noise tile, built once, reused for every grain pass. */
function getGrainTile() {
  if (grainTile) return grainTile;
  const tile = document.createElement('canvas');
  tile.width = 96;
  tile.height = 96;
  const tctx = tile.getContext('2d');
  const img = tctx.createImageData(96, 96);
  const rnd = seededRandom(20261120);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(rnd() * 255);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  tctx.putImageData(img, 0, 0);
  grainTile = tile;
  return tile;
}

/** Panel rectangles for a layout, in canvas pixels. `band` is the caption band height. */
export function panelRects(layout, w, h, band) {
  const b = Math.max(10, Math.round(Math.min(w, h) * 0.012)); // outer frame
  const g = Math.max(6, Math.round(b * 0.7)); // gap between panels
  const top = b;
  const bottom = h - band;
  const rects = [];
  if (layout === 'poster') {
    if (w > h) {
      // Wide: hero on the left, a column of five panels on the right.
      const heroW = Math.round((w - 2 * b - g) * 0.62);
      rects.push({ x: b, y: top, w: heroW, h: bottom - top });
      const colX = b + heroW + g;
      const colW = w - b - colX;
      const ph = (bottom - top - 4 * g) / 5;
      for (let i = 0; i < 5; i++) {
        rects.push({ x: colX, y: top + i * (ph + g), w: colW, h: ph });
      }
    } else {
      // Square / portrait: hero on top, five panels in a row below it.
      const heroH = Math.round((bottom - top - g) * 0.56);
      rects.push({ x: b, y: top, w: w - 2 * b, h: heroH });
      const rowY = top + heroH + g;
      const rowH = bottom - rowY;
      const pw = (w - 2 * b - 4 * g) / 5;
      for (let i = 0; i < 5; i++) {
        rects.push({ x: b + i * (pw + g), y: rowY, w: pw, h: rowH });
      }
    }
  } else if (layout === 'duo') {
    if (w >= h) {
      const pw = (w - 2 * b - g) / 2;
      rects.push({ x: b, y: top, w: pw, h: bottom - top });
      rects.push({ x: b + pw + g, y: top, w: pw, h: bottom - top });
    } else {
      const ph = (bottom - top - g) / 2;
      rects.push({ x: b, y: top, w: w - 2 * b, h: ph });
      rects.push({ x: b, y: top + ph + g, w: w - 2 * b, h: ph });
    }
  } else {
    rects.push({ x: b, y: top, w: w - 2 * b, h: bottom - top });
  }
  return rects;
}

/** Draws one photo into a panel rect, cover-fit, with the slot's pan/zoom framing. */
function drawPanelPhoto(ctx, rect, slot, grade) {
  const img = slot.img;
  ctx.save();
  roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, Math.max(4, rect.w * 0.012));
  ctx.clip();
  if (!img) {
    ctx.fillStyle = '#241a30';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
    return;
  }
  const zoom = slot.zoom || 1;
  const base = Math.max(rect.w / img.naturalWidth, rect.h / img.naturalHeight) * zoom;
  const dw = img.naturalWidth * base;
  const dh = img.naturalHeight * base;
  const slackX = Math.max(0, (dw - rect.w) / 2);
  const slackY = Math.max(0, (dh - rect.h) / 2);
  const dx = rect.x + (rect.w - dw) / 2 + (slot.fx || 0) * slackX;
  const dy = rect.y + (rect.h - dh) / 2 + (slot.fy || 0) * slackY;
  if (grade === 'noir') ctx.filter = 'grayscale(0.85) contrast(1.12) brightness(0.96)';
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.filter = 'none';
  // Grade wash + a tint rising from the panel's foot.
  ctx.fillStyle = GRADES[grade].wash;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  const tint = ctx.createLinearGradient(0, rect.y + rect.h * 0.45, 0, rect.y + rect.h);
  tint.addColorStop(0, GRADES[grade].top);
  tint.addColorStop(1, GRADES[grade].bottom);
  ctx.fillStyle = tint;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
  // Thin light frame around the panel.
  ctx.save();
  roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, Math.max(4, rect.w * 0.012));
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = Math.max(1.5, rect.w * 0.006);
  ctx.stroke();
  ctx.restore();
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** A synthwave sun: a disc with horizontal slats, peeking from a panel's top corner. */
function drawSun(ctx, rect, grade) {
  const g = GRADES[grade];
  const r = rect.h * 0.3;
  const cx = rect.x + rect.w - r * 0.1;
  const cy = rect.y + r * 0.35;
  ctx.save();
  roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, Math.max(4, rect.w * 0.012));
  ctx.clip();
  const grad = ctx.createLinearGradient(0, cy - r, 0, cy + r);
  grad.addColorStop(0, g.sunTop);
  grad.addColorStop(1, g.sunBottom);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  // Slats: erase widening horizontal bands across the sun's lower half.
  ctx.globalCompositeOperation = 'destination-out';
  let y = cy + r * 0.1;
  let gapH = r * 0.05;
  while (y < cy + r) {
    ctx.fillRect(cx - r - 2, y, r * 2 + 4, gapH);
    y += gapH + r * 0.18;
    gapH *= 1.5;
  }
  ctx.restore();
}

/** A palm silhouette: a leaning trunk and seven arcing fronds. */
function drawPalm(ctx, x, y, s, lean, alpha) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.rotate(lean);
  ctx.strokeStyle = `rgba(12, 6, 18, ${alpha})`;
  ctx.fillStyle = `rgba(12, 6, 18, ${alpha})`;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(6, -52, 16, -92);
  ctx.stroke();
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI * (0.08 + i * 0.14);
    const len = 52 - Math.abs(i - 3) * 6;
    ctx.beginPath();
    ctx.moveTo(16, -92);
    ctx.quadraticCurveTo(
      16 + Math.cos(a) * len * 0.6,
      -92 + Math.sin(a) * len * 0.55 - 14,
      16 + Math.cos(a) * len,
      -92 + Math.sin(a) * len + 16,
    );
    ctx.stroke();
  }
  ctx.restore();
}

/** Fits a line of text: shrinks the font until it fits `maxWidth`. Returns the size used. */
function fitFont(ctx, text, startSize, maxWidth, family, weight) {
  let size = startSize;
  ctx.font = `${weight} ${size}px ${family}`;
  while (size > 10 && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  return size;
}

/**
 * Draws the whole cover onto `canvas` from `state`:
 * { layout, grade, title, subtitle, tagline, slots: [{img, fx, fy, zoom}] }.
 * `selected` (optional) outlines one panel for the editor.
 */
export function drawCover(canvas, state, selected = -1) {
  const ctx = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  const grade = GRADES[state.grade] ? state.grade : 'sunset';
  const g = GRADES[grade];
  const band = Math.round(h * 0.115);

  // Backdrop.
  ctx.fillStyle = g.band;
  ctx.fillRect(0, 0, w, h);

  const rects = panelRects(state.layout, w, h, band);
  const count = LAYOUTS[state.layout].panels;
  for (let i = 0; i < count; i++) {
    drawPanelPhoto(ctx, rects[i], state.slots[i] || {}, grade);
  }

  // Sun and palms over the hero panel (the first one), kept out of faces: the sun
  // peeks from the hero's top-right corner, the palms hug its bottom-left edge.
  const hero = rects[0];
  drawSun(ctx, hero, grade);
  const ps = Math.min(hero.w, hero.h) / 560;
  drawPalm(ctx, hero.x + hero.w * 0.06, hero.y + hero.h * 0.98, ps, 0.1, 0.85);
  drawPalm(ctx, hero.x + hero.w * 0.15, hero.y + hero.h * 0.99, ps * 0.72, -0.14, 0.8);

  // Caption band: dark gradient, then the lettering.
  const bandY = h - band;
  const bg = ctx.createLinearGradient(0, bandY - band * 0.35, 0, h);
  bg.addColorStop(0, 'rgba(10, 5, 18, 0)');
  bg.addColorStop(0.35, g.band);
  bg.addColorStop(1, g.band);
  ctx.fillStyle = bg;
  ctx.fillRect(0, bandY - band * 0.35, w, band * 1.35);
  ctx.fillStyle = g.sunBottom;
  ctx.fillRect(0, bandY, w, Math.max(2, h * 0.004));

  const title = (state.title || '').trim().toUpperCase();
  const sub = (state.subtitle || '').trim().toUpperCase();
  const tag = (state.tagline || '').trim();
  const cx = w / 2;
  const maxW = w * 0.92;
  if (title) {
    const size = fitFont(ctx, title, band * 0.52, maxW, 'Anton, sans-serif', 400);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.lineWidth = size * 0.14;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = size * 0.12;
    ctx.shadowOffsetY = size * 0.04;
    ctx.strokeText(title, cx, bandY + band * 0.38);
    ctx.fillText(title, cx, bandY + band * 0.38);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }
  const line2 = [sub, tag].filter(Boolean).join('  ·  ');
  if (line2) {
    const size = fitFont(ctx, line2, band * 0.2, maxW, 'Oswald, sans-serif', 600);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    // Letter-spacing by hand: canvas has no letterSpacing everywhere, so draw
    // the subtitle in Oswald with wide word gaps instead.
    ctx.fillText(line2, cx, bandY + band * 0.82);
  }

  // Film grain + vignette over the whole cover.
  ctx.save();
  ctx.globalAlpha = 0.055;
  ctx.fillStyle = ctx.createPattern(getGrainTile(), 'repeat');
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
  const vig = ctx.createRadialGradient(
    w / 2, h / 2, Math.min(w, h) * 0.42,
    w / 2, h / 2, Math.max(w, h) * 0.75,
  );
  vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vig.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);

  // Editor selection outline, if one was asked for.
  if (selected >= 0 && selected < rects.length) {
    const r = rects[selected];
    ctx.save();
    ctx.strokeStyle = '#ffd23e';
    ctx.lineWidth = Math.max(3, w * 0.005);
    ctx.setLineDash([Math.max(10, w * 0.012), Math.max(8, w * 0.008)]);
    roundRectPath(ctx, r.x - 4, r.y - 4, r.w + 8, r.h + 8, 8);
    ctx.stroke();
    ctx.restore();
  }
}

/** Which panel (if any) holds canvas point (x, y); -1 when none. */
export function panelAt(state, w, h, x, y) {
  const band = Math.round(h * 0.115);
  const rects = panelRects(state.layout, w, h, band);
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
  }
  return -1;
}
