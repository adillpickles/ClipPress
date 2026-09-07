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

// Simplified interactive miniature of the real ClipPress window. Everything
// is deterministic and page-local: a procedural canvas frame stands in for
// the demo clip (no video, no audio, no network), and the export is a fixed
// fixture. Labels mirror real UI strings (Simple, Export name, Clips,
// Mark In, Mark Out, Export options, Keep source quality, Target file size,
// Separate clips, Merge into one clip, Both, Max Quality, Quality, Fast,
// Exporting, Abort).
function initAppMock(): void {
  const root = document.getElementById('appmock');
  const canvas = document.getElementById('mockCanvas') as HTMLCanvasElement | null;
  const nameInput = document.getElementById('mockName') as HTMLInputElement | null;
  const exportBtn = document.getElementById('mockExport') as HTMLButtonElement | null;
  const playBtn = document.getElementById('mockPlay') as HTMLButtonElement | null;
  const playIcon = document.getElementById('mockPlayIcon');
  const inBtn = document.getElementById('mockInBtn');
  const outBtn = document.getElementById('mockOutBtn');
  const tl = document.getElementById('mockTl');
  const range = document.getElementById('mockRange');
  const head = document.getElementById('mockHead');
  const handleIn = document.getElementById('mockHandleIn');
  const handleOut = document.getElementById('mockHandleOut');
  const tc = document.getElementById('mockTc');
  const total = document.getElementById('mockTotal');
  const clipRange = document.getElementById('mockClipRange');
  const clipMeta = document.getElementById('mockClipMeta');
  const overlay = document.getElementById('mockOverlay');
  const dlgTitle = document.getElementById('mockDlgTitle');
  const dlgClose = document.getElementById('mockDlgClose');
  const sizeInput = document.getElementById('mockSize') as HTMLInputElement | null;
  const sizeRow = document.getElementById('mockSizeRow');
  const presets = document.getElementById('mockPresets');
  const clipOut = document.getElementById('mockClipOut');
  const runExport = document.getElementById('mockRunExport') as HTMLButtonElement | null;
  const progress = document.getElementById('mockProgress');
  const workBar = document.getElementById('mockWorkBar');
  const elapsedEl = document.getElementById('mockElapsed');
  const pctEl = document.getElementById('mockPct');
  const abortBtn = document.getElementById('mockAbort');
  const done = document.getElementById('mockDone');
  const doneSize = document.getElementById('mockDoneSize');
  const doneName = document.getElementById('mockDoneName');
  const doneClose = document.getElementById('mockDoneClose');
  if (
    !root || !canvas || !nameInput || !exportBtn || !playBtn || !playIcon ||
    !inBtn || !outBtn || !tl || !range || !head || !handleIn || !handleOut ||
    !tc || !total || !clipRange || !clipMeta || !overlay || !dlgTitle ||
    !dlgClose || !sizeInput || !sizeRow || !presets || !clipOut || !runExport ||
    !progress || !workBar || !elapsedEl || !pctEl || !abortBtn ||
    !done || !doneSize || !doneName || !doneClose
  ) {
    return;
  }

  // Strict TS does not carry the early-return narrowing above into the
  // closures below, so bind every element once into a non-null bag.
  const ui = {
    root, canvas, nameInput, exportBtn, playBtn, playIcon, inBtn, outBtn,
    tl, range, head, handleIn, handleOut, tc, total, clipRange, clipMeta,
    overlay, dlgTitle, dlgClose, sizeInput, sizeRow, presets, clipOut, runExport,
    progress, workBar, elapsedEl, pctEl, abortBtn, done, doneSize, doneName, doneClose,
  };

  const CLIP = 12;
  const MIN_GAP = 0.2;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ICON_PLAY = '<path d="M4 2.5v11l9-5.5z" />';
  const ICON_PAUSE = '<path d="M3.5 2.5h3.2v11H3.5zM9.3 2.5h3.2v11H9.3z" />';

  let t = 0;
  let start = 1.0;
  let end = 3.1;
  let playing = false;
  let goal: 'keep' | 'target' = 'target';
  let view: 'edit' | 'panel' | 'work' | 'done' = 'edit';
  let playRaf = 0;
  let playLast = 0;
  let workRaf = 0;

  const pad = (n: number): string => String(n).padStart(2, '0');
  const fmtTC = (s: number): string => {
    const ms = Math.floor((s % 1) * 1000);
    const totalS = Math.floor(s);
    return `${pad(Math.floor(totalS / 3600))}:${pad(Math.floor((totalS % 3600) / 60))}:${pad(totalS % 60)}.${String(ms).padStart(3, '0')}`;
  };
  const fmtRange = (s: number): string => `${pad(Math.floor(s / 60))}:${pad(Math.floor(s % 60))}`;
  const clampT = (v: number): number => Math.min(CLIP, Math.max(0, Math.round(v * 10) / 10));

  const ctx = ui.canvas.getContext('2d');

  // Procedural demo frame: a neutral slate with grid, drifting sheen and a
  // timecode. A pure function of t, so scrubbing and playback stay in sync.
  function drawFrame(): void {
    if (!ctx) return;
    const W = 640;
    const H = 360;
    const base = ctx.createLinearGradient(0, 0, W, H);
    base.addColorStop(0, '#191b20');
    base.addColorStop(0.5, '#23262d');
    base.addColorStop(1, '#131418');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);
    const bx = (t / CLIP) * (W + 400) - 200;
    const sheen = ctx.createLinearGradient(bx - 150, 0, bx + 150, H);
    sheen.addColorStop(0, 'rgba(59, 179, 189, 0)');
    sheen.addColorStop(0.5, 'rgba(59, 179, 189, 0.10)');
    sheen.addColorStop(1, 'rgba(59, 179, 189, 0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 64; x < W; x += 64) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, H);
    }
    for (let y = 64; y < H; y += 64) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(W, y + 0.5);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.font = '600 44px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fmtTC(t), W / 2, H / 2 + 4);
  }

  function render(): void {
    ui.range.style.left = `${(start / CLIP) * 100}%`;
    ui.range.style.width = `${((end - start) / CLIP) * 100}%`;
    ui.head.style.left = `${(t / CLIP) * 100}%`;
    ui.handleIn.style.left = `${(start / CLIP) * 100}%`;
    ui.handleOut.style.left = `${(end / CLIP) * 100}%`;
    ui.tc.textContent = fmtTC(t);
    const dur = end - start;
    ui.total.textContent = fmtTC(dur);
    ui.clipRange.textContent = `${fmtRange(start)} - ${fmtRange(end)}`;
    ui.clipMeta.textContent = `${dur.toFixed(1)} sec · ~${(dur * 5.5).toFixed(1)} MB`;
    drawFrame();
  }

  function setPlaying(p: boolean): void {
    playing = p;
    ui.playIcon.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
    ui.playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  }

  function tick(now: number): void {
    if (playLast === 0) playLast = now;
    let dt = (now - playLast) / 1000;
    playLast = now;
    if (dt > 0.25) dt = 0;
    t = (t + dt) % CLIP;
    render();
    playRaf = requestAnimationFrame(tick);
  }

  function startLoop(): void {
    cancelAnimationFrame(playRaf);
    playLast = 0;
    playRaf = requestAnimationFrame(tick);
  }

  function stopLoop(): void {
    cancelAnimationFrame(playRaf);
    playRaf = 0;
    playLast = 0;
  }

  function show(el: HTMLElement): void {
    el.hidden = false;
  }

  function hide(el: HTMLElement): void {
    el.hidden = true;
  }

  function openPanel(): void {
    if (view !== 'edit') return;
    view = 'panel';
    setPlaying(false);
    stopLoop();
    render();
    show(ui.overlay);
    ui.dlgTitle.focus();
  }

  function closeOverlays(toEdit: boolean): void {
    cancelAnimationFrame(workRaf);
    hide(ui.overlay);
    hide(ui.progress);
    hide(ui.done);
    if (toEdit) {
      view = 'edit';
      ui.exportBtn.focus();
    }
  }

  // Timeline pointer: drag a segment handle, or scrub anywhere else.
  // Pointer events cover mouse, pen and touch with one path.
  let drag: 'in' | 'out' | 'head' | null = null;
  function pointToT(clientX: number): number {
    const r = ui.tl.getBoundingClientRect();
    return clampT(((clientX - r.left) / r.width) * CLIP);
  }
  ui.tl.addEventListener('pointerdown', (e: PointerEvent) => {
    if (view !== 'edit') return;
    const target = e.target as HTMLElement;
    const onIn = target === ui.handleIn || target.parentElement === ui.handleIn;
    const onOut = target === ui.handleOut || target.parentElement === ui.handleOut;
    drag = onIn ? 'in' : onOut ? 'out' : 'head';
    ui.tl.setPointerCapture(e.pointerId);
    const v = pointToT(e.clientX);
    if (drag === 'in') start = Math.min(v, end - MIN_GAP);
    else if (drag === 'out') end = Math.max(v, start + MIN_GAP);
    else t = v;
    render();
  });
  ui.tl.addEventListener('pointermove', (e: PointerEvent) => {
    if (!drag || view !== 'edit') return;
    const v = pointToT(e.clientX);
    if (drag === 'in') start = Math.min(v, end - MIN_GAP);
    else if (drag === 'out') end = Math.max(v, start + MIN_GAP);
    else t = v;
    render();
  });
  ui.tl.addEventListener('pointerup', () => {
    drag = null;
  });
  ui.tl.addEventListener('pointercancel', () => {
    drag = null;
  });

  ui.playBtn.addEventListener('click', () => {
    if (view !== 'edit') return;
    if (playing) {
      setPlaying(false);
      stopLoop();
    } else {
      setPlaying(true);
      startLoop();
    }
  });

  function markIn(): void {
    start = Math.min(t, end - MIN_GAP);
    render();
  }

  function markOut(): void {
    end = Math.max(t, start + MIN_GAP);
    render();
  }

  ui.inBtn.addEventListener('click', () => {
    if (view !== 'edit') return;
    markIn();
  });
  ui.outBtn.addEventListener('click', () => {
    if (view !== 'edit') return;
    markOut();
  });

  // I / O mirror the app shortcuts, scoped to the mock. Inputs opt out, and
  // nothing is bound globally. Escape dismisses the panel and success card.
  ui.root.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (view === 'panel' || view === 'done') closeOverlays(true);
      return;
    }
    if (view !== 'edit') return;
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
    const key = e.key.toLowerCase();
    if (key !== 'i' && key !== 'o') return;
    e.preventDefault();
    if (key === 'i') markIn();
    else markOut();
  });

  function selectIn(group: HTMLElement, btn: HTMLButtonElement): void {
    group.querySelectorAll('.appmock__card').forEach((other) => {
      const on = other === btn;
      other.classList.toggle('is-on', on);
      other.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  ui.overlay.querySelectorAll<HTMLButtonElement>('[data-goal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      goal = btn.dataset.goal === 'keep' ? 'keep' : 'target';
      selectIn(ui.overlay, btn);
      const off = goal === 'keep';
      ui.sizeRow.classList.toggle('is-off', off);
      ui.presets.classList.toggle('is-off', off);
      ui.sizeInput.disabled = off;
      ui.presets.querySelectorAll('button').forEach((p) => {
        p.disabled = off;
      });
    });
  });

  ui.presets.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectIn(ui.presets, btn);
    });
  });

  ui.clipOut.querySelectorAll<HTMLButtonElement>('[data-output]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectIn(ui.clipOut, btn);
    });
  });

  ui.exportBtn.addEventListener('click', openPanel);
  ui.dlgClose.addEventListener('click', () => closeOverlays(true));

  ui.runExport.addEventListener('click', () => {
    if (view !== 'panel') return;
    view = 'work';
    hide(ui.overlay);
    show(ui.progress);
    ui.abortBtn.focus();
    const target = Math.min(4000, Math.max(1, Math.floor(Number(ui.sizeInput.value) || 20)));
    ui.sizeInput.value = String(target);
    const duration = reduceMotion ? 300 : 2500;
    const started = performance.now();
    const step = (now: number): void => {
      const p = Math.min(1, (now - started) / duration);
      ui.workBar.style.width = `${(p * 100).toFixed(1)}%`;
      ui.elapsedEl.textContent = `Elapsed: ${((now - started) / 1000).toFixed(1)} seconds`;
      ui.pctEl.textContent = `${(p * 100).toFixed(1)}%`;
      if (p < 1) {
        workRaf = requestAnimationFrame(step);
        return;
      }
      view = 'done';
      hide(ui.progress);
      if (goal === 'target') {
        ui.doneSize.textContent = `${(target - 0.3).toFixed(1)} MB`;
      } else {
        ui.doneSize.textContent = 'Source quality kept';
      }
      const raw = ui.nameInput.value.trim() || 'demo-clip';
      ui.doneName.textContent = `${raw}.mp4`;
      show(ui.done);
      ui.doneClose.focus();
    };
    workRaf = requestAnimationFrame(step);
  });

  ui.abortBtn.addEventListener('click', () => {
    if (view !== 'work') return;
    cancelAnimationFrame(workRaf);
    view = 'panel';
    hide(ui.progress);
    show(ui.overlay);
    ui.runExport.focus();
  });

  ui.doneClose.addEventListener('click', () => closeOverlays(true));

  setPlaying(!reduceMotion);
  if (playing) startLoop();
  render();
}

applyRelease();
applyYear();
initFloatParallax();
initAppMock();
