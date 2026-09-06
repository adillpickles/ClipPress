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

applyRelease();
applyYear();
initFloatParallax();
