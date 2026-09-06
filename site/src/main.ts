import { PREVIEW, RELEASES_URL, previewAssetUrl, previewDownloadHref } from './site.config';

document.documentElement.classList.add('js');

function setDownloadLinks(): void {
  const href = previewDownloadHref();
  const assetUrl = previewAssetUrl();

  document.querySelectorAll<HTMLAnchorElement>('a[data-download]').forEach((a) => {
    a.href = href;
    if (assetUrl) {
      a.removeAttribute('data-coming-soon');
    } else {
      a.setAttribute('data-coming-soon', 'true');
    }
  });

  document.querySelectorAll('[data-download-label]').forEach((el) => {
    el.textContent =
      PREVIEW.status === 'ready' ? `Download Preview (${PREVIEW.assetFileName})` : 'Download Preview';
  });

  document.querySelectorAll('[data-download-note]').forEach((el) => {
    el.textContent =
      PREVIEW.status === 'ready'
        ? `Preview ${PREVIEW.tag} · Windows 10/11 x64 portable EXE · Unsigned beta build.`
        : 'Preview release coming soon — get notified on the Releases page.';
  });

  document.querySelectorAll('[data-releases-link]').forEach((el) => {
    if (el instanceof HTMLAnchorElement) el.href = RELEASES_URL;
  });
}

function setYear(): void {
  const el = document.querySelector('[data-year]');
  if (el) el.textContent = String(new Date().getFullYear());
}

function initNav(): void {
  const button = document.querySelector<HTMLButtonElement>('[data-nav-toggle]');
  const nav = document.querySelector<HTMLElement>('[data-nav]');
  if (!button || !nav) return;
  button.addEventListener('click', () => {
    const open = nav.getAttribute('data-open') === 'true';
    nav.setAttribute('data-open', String(!open));
    button.setAttribute('aria-expanded', String(!open));
  });
  nav.querySelectorAll('a').forEach((a) => {
    a.addEventListener('click', () => {
      nav.setAttribute('data-open', 'false');
      button.setAttribute('aria-expanded', 'false');
    });
  });
}

function initReveal(): void {
  const els = Array.from(document.querySelectorAll('.reveal'));
  if (els.length === 0) return;
  // Lets automated visual checks (and users who prefer no motion) see
  // everything at once: #all-visible reveals all sections immediately.
  if (
    window.location.hash === '#all-visible' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    els.forEach((el) => el.classList.add('is-visible'));
    return;
  }
  if (!('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('is-visible'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
  );
  els.forEach((el) => io.observe(el));
}

setDownloadLinks();
setYear();
initNav();
initReveal();
