// Fixed scenes for screenshots: ?shot=cover shows the cover alone (controls hidden),
// ?shot=editor shows the page with a sample photo loaded and a panel selected.
// Query params: layout, grade, size, title, subtitle, tagline, photos (comma list of
// sample names, in panel order), select (panel index). window.__shotReady is set
// once the scene has painted, so a screenshot driver knows when to shoot.
import { SIZES, drawCover } from './cover.js';

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export async function runShot(shot, query, state, canvas) {
  const layout = query.get('layout');
  if (layout) state.layout = layout;
  const grade = query.get('grade');
  if (grade) state.grade = grade;
  const size = query.get('size');
  if (size && SIZES[size]) {
    state.size = size;
    canvas.width = SIZES[size].w;
    canvas.height = SIZES[size].h;
  }
  const title = query.get('title');
  if (title !== null) {
    state.title = title;
    document.getElementById('title').value = title;
  }
  const subtitle = query.get('subtitle');
  if (subtitle !== null) {
    state.subtitle = subtitle;
    document.getElementById('subtitle').value = subtitle;
  }
  const tagline = query.get('tagline');
  if (tagline !== null) {
    state.tagline = tagline;
    document.getElementById('tagline').value = tagline;
  }
  const photos = query.get('photos');
  if (photos) {
    const names = photos.split(',');
    for (let i = 0; i < state.slots.length && i < names.length; i++) {
      state.slots[i].img = await loadImage(`samples/${names[i]}.jpg`);
      state.slots[i].name = names[i];
      state.slots[i].fx = 0;
      state.slots[i].fy = 0;
      state.slots[i].zoom = 1;
    }
  }
  const select = query.get('select');
  if (select !== null) state.selected = Number(select) || 0;

  if (shot === 'cover') {
    document.body.classList.add('shot-cover');
    state.selected = -1;
  } else if (shot === 'editor') {
    state.selected = Number(query.get('select') ?? 0) || 0;
  }

  // Pan the hero a touch so its subject sits clear of the sun.
  if (state.slots[0]?.img) {
    state.slots[0].fy = -0.15;
  }

  drawCover(canvas, state, state.selected);
  try { await document.fonts.ready; } catch { /* fall back to system fonts */ }
  drawCover(canvas, state, state.selected);
  requestAnimationFrame(() => requestAnimationFrame(() => { window.__shotReady = true; }));
}
