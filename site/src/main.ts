import { RELEASES_URL, previewAssetUrl, previewDownloadHref, releaseMetaLine } from './site.config';

// Every download link ships pointing at the Releases page so the no-JS path can
// never 404. When a preview asset is published we swap in the direct asset URL.
function applyRelease(): void {
  const href = previewDownloadHref();
  const assetUrl = previewAssetUrl();

  document.querySelectorAll<HTMLAnchorElement>('a[data-download]').forEach((a) => {
    a.href = href;
    if (assetUrl) a.removeAttribute('data-coming-soon');
    else a.setAttribute('data-coming-soon', 'true');
  });

  document.querySelectorAll<HTMLAnchorElement>('a[data-releases-link]').forEach((a) => {
    a.href = RELEASES_URL;
  });

  document.querySelectorAll('[data-release-meta]').forEach((el) => {
    el.textContent = releaseMetaLine();
  });
}

function applyYear(): void {
  const el = document.querySelector('[data-year]');
  if (el) el.textContent = String(new Date().getFullYear());
}

// Subtle pointer parallax for the floating format tiles. The outer .float
// wrapper takes the pointer offset (via --px/--py/--rot) while the inner tile
// keeps its idle drift animation, so the two motions compose. Pointer-fine
// only, motion-safe only, rAF-throttled, and it eases back to rest on leave.
function initFloatParallax(): void {
  const hero = document.querySelector<HTMLElement>('.hero');
  const floats = [...document.querySelectorAll<HTMLElement>('.float')];
  if (!hero || floats.length === 0) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (window.matchMedia('(pointer: coarse)').matches) return;

  let queued = false;
  let nx = 0;
  let ny = 0;

  const apply = (): void => {
    queued = false;
    for (const el of floats) {
      const depth = Number(el.dataset.depth ?? 18);
      el.style.setProperty('--px', `${(-nx * depth).toFixed(1)}px`);
      el.style.setProperty('--py', `${(-ny * depth).toFixed(1)}px`);
      el.style.setProperty('--rot', `${(nx * 2.5).toFixed(2)}deg`);
    }
  };

  hero.addEventListener('pointermove', (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
    const r = hero.getBoundingClientRect();
    nx = (e.clientX - r.left) / r.width - 0.5;
    ny = (e.clientY - r.top) / r.height - 0.5;
    if (!queued) {
      queued = true;
      requestAnimationFrame(apply);
    }
  });

  hero.addEventListener('pointerleave', () => {
    nx = 0;
    ny = 0;
    if (!queued) {
      queued = true;
      requestAnimationFrame(apply);
    }
  });
}

