// Vice City Cover Studio — wires the page: layout / grade / size pickers, caption inputs,
// six photo slots with pan-and-zoom framing, PNG export, and the ?shot= scenes that
// screenshots are taken from (see ./shots.js).
import { GRADES, LAYOUTS, SIZES, drawCover, panelAt, panelRects } from './cover.js';
import { runShot } from './shots.js';

const canvas = document.getElementById('cover');
const status = document.getElementById('status');
const titleInput = document.getElementById('title');
const subtitleInput = document.getElementById('subtitle');
const taglineInput = document.getElementById('tagline');

/** The six sample photos bundled with the app, in poster order (hero first). */
export const SAMPLES = ['convertible', 'neon', 'tower', 'marina', 'boulevard', 'pier'];

const state = {
  layout: 'poster',
  grade: 'sunset',
  size: 'square',
  title: titleInput.value,
  subtitle: subtitleInput.value,
  tagline: taglineInput.value,
  slots: SAMPLES.map((name) => ({ name, img: null, fx: 0, fy: 0, zoom: 1 })),
  selected: 0,
};

function redraw() {
  drawCover(canvas, state, state.selected);
  updateSlotButtons();
}

/** Loads an image from a URL, resolving once it can be drawn. */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

async function loadSamples() {
  for (const slot of state.slots) {
    slot.img = await loadImage(`samples/${slot.name}.jpg`);
  }
  redraw();
}

/** The slot buttons: a thumbnail, a number, and which sample it holds. */
function updateSlotButtons() {
  const holder = document.getElementById('slots');
  if (!holder.childElementCount) {
    state.slots.forEach((slot, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'slot';
      btn.title = `Panel ${i + 1}: ${slot.name}`;
      btn.innerHTML = `<img alt=""><span>${i + 1}</span>`;
      btn.addEventListener('click', () => {
        state.selected = i;
        redraw();
        updateSelectedLabel();
      });
      holder.appendChild(btn);
    });
  }
  [...holder.children].forEach((btn, i) => {
    btn.classList.toggle('active', i === state.selected);
    const img = btn.querySelector('img');
    if (state.slots[i].img && img.src !== state.slots[i].img.src) img.src = state.slots[i].img.src;
  });
  document.getElementById('selectedLabel').textContent =
    `Panel ${state.selected + 1} selected — ${state.slots[state.selected].name}. Drag it to pan, scroll to zoom.`;
}

function updateSelectedLabel() {
  document.getElementById('selectedLabel').textContent =
    `Panel ${state.selected + 1} selected — ${state.slots[state.selected].name}. Drag it to pan, scroll to zoom.`;
}

/** A row of toggle buttons for one option group (layouts, grades, sizes). */
function buildPicker(id, options, key, onPick) {
  const holder = document.getElementById(id);
  Object.entries(options).forEach(([value, opt]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = opt.label;
    btn.addEventListener('click', () => {
      state[key] = value;
      if (key === 'size') {
        canvas.width = opt.w;
        canvas.height = opt.h;
      }
      [...holder.children].forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      onPick?.();
      redraw();
    });
    holder.appendChild(btn);
    if (state[key] === value) btn.classList.add('active');
  });
}

buildPicker('layouts', LAYOUTS, 'layout');
buildPicker('grades', GRADES, 'grade');
buildPicker('sizes', SIZES, 'size', () => {
  status.textContent = `Size ${SIZES[state.size].w} × ${SIZES[state.size].h}`;
});

titleInput.addEventListener('input', () => { state.title = titleInput.value; redraw(); });
subtitleInput.addEventListener('input', () => { state.subtitle = subtitleInput.value; redraw(); });
taglineInput.addEventListener('input', () => { state.tagline = taglineInput.value; redraw(); });

document.getElementById('upload').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const slot = state.slots[state.selected];
  slot.img = await loadImage(URL.createObjectURL(file));
  slot.name = file.name.replace(/\.[^.]+$/, '').slice(0, 18) || 'upload';
  slot.fx = 0;
  slot.fy = 0;
  slot.zoom = 1;
  redraw();
  status.textContent = `Photo loaded into panel ${state.selected + 1}.`;
});

document.getElementById('fillall').addEventListener('click', () => {
  const src = state.slots[state.selected];
  state.slots.forEach((slot) => {
    slot.img = src.img;
    slot.name = src.name;
    slot.fx = 0;
    slot.fy = 0;
    slot.zoom = 1;
  });
  redraw();
  status.textContent = 'One photo now fills every panel.';
});

document.getElementById('reset').addEventListener('click', () => {
  state.slots.forEach((slot) => { slot.fx = 0; slot.fy = 0; slot.zoom = 1; });
  redraw();
  status.textContent = 'Framing reset.';
});

document.getElementById('export').addEventListener('click', () => {
  const size = SIZES[state.size];
  const out = document.createElement('canvas');
  out.width = size.w;
  out.height = size.h;
  drawCover(out, state);
  out.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vice-city-cover-${size.w}x${size.h}.png`;
    a.click();
    status.textContent = `Saved vice-city-cover-${size.w}x${size.h}.png`;
  }, 'image/png');
});

// Pan and zoom the selected panel straight on the preview.
let dragging = null;
function canvasPoint(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) / r.width) * canvas.width,
    y: ((e.clientY - r.top) / r.height) * canvas.height,
  };
}
canvas.addEventListener('pointerdown', (e) => {
  const p = canvasPoint(e);
  const hit = panelAt(state, canvas.width, canvas.height, p.x, p.y);
  if (hit >= 0) {
    state.selected = hit;
    updateSelectedLabel();
    dragging = { x: p.x, y: p.y, slot: state.slots[hit] };
    canvas.setPointerCapture(e.pointerId);
    redraw();
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const p = canvasPoint(e);
  const slot = dragging.slot;
  if (!slot.img) return;
  const rect = panelRectOf(state, dragging.slot);
  if (!rect) return;
  const base = Math.max(rect.w / slot.img.naturalWidth, rect.h / slot.img.naturalHeight) * slot.zoom;
  const slackX = Math.max(1, (slot.img.naturalWidth * base - rect.w) / 2);
  const slackY = Math.max(1, (slot.img.naturalHeight * base - rect.h) / 2);
  slot.fx = clamp(slot.fx + ((p.x - dragging.x) / slackX), -1, 1);
  slot.fy = clamp(slot.fy + ((p.y - dragging.y) / slackY), -1, 1);
  dragging.x = p.x;
  dragging.y = p.y;
  redraw();
});
canvas.addEventListener('pointerup', () => { dragging = null; });
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const slot = state.slots[state.selected];
  slot.zoom = clamp(slot.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), 1, 4);
  redraw();
}, { passive: false });

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function panelRectOf(st, slot) {
  const band = Math.round(canvas.height * 0.115);
  const rects = panelRects(st.layout, canvas.width, canvas.height, band);
  return rects[st.slots.indexOf(slot)] ?? null;
}

// Boot: fonts first (the canvas measures text with them), then the samples.
const shot = new URLSearchParams(location.search).get('shot');
async function boot() {
  try { await document.fonts.ready; } catch { /* system fonts fall back */ }
  await loadSamples();
  if (shot) {
    await runShot(shot, new URLSearchParams(location.search), state, canvas);
  }
  redraw();
}
boot();
