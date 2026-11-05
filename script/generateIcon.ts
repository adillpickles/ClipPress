import icongenRaw from 'icon-gen';

const icongen = icongenRaw as unknown as typeof icongenRaw['default'];

const srcIcon = 'src/renderer/src/icon.svg';

// Only Windows: ClipPress has only ever shipped there (the Mac and Linux packaging is gone; icon-mac.svg stays for a
// port). The Windows Store (appx) logos aren't made either: that target left with the upstream store identity.

// Windows ICO:
// https://github.com/mifi/lossless-cut/issues/778
// https://stackoverflow.com/questions/3236115/which-icon-sizes-should-my-windows-applications-icon-include
await icongen(srcIcon, './icon-build', { ico: { sizes: [16, 24, 32, 40, 48, 64, 96, 128, 256, 512] }, report: false });
