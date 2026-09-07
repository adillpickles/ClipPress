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
// Simplified interactive miniature of the real ClipPress window. Everything
// is deterministic and page-local: the preview plays a repo-local muted demo
// clip (no audio, no network) while the timeline, segments and export flow
// are a fixed fixture. Labels mirror real UI strings (Simple, Export name,
// Clips, Export options, Keep source quality, Target file size, Separate
// clips, Merge into one clip, Both, Max Quality, Quality, Fast, Exporting,
// Abort).
function initAppMock(): void {
  const root = document.getElementById('appmock');
  const video = document.getElementById('mockVideo') as HTMLVideoElement | null;
  const novideo = document.getElementById('mockNovideo');
  const nameInput = document.getElementById('mockName') as HTMLInputElement | null;
  const exportBtn = document.getElementById('mockExport') as HTMLButtonElement | null;
  const playBtn = document.getElementById('mockPlay') as HTMLButtonElement | null;
  const playIcon = document.getElementById('mockPlayIcon');
  const inBtn = document.getElementById('mockInBtn');
  const outBtn = document.getElementById('mockOutBtn');
  const addBtn = document.getElementById('mockAddBtn') as HTMLButtonElement | null;
  const tl = document.getElementById('mockTl');
  const range = document.getElementById('mockRange');
  const head = document.getElementById('mockHead');
  const handleIn = document.getElementById('mockHandleIn');
  const handleOut = document.getElementById('mockHandleOut');
  const tc = document.getElementById('mockTc');
  const total = document.getElementById('mockTotal');
  const clipsList = document.getElementById('mockClipsList');
  const clipsSub = document.getElementById('mockClipsSub');
  const overlay = document.getElementById('mockOverlay');
  const dlgTitle = document.getElementById('mockDlgTitle');
  const dlgClose = document.getElementById('mockDlgClose');
  const sizeInput = document.getElementById('mockSize') as HTMLInputElement | null;
  const sizeRow = document.getElementById('mockSizeRow');
  const presets = document.getElementById('mockPresets');
  const clipOutLabel = document.getElementById('mockClipOutLabel');
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
    !root || !video || !novideo || !nameInput || !exportBtn || !playBtn || !playIcon ||
    !inBtn || !outBtn || !addBtn || !tl || !range || !head || !handleIn || !handleOut ||
    !tc || !total || !clipsList || !clipsSub || !overlay || !dlgTitle ||
    !dlgClose || !sizeInput || !sizeRow || !presets || !clipOutLabel || !clipOut || !runExport ||
    !progress || !workBar || !elapsedEl || !pctEl || !abortBtn ||
    !done || !doneSize || !doneName || !doneClose
  ) {
    return;
  }

  // Strict TS does not carry the early-return narrowing above into the
  // closures below, so bind every element once into a non-null bag.
  const ui = {
    root, video, novideo, nameInput, exportBtn, playBtn, playIcon, inBtn, outBtn,
    addBtn, tl, range, head, handleIn, handleOut, tc, total, clipsList, clipsSub,
    overlay, dlgTitle, dlgClose, sizeInput, sizeRow, presets, clipOutLabel, clipOut, runExport,
    progress, workBar, elapsedEl, pctEl, abortBtn, done, doneSize, doneName, doneClose,
  };

  interface Seg {
    start: number;
    end: number;
  }

  let CLIP = 12;
  const MIN_GAP = 0.2;
  const MAX_SEGS = 5;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ICON_PLAY = '<path d="M4 2.5v11l9-5.5z" />';
  const ICON_PAUSE = '<path d="M3.5 2.5h3.2v11H3.5zM9.3 2.5h3.2v11H9.3z" />';
  const CONFETTI_COLORS = ['#ffffff', '#7ee787', '#79c0ff', '#3bb3bd', '#e8c884'];

  let segments: Seg[] = [{ start: 1.0, end: 3.1 }];
  let active = 0;
  let t = 0;
  let playing = false;
  let goal: 'keep' | 'target' = 'target';
  let view: 'edit' | 'panel' | 'work' | 'done' = 'edit';
  let playRaf = 0;
  let workRaf = 0;
  let seekTarget: number | null = null;
  let seekRaf = 0;

  const pad = (n: number): string => String(n).padStart(2, '0');
  const fmtTC = (s: number): string => {
    const ms = Math.floor((s % 1) * 1000);
    const totalS = Math.floor(s);
    return `${pad(Math.floor(totalS / 3600))}:${pad(Math.floor((totalS % 3600) / 60))}:${pad(totalS % 60)}.${String(ms).padStart(3, '0')}`;
  };
  const fmtRange = (s: number): string => `${pad(Math.floor(s / 60))}:${pad(Math.floor(s % 60))}`;
  const clampT = (v: number): number => Math.min(CLIP, Math.max(0, Math.round(v * 10) / 10));
  // Integer tenths keep durations exact: binary float dust (2.2999 instead
  // of 2.3) would otherwise leak into the totals and estimates.
  const segTenths = (s: Seg): number => Math.round(s.end * 10) - Math.round(s.start * 10);
  // segments is never empty and active is always valid, but strict indexing
  // needs the explicit fallback below.
  function cur(): Seg {
    let s: Seg | undefined = segments[active];
    if (!s) {
      s = { start: 0, end: Math.min(CLIP, 1) };
      segments[active] = s;
    }
    return s;
  }
  const totalTenths = (): number => segments.reduce((n, s) => n + segTenths(s), 0);
  const fmtTotal = (tenths: number): string => {
    const ms = tenths * 100;
    const sec = Math.floor(ms / 1000);
    return `${pad(Math.floor(sec / 3600))}:${pad(Math.floor((sec % 3600) / 60))}:${pad(sec % 60)}.${String(ms % 1000).padStart(3, '0')}`;
  };
  const fmtEst = (tenths: number): string => `${(tenths / 10).toFixed(1)} sec · ~${(Math.round(tenths * 5.5) / 10).toFixed(1)} MB`;

  function renderFrame(): void {
    const seg = cur();
    ui.range.style.left = `${(seg.start / CLIP) * 100}%`;
    ui.range.style.width = `${((seg.end - seg.start) / CLIP) * 100}%`;
    ui.head.style.left = `${(t / CLIP) * 100}%`;
    ui.handleIn.style.left = `${(seg.start / CLIP) * 100}%`;
    ui.handleOut.style.left = `${(seg.end / CLIP) * 100}%`;
    ui.tc.textContent = fmtTC(t);
  }

  function render(): void {
    renderFrame();
    ui.total.textContent = fmtTotal(totalTenths());
    renderClips();
    ui.addBtn.disabled = segments.length >= MAX_SEGS;
    ui.addBtn.title =
      segments.length >= MAX_SEGS ? 'Demo holds up to 5 clips' : 'Add the current range as another clip';
  }

  function renderClips(): void {
    ui.clipsList.innerHTML = '';
    segments.forEach((seg, i) => {
      const tenths = segTenths(seg);
      const wrap = document.createElement('div');
      wrap.className = `appmock__clipcard${i === active ? ' is-on' : ''}`;
      const main = document.createElement('button');
      main.type = 'button';
      main.className = 'appmock__clipmain';
      main.setAttribute('aria-label', `Edit clip ${i + 1}`);
      const num = document.createElement('span');
      num.className = 'appmock__clipnum';
      num.textContent = String(i + 1);
      const texts = document.createElement('span');
      texts.className = 'appmock__cliptexts';
      const rangeEl = document.createElement('span');
      rangeEl.className = 'appmock__cliprange';
      rangeEl.textContent = `${fmtRange(seg.start)} - ${fmtRange(seg.end)}`;
      const meta = document.createElement('span');
      meta.className = 'appmock__clipmeta';
      meta.textContent = fmtEst(tenths);
      texts.appendChild(rangeEl);
      texts.appendChild(meta);
      main.appendChild(num);
      main.appendChild(texts);
      main.addEventListener('click', () => {
        if (view !== 'edit') return;
        active = i;
        t = cur().start;
        renderClips();
        requestSeek(t);
      });
      wrap.appendChild(main);
      if (segments.length > 1) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'appmock__clipx';
        remove.textContent = '✕';
        remove.setAttribute('aria-label', `Remove clip ${i + 1}`);
        remove.addEventListener('click', () => {
          if (view !== 'edit' || segments.length <= 1) return;
          segments.splice(i, 1);
          active = Math.min(active, segments.length - 1);
          render();
        });
        wrap.appendChild(remove);
      }
      ui.clipsList.appendChild(wrap);
    });
    ui.clipsSub.textContent = `${segments.length} clips ready`;
  }

  function setPlaying(p: boolean): void {
    playing = p;
    ui.playIcon.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
    ui.playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  }

  // Seeks are funneled through one rAF flush so fast pointer drags apply at
  // most one seek per frame instead of hammering the media pipeline.
  function requestSeek(v: number): void {
    t = v;
    seekTarget = v;
    if (!seekRaf) seekRaf = requestAnimationFrame(flushSeek);
  }

  function flushSeek(): void {
    seekRaf = 0;
    if (seekTarget !== null) {
      try {
        ui.video.currentTime = seekTarget;
      } catch {
        /* metadata pending */
      }
      seekTarget = null;
    }
    renderFrame();
  }

  function tick(): void {
    if (Number.isFinite(ui.video.currentTime)) t = clampT(ui.video.currentTime);
    renderFrame();
    if (playing) playRaf = requestAnimationFrame(tick);
  }

  function startLoop(): void {
    cancelAnimationFrame(playRaf);
    playRaf = requestAnimationFrame(tick);
  }

  function stopLoop(): void {
    cancelAnimationFrame(playRaf);
    playRaf = 0;
  }

  function show(el: HTMLElement): void {
    el.hidden = false;
  }

  function hide(el: HTMLElement): void {
    el.hidden = true;
  }

  function pressPause(): void {
    ui.video.pause();
    setPlaying(false);
    stopLoop();
  }

  function pressPlay(): void {
    if (t >= CLIP - 0.05) {
      t = 0;
      try {
        ui.video.currentTime = 0;
      } catch {
        /* metadata pending */
      }
    }
    const attempt = ui.video.play();
    if (attempt && typeof attempt.catch === 'function') {
      attempt.catch(() => {
        setPlaying(false);
        stopLoop();
      });
    }
    setPlaying(true);
    startLoop();
  }

  function openPanel(): void {
    if (view !== 'edit') return;
    view = 'panel';
    pressPause();
    render();
    // Merge choices only make sense with two or more segments.
    const multi = segments.length > 1;
    ui.clipOutLabel.hidden = !multi;
    ui.clipOut.hidden = !multi;
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

  // Timeline pointer: drag a segment handle, or scrub anywhere else. Scrubbing
  // pauses playback and seeks through the rAF flush, so the preview stays
  // live without flooding the decoder. Pointer events cover mouse and touch.
  let drag: 'in' | 'out' | 'head' | null = null;
  function pointToT(clientX: number): number {
    const r = ui.tl.getBoundingClientRect();
    return clampT(((clientX - r.left) / r.width) * CLIP);
  }
  ui.tl.addEventListener('pointerdown', (e: PointerEvent) => {
    if (view !== 'edit') return;
    if (playing) pressPause();
    const target = e.target as HTMLElement;
    const onIn = target === ui.handleIn || target.parentElement === ui.handleIn;
    const onOut = target === ui.handleOut || target.parentElement === ui.handleOut;
    drag = onIn ? 'in' : onOut ? 'out' : 'head';
    ui.tl.setPointerCapture(e.pointerId);
    const seg = cur();
    const v = pointToT(e.clientX);
    if (drag === 'in') {
      seg.start = Math.min(v, seg.end - MIN_GAP);
      requestSeek(seg.start);
    } else if (drag === 'out') {
      seg.end = Math.max(v, seg.start + MIN_GAP);
      requestSeek(seg.end);
    } else {
      requestSeek(v);
    }
  });
  ui.tl.addEventListener('pointermove', (e: PointerEvent) => {
    if (!drag || view !== 'edit') return;
    const seg = cur();
    const v = pointToT(e.clientX);
    if (drag === 'in') {
      seg.start = Math.min(v, seg.end - MIN_GAP);
      requestSeek(seg.start);
    } else if (drag === 'out') {
      seg.end = Math.max(v, seg.start + MIN_GAP);
      requestSeek(seg.end);
    } else {
      requestSeek(v);
    }
  });
  ui.tl.addEventListener('pointerup', () => {
    drag = null;
  });
  ui.tl.addEventListener('pointercancel', () => {
    drag = null;
  });

  ui.playBtn.addEventListener('click', () => {
    if (view !== 'edit') return;
    if (playing) pressPause();
    else pressPlay();
  });

  function markIn(): void {
    const seg = cur();
    seg.start = Math.min(t, seg.end - MIN_GAP);
    render();
  }

  function markOut(): void {
    const seg = cur();
    seg.end = Math.max(t, seg.start + MIN_GAP);
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

  function defaultRange(): Seg {
    const a = cur();
    let s = Math.round((a.end + 0.3) * 10) / 10;
    let e = Math.round((s + 2) * 10) / 10;
    if (e > CLIP) {
      e = Math.round((a.start - 0.3) * 10) / 10;
      s = Math.round((e - 2) * 10) / 10;
    }
    if (s < 0 || e - s < MIN_GAP) {
      s = Math.round(CLIP * 0.3 * 10) / 10;
      e = Math.round(CLIP * 0.55 * 10) / 10;
    }
    return { start: Math.max(0, s), end: Math.min(CLIP, e) };
  }

  ui.addBtn.addEventListener('click', () => {
    if (view !== 'edit' || segments.length >= MAX_SEGS) return;
    const next = defaultRange();
    segments.push(next);
    active = segments.length - 1;
    render();
    requestSeek(next.start);
  });

  // I / O mirror the app shortcuts on the active clip, scoped to the mock.
  // Inputs opt out, and nothing is bound globally. Escape dismisses the
  // panel and success card.
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

  // One restrained celebration burst on success. Skipped entirely under
  // reduced motion; the result card carries the message on its own.
  function confettiBurst(): void {
    if (reduceMotion) return;
    const layer = document.createElement('div');
    layer.className = 'confetti-layer';
    layer.setAttribute('aria-hidden', 'true');
    ui.done.appendChild(layer);
    for (let i = 0; i < 26; i += 1) {
      const p = document.createElement('i');
      const size = 4 + Math.random() * 3;
      p.style.left = '50%';
      p.style.top = '34%';
      p.style.width = `${size.toFixed(1)}px`;
      p.style.height = `${size.toFixed(1)}px`;
      p.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length] ?? '#ffffff';
      layer.appendChild(p);
      const ang = Math.random() * Math.PI * 2;
      const dist = 60 + Math.random() * 130;
      const dx = Math.cos(ang) * dist;
      const dy = Math.sin(ang) * dist * 0.6 - 60;
      const rot = (Math.random() - 0.5) * 540;
      const anim = p.animate(
        [
          { transform: 'translate(-50%, -50%) rotate(0deg)', opacity: '1' },
          {
            transform: `translate(calc(-50% + ${dx.toFixed(0)}px), calc(-50% + ${(dy + 160).toFixed(0)}px)) rotate(${rot.toFixed(0)}deg)`,
            opacity: '0',
          },
        ],
        { duration: 900 + Math.random() * 400, easing: 'cubic-bezier(.2,.7,.3,1)' },
      );
      if (anim && typeof anim.cancel === 'function') {
        /* runs to completion; cleanup below removes the layer */
      }
    }
    window.setTimeout(() => {
      layer.remove();
    }, 1700);
  }

  ui.runExport.addEventListener('click', () => {
    if (view !== 'panel') return;
    view = 'work';
    hide(ui.overlay);
    show(ui.progress);
    ui.abortBtn.focus();
    const target = Math.min(4000, Math.max(1, Math.floor(Number(ui.sizeInput.value) || 20)));
    ui.sizeInput.value = String(target);
    // Fake duration follows the selected footage: about half the combined
    // segment length, bounded so the demo never drags or flashes by.
    const totalSecs = totalTenths() / 10;
    const duration = reduceMotion ? 300 : Math.min(3000, Math.max(800, Math.round(totalSecs * 500)));
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
      const raw = ui.nameInput.value.trim() || 'gaming-clip';
      ui.doneName.textContent = `${raw}.mp4`;
      show(ui.done);
      ui.doneClose.focus();
      confettiBurst();
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

  ui.video.muted = true;
  ui.video.defaultMuted = true;

  // Once metadata loads, the timeline runs on the real media duration with a
  // deterministic starter selection inside the clip.
  ui.video.addEventListener('loadedmetadata', () => {
    const d = ui.video.duration;
    if (!Number.isFinite(d) || d <= 0) return;
    CLIP = Math.round(d * 10) / 10;
    const s = Math.max(0.5, Math.round(CLIP * 0.15 * 10) / 10);
    const e = Math.min(CLIP - 0.3, Math.round(CLIP * 0.45 * 10) / 10);
    segments = e - s >= MIN_GAP ? [{ start: s, end: e }] : [{ start: 0, end: CLIP }];
    active = 0;
    t = 0;
    try {
      ui.video.currentTime = 0;
    } catch {
      /* not ready */
    }
    render();
  });

  ui.video.addEventListener('timeupdate', () => {
    if (!playing) {
      t = clampT(ui.video.currentTime);
      renderFrame();
    }
  });

  ui.video.addEventListener('ended', () => {
    setPlaying(false);
    stopLoop();
    t = CLIP;
    render();
  });

  // Graceful fallback: neutral slate instead of a broken-video icon.
  ui.video.addEventListener('error', () => {
    if (ui.video.readyState === 0) {
      ui.video.hidden = true;
      ui.novideo.hidden = false;
    }
    setPlaying(false);
    stopLoop();
  });

  setPlaying(false);
  render();
  if (!reduceMotion) pressPlay();
}

applyRelease();
applyYear();
initFloatParallax();
initAppMock();
