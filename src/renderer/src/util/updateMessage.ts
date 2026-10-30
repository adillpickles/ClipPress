import type { TFunction } from 'i18next';

import formatVersion from '../../../common/formatVersion';
import type { UpdateStatus } from '../../../common/updates';

/**
 * What the updater is doing, in a sentence. `checksEnabled`: "Check for updates automatically" is on. While
 * idle, nothing has been checked yet, and some builds or settings never check at all: say which, so the
 * status never promises a check that won't happen.
 */
export default function getUpdateMessage(status: UpdateStatus, t: TFunction, checksEnabled = true) {
  const version = status.version != null ? formatVersion(status.version) : '';
  switch (status.phase) {
    case 'checking': {
      return t('Checking for updates…');
    }
    case 'up-to-date': {
      return t('ClipPress is up to date.');
    }
    case 'available': {
      return t('ClipPress {{version}} is available.', { version });
    }
    case 'downloading': {
      return t('Downloading update… {{percent}}%', { percent: status.percent ?? 0 });
    }
    case 'ready': {
      return status.installOnQuit
        ? t('ClipPress {{version}} will install when you close the app. Your next launch will use the new version.', { version })
        : t('ClipPress {{version}} is downloaded. Installation is paused.', { version });
    }
    case 'error': {
      return t('The update could not be completed. Your current app is unchanged.');
    }
    default: {
      if (status.reason === 'offline') return t('Can\'t check for updates while networking is off.');
      if (status.reason === 'development') return t('Updates are off in development builds.');
      if (status.reason === 'multiple-instances') return t('Updates are off while several windows are allowed.');
      if (!checksEnabled) return t('Automatic checks are off.');
      return t('Not checked yet.');
    }
  }
}
