// Lightweight lint for the standalone ClipPress site.
//
// Two jobs:
//   1. keep the page factually grounded in the repository and the published
//      release (nothing invented, nothing hardcoded that belongs in config)
//   2. keep the page SMALL — the previous pass drifted into a generic
//      multi-section SaaS landing page and failed manual QA. The budgets below
//      are deliberate. Raise one only with a reason.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const siteDir = path.resolve(here, '..');
const read = (...p) => readFileSync(path.join(siteDir, ...p), 'utf8');

const html = read('index.html');
const config = read('src', 'site.config.ts');
const css = read('src', 'styles.css');

const errors = [];

const must = (hay, needle, msg) => {
  if (!hay.includes(needle)) errors.push(msg);
};
const mustMatch = (hay, re, msg) => {
  if (!re.test(hay)) errors.push(msg);
};
const mustNot = (hay, re, msg) => {
  if (re.test(hay)) errors.push(msg);
};
const count = (hay, re) => (hay.match(re) ?? []).length;

// ---------- SEO / social ----------
// No production domain yet: canonical/og:url ship only as a TODO until
// SITE.siteUrl is set (see the <head> comment in index.html).
must(html, '<title>', 'missing <title>');
must(html, 'name="description"', 'missing meta description');
must(html, 'production domain', 'missing configurable-domain TODO in <head>');
must(html, 'property="og:title"', 'missing OG title');
must(html, 'property="og:image"', 'missing OG image');
must(html, 'name="twitter:card"', 'missing Twitter card');
must(html, 'application/ld+json', 'missing JSON-LD');
must(html, '<h1', 'missing H1');
must(html, 'lang="en"', 'missing lang="en"');
mustNot(html, /clippress\.app/i, 'do not ship an unchosen production domain');
mustNot(config, /clippress\.app/i, 'do not ship an unchosen production domain');

// ---------- accessibility ----------
must(html, 'skip-link', 'missing skip link');
must(html, 'aria-label="Footer"', 'missing footer nav label');
must(html, '<main', 'missing <main>');
if (count(html, /<h1[\s>]/g) !== 1) errors.push('exactly one <h1> expected');
if (!css.includes(':focus-visible')) errors.push('CSS must include :focus-visible styles');
if (!css.includes('prefers-reduced-motion')) errors.push('CSS must respect prefers-reduced-motion');

