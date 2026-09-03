// Dev server origin. Compared as an origin, not as a string prefix, so
// http://localhost:30011 or http://localhost:3001.example.com cannot slip through.
export const devServerOrigin = 'http://localhost:3001';

// shell.openExternal on schemes like file:, ms-msdt: or smb: is a code execution
// primitive, so only hand http(s) to the OS.
export function isExternallyOpenableUrl(url: string) {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

export function isAllowedAppNavigation({ navigationUrl, currentUrl, isDev: dev }: {
  navigationUrl: string,
  currentUrl: string | undefined,
  isDev: boolean,
}) {
  if (currentUrl != null && navigationUrl === currentUrl) return true; // reload
  if (!dev) return false;
  try {
    return new URL(navigationUrl).origin === devServerOrigin;
  } catch {
    return false;
  }
}
