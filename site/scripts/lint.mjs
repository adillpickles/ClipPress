// Lightweight lint for the standalone ClipPress site.
// Checks: SEO basics, a11y basics, no fake marketing, no hardcoded asset URLs,
// single-source release config, external-link hygiene.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const siteDir = path.resolve(here, '..');
const htmlPath = path.join(siteDir, 'index.html');
const configPath = path.join(siteDir, 'src', 'site.config.ts');
const cssPath = path.join(siteDir, 'src', 'styles.css');
const mainPath = path.join(siteDir, 'src', 'main.ts');

const html = readFileSync(htmlPath, 'utf8');
const config = readFileSync(configPath, 'utf8');
const css = readFileSync(cssPath, 'utf8');
const main = readFileSync(mainPath, 'utf8');
void main;

const errors = [];
const warns = [];

function mustContain(haystack, needle, msg) {
  if (!haystack.includes(needle)) errors.push(msg);
}
function mustNotMatch(haystack, re, msg) {
  if (re.test(haystack)) errors.push(msg);
}

// SEO / social
mustContain(html, '<title>', 'missing <title>');
mustContain(html, 'name="description"', 'missing meta description');
mustContain(html, 'rel="canonical"', 'missing canonical');
mustContain(html, 'property="og:title"', 'missing OG title');
mustContain(html, 'property="og:image"', 'missing OG image');
mustContain(html, 'name="twitter:card"', 'missing Twitter card');
mustContain(html, 'application/ld+json', 'missing JSON-LD');
mustContain(html, '<h1', 'missing H1');
mustContain(html, 'lang="en"', 'missing lang="en"');

// A11y
mustContain(html, 'skip-link', 'missing skip link');
mustContain(html, 'aria-label="Primary"', 'missing primary nav label');
mustContain(html, '<main', 'missing <main>');
if (!css.includes(':focus-visible')) errors.push('CSS must include :focus-visible styles');
if (!readFileSync(cssPath, 'utf8').includes('prefers-reduced-motion')) {
  errors.push('CSS must respect prefers-reduced-motion');
}

// Release config discipline: HTML must not hardcode a direct asset download URL.
// All "data-download" anchors should point at the Releases page in static HTML;
// main.ts swaps in the asset URL only when PREVIEW.status === "ready".
const hardcodedAsset = /releases\/download\//i;
if (hardcodedAsset.test(html)) {
  errors.push('index.html must not hardcode /releases/download/ asset URLs (use Releases page; asset URL lives in site.config.ts)');
}
mustContain(config, "status: 'coming-soon'", 'site.config.ts should default to coming-soon until a preview is actually published (flip to ready on release)');
mustContain(config, 'previewAssetUrl', 'site.config.ts must export previewAssetUrl()');
mustContain(html, 'data-download', 'missing data-download hooks');
mustContain(html, 'Preview release coming soon', 'missing coming-soon fallback copy');

// External link hygiene
const externalAnchors = [...html.matchAll(/<a[^>]*href="https:\/\/[^"]*"[^>]*>/g)];
for (const m of externalAnchors) {
  if (!/rel="[^"]*noopener/.test(m[0])) {
    errors.push(`external link missing rel="noopener": ${m[0].slice(0, 90)}…`);
  }
}

// No fake marketing / no copied branding
mustNotMatch(html, /testimonial/i, 'no fake testimonials allowed');
mustNotMatch(html, /loved by \d|trusted by \d|\d+k users|\d+,\d+ users/i, 'no fake user stats allowed');
mustNotMatch(html, /\$\s?\d+\s?\/(mo|month)|pricing plans/i, 'no fake pricing allowed');
mustNotMatch(html, /t3\.codes|create-t3-app|t3\.chat/i, 'do not reference T3 branding');
mustNotMatch(html, /screenshot\.jpeg|screenshot\.png/i, 'do not claim screenshots we do not ship; illustration is labeled as illustration');

// Factual grounding spot-checks
mustContain(html, 'LosslessCut', 'must attribute LosslessCut foundation');
mustContain(html, 'Mikael Finstad', 'must credit Mikael Finstad');
mustContain(html, 'GPL-2.0-only', 'must state GPL-2.0-only license');
mustContain(html, 'Windows x64', 'must state tested Windows x64 preview path');
mustContain(html, 'I</kbd> and <kbd>O', 'hero/workflow should document the real I/O workflow');

if (errors.length > 0) {
  console.error(`site lint failed (${errors.length}):`);
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}
for (const w of warns) console.warn(`warn: ${w}`);
console.log(`site lint ok (${externalAnchors.length} external links checked)`);