// Illustrative miniature of the real trim → target size → export workflow.
// Fully deterministic: it processes no video and makes no network calls. The
// terms mirror the app's UI (Mark In/Out, Target size, MB, the Quality preset
// ladder, Export/Exporting). Result always lands just under the chosen target,
// the way the real size-limited export retries until it fits.
function initDemo(): void {
  const root = document.getElementById('demo');
  const tl = document.getElementById('demoTl');
  const range = document.getElementById('demoRange');
  const head = document.getElementById('demoHead');
  const markIn = document.getElementById('demoIn');
  const markOut = document.getElementById('demoOut');
  const readout = document.getElementById('demoReadout');
  const setIn = document.getElementById('demoSetIn');
  const setOut = document.getElementById('demoSetOut');
  const sizeInput = document.getElementById('demoSize') as HTMLInputElement | null;
  const exportBtn = document.getElementById('demoExport') as HTMLButtonElement | null;
  const bar = document.getElementById('demoBar');
  const progress = root?.querySelector('.demo__progress') ?? null;
  const status = document.getElementById('demoStatus');
  if (
    !root || !tl || !range || !head || !markIn || !markOut || !readout ||
    !setIn || !setOut || !sizeInput || !exportBtn || !bar || !progress || !status
  ) {
    return;
  }

  // Strict TS does not carry the early-return narrowing above into the
  // closures below, so bind every element once into a non-null bag.
  const ui = {
    root, tl, range, head, markIn, markOut, readout, setIn, setOut,
    sizeInput, exportBtn, bar, progress, status,
  };

  const CLIP = 30;
  const IDLE = 'Press Export to run the miniature.';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const exportMs: Record<string, number> = { max: 2000, quality: 1500, fast: 1000 };

  let inT = 8.2;
  let outT = 21.6;
  let headT = 0;
  let preset = 'quality';
  let state: 'idle' | 'working' | 'done' = 'idle';
  let workRaf = 0;
  let sweepRaf = 0;
  let sweepLast = 0;

  const fmt = (t: number): string => `${t.toFixed(1)}s`;
  const clampT = (t: number): number => Math.min(CLIP, Math.max(0, Math.round(t * 10) / 10));

  function render(): void {
    ui.range.style.left = `${(inT / CLIP) * 100}%`;
    ui.range.style.width = `${((outT - inT) / CLIP) * 100}%`;
    ui.head.style.left = `${(headT / CLIP) * 100}%`;
    ui.markIn.style.left = `${(inT / CLIP) * 100}%`;
    ui.markOut.style.left = `${(outT / CLIP) * 100}%`;
    ui.readout.textContent = `${fmt(inT)} – ${fmt(outT)} · ${fmt(outT - inT)} selected`;
  }

  function markDirty(): void {
    if (state !== 'done') return;
    state = 'idle';
    ui.bar.style.width = '0%';
    ui.progress.classList.remove('is-done');
    ui.status.classList.remove('is-done');
    ui.status.textContent = IDLE;
  }

  function pointToT(clientX: number): number {
    const r = ui.tl.getBoundingClientRect();
    return clampT(((clientX - r.left) / r.width) * CLIP);
  }

  // Playhead sweep keeps the miniature feeling alive. Motion-safe only.
  function sweep(now: number): void {
    if (sweepLast === 0) sweepLast = now;
    headT = (headT + ((now - sweepLast) / 14000) * CLIP) % CLIP;
    sweepLast = now;
    render();
    sweepRaf = requestAnimationFrame(sweep);
  }
  if (!reduceMotion) sweepRaf = requestAnimationFrame(sweep);

  // Timeline pointer: drag a marker, or move the playhead anywhere else.
  // Pointer events cover mouse, pen and touch with one path.
  let drag: 'in' | 'out' | 'head' | null = null;
  ui.tl.addEventListener('pointerdown', (e: PointerEvent) => {
    if (state === 'working') return;
    const target = e.target as HTMLElement;
    drag = target === markIn ? 'in' : target === markOut ? 'out' : 'head';
    ui.tl.setPointerCapture(e.pointerId);
    const t = pointToT(e.clientX);
    if (drag === 'in') inT = Math.min(t, outT);
    else if (drag === 'out') outT = Math.max(t, inT);
    else headT = t;
    markDirty();
    render();
  });
  ui.tl.addEventListener('pointermove', (e: PointerEvent) => {
    if (!drag || state === 'working') return;
    const t = pointToT(e.clientX);
    if (drag === 'in') inT = Math.min(t, outT);
    else if (drag === 'out') outT = Math.max(t, inT);
    else headT = t;
    markDirty();
    render();
  });
  ui.tl.addEventListener('pointerup', () => {
    drag = null;
  });
  ui.tl.addEventListener('pointercancel', () => {
    drag = null;
  });

  ui.setIn.addEventListener('click', () => {
    if (state === 'working') return;
    inT = Math.min(headT, outT);
    markDirty();
    render();
  });
  ui.setOut.addEventListener('click', () => {
    if (state === 'working') return;
    outT = Math.max(headT, inT);
    markDirty();
    render();
  });

  // I / O keys work while focus is anywhere inside the demo except the
  // number field, mirroring the app's Mark In (I) / Mark Out (O) shortcuts.
  // Nothing is bound globally — the rest of the page is unaffected.
  ui.root.addEventListener('keydown', (e: KeyboardEvent) => {
    if (state === 'working') return;
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
    const key = e.key.toLowerCase();
    if (key !== 'i' && key !== 'o') return;
    e.preventDefault();
    if (key === 'i') inT = Math.min(headT, outT);
    else outT = Math.max(headT, inT);
    markDirty();
    render();
  });

  ui.sizeInput.addEventListener('input', () => {
    markDirty();
  });

  ui.root.querySelectorAll<HTMLButtonElement>('.demo__preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (state === 'working') return;
      preset = btn.dataset.preset ?? 'quality';
      ui.root.querySelectorAll('.demo__preset').forEach((other) => {
        const on = other === btn;
        other.classList.toggle('is-on', on);
        other.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      markDirty();
    });
  });

  ui.exportBtn.addEventListener('click', () => {
    if (state === 'working') return;
    cancelAnimationFrame(workRaf);
    state = 'working';
    ui.exportBtn.disabled = true;
    ui.progress.classList.remove('is-done');
    ui.status.classList.remove('is-done');
    ui.status.textContent = 'Exporting…';

    const target = Math.min(4000, Math.max(1, Math.floor(Number(ui.sizeInput.value) || 25)));
    ui.sizeInput.value = String(target);
    // Deterministic fixture: always lands just under the target.
    const result = (target - 0.3).toFixed(1);
    const duration = reduceMotion ? 250 : (exportMs[preset] ?? 1500);
    const started = performance.now();

    const tick = (now: number): void => {
      const p = Math.min(1, (now - started) / duration);
      ui.bar.style.width = `${Math.round(p * 100)}%`;
      if (p < 1) {
        workRaf = requestAnimationFrame(tick);
        return;
      }
      state = 'done';
      ui.exportBtn.disabled = false;
      ui.progress.classList.add('is-done');
      ui.status.classList.add('is-done');
      ui.status.textContent = `✓ Ready — ${result} MB · shareable MP4`;
    };
    workRaf = requestAnimationFrame(tick);
  });

  render();
  void sweepRaf;
}

applyRelease();
applyYear();
initFloatParallax();
initDemo();
