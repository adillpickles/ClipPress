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
// is deterministic and page-local: the preview plays a repo-local muted demo
// clip (no audio, no network) while the timeline and export flow are a fixed
// fixture. Single segment only: scrub, mark In and Out, export. Labels mirror
// real UI strings (Simple, Export name, Clip, Mark In, Mark Out,
// Export options, Keep source quality, Target file size, Max Quality,
// Quality, Fast, Exporting, Abort).
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
  const tl = document.getElementById('mockTl');
  const range = document.getElementById('mockRange');
  const head = document.getElementById('mockHead');
  const handleIn = document.getElementById('mockHandleIn');
  const handleOut = document.getElementById('mockHandleOut');
  const tc = document.getElementById('mockTc');
  const total = document.getElementById('mockTotal');
  const clipRange = document.getElementById('mockClipRange');
  const clipMeta = document.getElementById('mockClipMeta');
  const clipsSub = document.getElementById('mockClipsSub');
  const overlay = document.getElementById('mockOverlay');
  const dlgTitle = document.getElementById('mockDlgTitle');
  const dlgClose = document.getElementById('mockDlgClose');
  const sizeInput = document.getElementById('mockSize') as HTMLInputElement | null;
  const sizeRow = document.getElementById('mockSizeRow');
  const presets = document.getElementById('mockPresets');
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
    !inBtn || !outBtn || !tl || !range || !head || !handleIn || !handleOut ||
    !tc || !total || !clipRange || !clipMeta || !clipsSub || !overlay || !dlgTitle ||
    !dlgClose || !sizeInput || !sizeRow || !presets || !runExport ||
    !progress || !workBar || !elapsedEl || !pctEl || !abortBtn ||
    !done || !doneSize || !doneName || !doneClose
  ) {
    return;
  }

  // Strict TS does not carry the early-return narrowing above into the
  // closures below, so bind every element once into a non-null bag.
  const ui = {
    root, video, novideo, nameInput, exportBtn, playBtn, playIcon, inBtn, outBtn,
    tl, range, head, handleIn, handleOut, tc, total, clipRange, clipMeta, clipsSub,
    overlay, dlgTitle, dlgClose, sizeInput, sizeRow, presets, runExport,
    progress, workBar, elapsedEl, pctEl, abortBtn, done, doneSize, doneName, doneClose,
  };

  let CLIP = 12;
  const MIN_GAP = 0.2;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ICON_PLAY = '<path d="M4 2.5v11l9-5.5z" />';
  const ICON_PAUSE = '<path d="M3.5 2.5h3.2v11H3.5zM9.3 2.5h3.2v11H9.3z" />';
  const CONFETTI_COLORS = ['#ffffff', '#7ee787', '#79c0ff', '#3bb3bd', '#e8c884'];

  // One active segment only. It starts as the full source clip: no custom
  // trim is selected until the visitor marks In and Out.
  const seg = { start: 0, end: CLIP };
  let t = 0;
  let playing = false;
  let goal: 'keep' | 'target' = 'target';
  let view: 'edit' | 'panel' | 'work' | 'done' = 'edit';
  let playRaf = 0;
  let workRaf = 0;
  // A seek already in flight plus the newest request. The timeline UI updates
  // synchronously on every pointer event; only the media element itself is
  // coalesced, via the seeking flag and the seeked handler below.
  // lastRequested makes the UI authoritative: the media pipeline can resolve
  // seeks out of order after a scrub burst, so a stale completion must never
  // rewind the playhead behind what the visitor already sees.
  let pendingSeek: number | null = null;
  let lastRequested: number | null = null;

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
  const segTenths = (): number => Math.round(seg.end * 10) - Math.round(seg.start * 10);
  const fmtTotal = (tenths: number): string => {
    const ms = tenths * 100;
    const sec = Math.floor(ms / 1000);
    return `${pad(Math.floor(sec / 3600))}:${pad(Math.floor((sec % 3600) / 60))}:${pad(sec % 60)}.${String(ms % 1000).padStart(3, '0')}`;
  };
  const fmtEst = (tenths: number): string => `${(tenths / 10).toFixed(1)} sec · ~${(Math.round(tenths * 5.5) / 10).toFixed(1)} MB`;

  function renderFrame(): void {
    ui.range.style.left = `${(seg.start / CLIP) * 100}%`;
    ui.range.style.width = `${((seg.end - seg.start) / CLIP) * 100}%`;
    ui.head.style.left = `${(t / CLIP) * 100}%`;
    ui.handleIn.style.left = `${(seg.start / CLIP) * 100}%`;
    ui.handleOut.style.left = `${(seg.end / CLIP) * 100}%`;
    ui.tc.textContent = fmtTC(t);
  }

  function render(): void {
    renderFrame();
    renderTotals();
  }

  function renderTotals(): void {
    const tenths = segTenths();
    ui.total.textContent = fmtTotal(tenths);
    ui.clipRange.textContent = `${fmtRange(seg.start)} - ${fmtRange(seg.end)}`;
    ui.clipMeta.textContent = fmtEst(tenths);
  }

  function setPlaying(p: boolean): void {
    playing = p;
    ui.playIcon.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
    ui.playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  }

  // Seeks apply to the timeline UI synchronously so the playhead follows
  // the pointer on every event. The media element itself can only resolve
  // one seek at a time (compressed H.264 decodes forward from the previous
  // keyframe), so while a seek is in flight the newest request is parked in
  // pendingSeek and flushed on the next seeked event. fastSeek is used where
  // the browser offers it; otherwise currentTime is the same operation.
  function setMediaTime(v: number): void {
    const media = ui.video as HTMLVideoElement & { fastSeek?: (t: number) => void };
    if (typeof media.fastSeek === 'function') media.fastSeek(v);
    else ui.video.currentTime = v;
  }

  function seekNow(v: number): void {
    t = v;
    lastRequested = v;
    renderFrame();
    if (ui.video.seeking) {
      pendingSeek = v;
      return;
    }
    pendingSeek = null;
    try {
      setMediaTime(v);
    } catch {
      /* metadata pending */
    }
  }

  // Adopt the media clock only when it matches the newest requested time
  // (within float tolerance). Anything else is a stale resolution from an
  // older seek and the on-screen playhead must not move for it.
  function adoptMediaTime(): void {
    if (lastRequested === null) return;
    const ct = ui.video.currentTime;
    if (!Number.isFinite(ct)) return;
    if (Math.abs(ct - lastRequested) > 0.12) return;
    lastRequested = null;
    t = clampT(ct);
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
    // The tick loop owns the playhead from here; drop any seek epoch.
    lastRequested = null;
    startLoop();
  }

  function openPanel(): void {
    if (view !== 'edit') return;
    view = 'panel';
    pressPause();
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

  // Timeline pointer: drag a segment handle, or scrub anywhere else. Scrubbing
  // pauses playback and seeks immediately, so the preview follows the pointer
  // while the decoder catches up as fast as it can. Pointer events cover
  // mouse and touch. preventDefault on down stops native drag-and-drop (and
  // text selection) before it can start, so a wandering pointer never shows
  // a cancel cursor mid-scrub.
  let drag: 'in' | 'out' | 'head' | null = null;
  // The timeline box is measured once per gesture instead of on every move:
  // reading layout after writing styles each move would force a sync layout
  // per event. The box cannot move mid-gesture (captured pointer, no scroll).
  let tlRect: DOMRect | null = null;
  function pointToT(clientX: number): number {
    const r = tlRect ?? ui.tl.getBoundingClientRect();
    return clampT(((clientX - r.left) / r.width) * CLIP);
  }
  ui.tl.addEventListener('pointerdown', (e: PointerEvent) => {
    if (view !== 'edit') return;
    e.preventDefault();
    if (playing) pressPause();
    tlRect = ui.tl.getBoundingClientRect();
    const target = e.target as HTMLElement;
    const onIn = target === ui.handleIn || target.parentElement === ui.handleIn;
    const onOut = target === ui.handleOut || target.parentElement === ui.handleOut;
    drag = onIn ? 'in' : onOut ? 'out' : 'head';
    try {
      ui.tl.setPointerCapture(e.pointerId);
    } catch {
      /* capture is a nicety; the drag still tracks via the timeline bounds */
    }
    const v = pointToT(e.clientX);
    if (drag === 'in') {
      seg.start = Math.min(v, seg.end - MIN_GAP);
      seekNow(seg.start);
      renderTotals();
    } else if (drag === 'out') {
      seg.end = Math.max(v, seg.start + MIN_GAP);
      seekNow(seg.end);
      renderTotals();
    } else {
      seekNow(v);
    }
  });
  ui.tl.addEventListener('pointermove', (e: PointerEvent) => {
    if (!drag || view !== 'edit') return;
    const v = pointToT(e.clientX);
    if (drag === 'in') {
      seg.start = Math.min(v, seg.end - MIN_GAP);
      seekNow(seg.start);
      renderTotals();
    } else if (drag === 'out') {
      seg.end = Math.max(v, seg.start + MIN_GAP);
      seekNow(seg.end);
      renderTotals();
    } else {
      seekNow(v);
    }
  });
  ui.tl.addEventListener('pointerup', () => {
    drag = null;
  });
  ui.tl.addEventListener('pointercancel', () => {
    drag = null;
  });
  ui.tl.addEventListener('lostpointercapture', () => {
    drag = null;
  });

  ui.playBtn.addEventListener('click', () => {
    if (view !== 'edit') return;
    if (playing) pressPause();
    else pressPlay();
  });

  // Single-segment I / O. Each key moves only its own marker; when the new
  // marker would cross the other one, the other one is pushed along so the
  // segment never collapses into a sliver.
  function markIn(): void {
    seg.start = clampT(Math.min(t, CLIP - MIN_GAP));
    if (seg.start >= seg.end) seg.end = Math.min(CLIP, seg.start + MIN_GAP);
    render();
  }

  function markOut(): void {
    seg.end = clampT(Math.max(t, MIN_GAP));
    if (seg.end <= seg.start) seg.start = Math.max(0, seg.end - MIN_GAP);
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

  // Keyboard ownership: the mock is a real control surface, but I / O must
  // never fire before the visitor has touched it, and never while typing in
  // the export-name input. The first pointer or focus contact engages the
  // mock; pointing or tabbing away disengages it again.
  let engaged = false;
  function dismissNudge(): void {
    ui.playBtn.classList.remove('is-nudge');
  }
  ui.root.addEventListener('pointerdown', () => {
    engaged = true;
    dismissNudge();
  }, true);
  ui.root.addEventListener('focusin', () => {
    engaged = true;
    dismissNudge();
  });
  ui.root.addEventListener('focusout', (e: FocusEvent) => {
    const next = e.relatedTarget as Node | null;
    if (next && !ui.root.contains(next)) engaged = false;
  });
  document.addEventListener('pointerdown', (e: PointerEvent) => {
    if (!ui.root.contains(e.target as Node)) engaged = false;
  }, true);

  // I / O mirror the app shortcuts on the single clip. Nothing is bound
  // globally before engagement; inputs opt out. Escape dismisses the panel
  // and success card.
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (!engaged) return;
    if (e.key === 'Escape') {
      if (view === 'panel' || view === 'done') closeOverlays(true);
      return;
    }
    if (view !== 'edit') return;
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    const key = e.key.toLowerCase();
    if (key !== 'i' && key !== 'o') return;
    e.preventDefault();
    dismissNudge();
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

  ui.exportBtn.addEventListener('click', openPanel);
  ui.dlgClose.addEventListener('click', () => closeOverlays(true));

  // One restrained celebration burst on success. Skipped entirely under
  // reduced motion; the result card carries the message on its own. Each
  // particle removes itself when its animation finishes (the WAAPI effect
  // uses fill forwards so a finished particle stays at opacity 0 instead of
  // snapping back to a visible square), and the layer is removed wholesale
  // afterwards as a backstop.
  function confettiBurst(): void {
    if (reduceMotion) return;
    const layer = document.createElement('div');
    layer.className = 'confetti-layer';
    layer.setAttribute('aria-hidden', 'true');
    ui.done.appendChild(layer);
    const anims: Animation[] = [];
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
        { duration: 900 + Math.random() * 400, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' },
      );
      anims.push(anim);
      anim.onfinish = (): void => {
        p.remove();
      };
    }
    window.setTimeout(() => {
      for (const anim of anims) {
        try {
          anim.cancel();
        } catch {
          /* already finished */
        }
      }
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
    // Fake duration for size-targeted exports follows the selected footage:
    // about half the segment length, bounded so the demo never drags or
    // flashes by. Keep-source-quality is a passthrough-style operation, so
    // it resolves in a flat ~0.3s regardless of length.
    const totalSecs = segTenths() / 10;
    const duration = goal === 'keep' || reduceMotion ? 300 : Math.min(3000, Math.max(800, Math.round(totalSecs * 500)));
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

  // Native HTML5 drag must never start inside the preview: Chromium will
  // otherwise grab the video frame mid-scrub and show a cancel cursor.
  // (CSS user-select/user-drag plus pointerdown prevention back this up.)
  ui.video.addEventListener('dragstart', (e: Event) => e.preventDefault());
  ui.root.addEventListener('dragstart', (e: Event) => e.preventDefault());

  // Background tabs do no media or rAF work: pause playback when hidden.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && playing) pressPause();
  });
  window.addEventListener('pagehide', () => {
    if (playing) pressPause();
  });

  // Once metadata loads, the timeline runs on the real media duration with
  // the full source clip selected. The preview starts paused at the
  // beginning: no autoplay, no audio (the clip ships without an audio track
  // and the element is muted regardless).
  function syncFromMetadata(): void {
    const d = ui.video.duration;
    if (!Number.isFinite(d) || d <= 0) return;
    CLIP = Math.round(d * 10) / 10;
    seg.start = 0;
    seg.end = CLIP;
    t = 0;
    pendingSeek = null;
    lastRequested = null;
    try {
      ui.video.currentTime = 0;
    } catch {
      /* not ready */
    }
    render();
  }

  ui.video.addEventListener('loadedmetadata', syncFromMetadata);
  // The module is deferred while the video preloads during parsing, so on a
  // fast (or cached) load the metadata may already be in place before this
  // listener exists. Catch that case up front instead of stranding the
  // timeline on the fallback duration.
  if (ui.video.readyState >= 1) syncFromMetadata();

  // A finished seek flushes the newest parked request, if any. While the
  // visitor is dragging, the timeline UI already shows the pointer position,
  // so seeked only tops up the media element and never moves the playhead.
  // At rest, a completion is adopted only if it matches the newest request.
  ui.video.addEventListener('seeked', () => {
    if (pendingSeek !== null) {
      const next = pendingSeek;
      pendingSeek = null;
      try {
        setMediaTime(next);
      } catch {
        /* metadata pending */
      }
      return;
    }
    if (!playing && drag === null) adoptMediaTime();
  });

  ui.video.addEventListener('timeupdate', () => {
    if (!playing && drag === null) adoptMediaTime();
  });

  ui.video.addEventListener('ended', () => {
    setPlaying(false);
    stopLoop();
    t = CLIP;
    lastRequested = null;
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
    lastRequested = null;
  });

  setPlaying(false);
  render();
  // One restrained discoverability hint on the Play control: it pulses twice
  // and then rests. The first intentional contact dismisses it for good.
  if (!reduceMotion) ui.playBtn.classList.add('is-nudge');
}

applyRelease();
applyYear();
initFloatParallax();
initAppMock();