// ---------- release-config discipline ----------
// index.html must never hardcode a direct asset URL: main.ts injects it from
// site.config.ts, and the static href stays on the Releases page so the no-JS
// path cannot 404.
mustNot(html, /releases\/download\//i, 'index.html must not hardcode a /releases/download/ asset URL');
must(config, "status: 'ready'", 'site.config.ts should be "ready" while a preview asset is published');
must(config, 'previewAssetUrl', 'site.config.ts must export previewAssetUrl()');
must(html, 'data-download', 'missing data-download hooks');
mustNot(html, /coming soon/i, 'a shipped release must not show coming-soon copy');

const field = (name) => new RegExp(`${name}:\\s*'([^']+)'`).exec(config)?.[1];
const releaseLabel = field('releaseLabel');
const assetFileName = field('assetFileName');
const platform = field('platform');
for (const [name, value] of Object.entries({ releaseLabel, assetFileName, platform })) {
  if (!value) errors.push(`could not parse PREVIEW.${name} from site.config.ts`);
}
// The static no-JS copy must already say what main.ts would say.
if (releaseLabel && !html.includes(releaseLabel)) {
  errors.push(`static fallback copy must mention the release ${releaseLabel}`);
}
// The asset filename is deliberately NOT printed on the page — it belongs on
// the release, not in the pitch. It still has to exist in config so main.ts can
// build the direct download URL.
if (releaseLabel && platform) {
  const expected = `${platform} · ${releaseLabel} · unsigned preview build`;
  if (!html.includes(expected)) {
    errors.push(`static hero meta must match releaseMetaLine(): "${expected}"`);
  }
}

// ---------- external link hygiene ----------
const externalAnchors = [...html.matchAll(/<a[^>]*href="https:\/\/[^"]*"[^>]*>/g)];
for (const m of externalAnchors) {
  if (!/rel="[^"]*noopener/.test(m[0])) {
    errors.push(`external link missing rel="noopener": ${m[0].replace(/\s+/g, ' ').slice(0, 90)}…`);
  }
}

// ---------- no invented marketing ----------
mustNot(html, /testimonial/i, 'no testimonials');
mustNot(html, /loved by \d|trusted by \d|\d+k users|\d+,\d+ users|\d+\+? developers/i, 'no invented user stats');
mustNot(html, /\d+x faster|\d+% faster|blazing|lightning[- ]fast/i, 'no invented performance claims');
mustNot(html, /\$\s?\d+\s?\/(mo|month)|pricing plans/i, 'no invented pricing');
mustNot(html, /t3\.codes|t3 code|create-t3-app|t3\.chat/i, 'do not reference T3 branding');
// The preview shipped Windows only. Any mention of macOS must be the disclaimer.
const flatHtml = html.replace(/\s+/g, ' ');
if (/macos/i.test(flatHtml) && !/No macOS or Linux build/i.test(flatHtml)) {
  errors.push('macOS may only appear in the "no macOS or Linux build" disclaimer');
}

// ---------- page-size budget (this is the point of the rebuild) ----------
const sections = count(html, /<section[\s>]/g);
if (sections > 6) errors.push(`too many <section>s (${sections} > 6) — the page must stay short`);
const h2s = count(html, /<h2[\s>]/g);
if (h2s > 7) errors.push(`too many <h2>s (${h2s} > 7) — collapse or cut content`);
const downloads = count(html, /data-download\b/g);
if (downloads > 2) errors.push(`too many download CTAs (${downloads} > 2) — hero and closer only`);
const headerMarkup = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
const navLinks = count(headerMarkup, /<a[\s>]/g);
if (navLinks > 1) errors.push(`header has ${navLinks} links — the centred wordmark is the whole header`);
mustNot(html, /<details[\s>]|\bfaq\b|frequently asked/i, 'no FAQ / accordion — put the sentence next to the content instead');

// ---------- facts that must be present, and present once ----------
must(html, 'LosslessCut', 'must attribute the LosslessCut foundation');
must(html, 'Mikael Finstad', 'must credit Mikael Finstad');
must(html, 'GPL-2.0-only', 'must state the GPL-2.0-only license');
must(html, 'Windows 10/11 x64', 'must state Windows 10/11 x64 support');
mustMatch(html, /unsigned/i, 'must disclose that the build is unsigned');
mustMatch(html, /<kbd>I<\/kbd>[\s\S]{0,60}<kbd>O<\/kbd>/, 'must document the real I / O marking workflow');
mustMatch(html, /ffmpeg/i, 'must state that ffmpeg is included in the build');
// Positioning guard: the differentiator is the size-targeted export, not the
// stream copy inherited from upstream. Both real modes must be named, and the
// headline must lead with the size one.
mustMatch(flatHtml, /target size/i, 'must name the real "Target size" workflow');
mustMatch(flatHtml, /keep source quality/i, 'must name the real "Keep source quality" mode');
mustMatch(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(flatHtml)?.[1] ?? '', /size/i, 'the h1 must lead with the file-size pitch');

const licenseMentions = count(html, /GPL-2\.0-only/g);
if (licenseMentions > 2) errors.push(`GPL-2.0-only stated ${licenseMentions} times — say it once or twice`);
const losslessCutMentions = count(html, /LosslessCut/g);
if (losslessCutMentions > 3) errors.push(`LosslessCut attributed ${losslessCutMentions} times — attribute it once`);

if (errors.length > 0) {
  console.error(`site lint failed (${errors.length}):`);
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}
console.log(
  `site lint ok — ${sections} sections, ${h2s} h2, ${downloads} download CTAs, ${externalAnchors.length} external links`,
);
