import sharp from 'sharp';
import icongenRaw from 'icon-gen';

const icongen = icongenRaw as unknown as typeof icongenRaw['default'];

const svg2png = (from: string, to: string, width: number, height: number) => sharp(from)
  .png()
  .resize(width, height, {
    fit: sharp.fit.contain,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .toFile(to);

const srcIcon = 'src/renderer/src/icon.svg';
// Linux:
await svg2png(srcIcon, './icon-build/app-512.png', 512, 512);

// Note: the Windows Store (appx) logos are not generated any more. That target was
// removed along with the upstream project's store identity, which ClipPress cannot
// publish under.

// MacOS:
// https://github.com/mifi/lossless-cut/issues/1820
await icongen('./src/renderer/src/icon-mac.svg', './icon-build', { icns: { sizes: [512, 1024] }, report: false });

// Windows ICO:
// https://github.com/mifi/lossless-cut/issues/778
// https://stackoverflow.com/questions/3236115/which-icon-sizes-should-my-windows-applications-icon-include
await icongen(srcIcon, './icon-build', { ico: { sizes: [16, 24, 32, 40, 48, 64, 96, 128, 256, 512] }, report: false });
