// eslint-disable-next-line import/no-extraneous-dependencies
import electron from 'electron';
import { Octokit } from '@octokit/core';

import logger from './logger.js';
import { selectNewerRelease } from './updateChannel.js';


const { app } = electron;

const octokit = new Octokit();

const owner = 'adillpickles';
const repo = 'ClipPress';
// Enough to cover the preview channel without paging; releases are listed newest first.
const releasesToInspect = 30;


// eslint-disable-next-line import/prefer-default-export
export async function checkNewVersion() {
  try {
    const currentVersion = app.getVersion();

    // Note: deliberately not `GET /releases/latest`. That endpoint skips drafts and
    // prereleases, and ClipPress publishes a preview channel, so with only beta releases
    // published it returns 404 and the check silently never worked.
    const { data } = await octokit.request('GET /repos/{owner}/{repo}/releases', {
      owner,
      repo,
      per_page: releasesToInspect,
      headers: {
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    const newestVersion = selectNewerRelease({ currentVersion, releases: data });

    logger.info('Current version', currentVersion);
    logger.info('Newest applicable version', newestVersion ?? '(none)');

    return newestVersion;
  } catch (err) {
    logger.error('Failed to check github version', err instanceof Error ? err.message : String(err));
    return undefined;
  }
}
