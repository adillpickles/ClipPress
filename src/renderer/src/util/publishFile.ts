interface PublishFs {
  rename: (from: string, to: string) => Promise<void>,
  link: (from: string, to: string) => Promise<void>,
  copyExclusive: (from: string, to: string) => Promise<void>,
  unlink: (path: string) => Promise<void>,
}

const hasCode = (error: unknown, codes: string[]) => error instanceof Error && 'code' in error && codes.includes(String(error.code));

// FAT/exFAT and some network filesystems cannot create hard links.
const linkUnsupportedCodes = ['ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EINVAL'];

/** Puts a file at a name on the same drive in one step, replacing what's there only with `overwrite`. */
async function publishOnSameDrive(fromPath: string, toPath: string, overwrite: boolean, fs: PublishFs) {
  if (overwrite) {
    await fs.rename(fromPath, toPath);
    return;
  }
  try {
    await fs.link(fromPath, toPath);
  } catch (error) {
    // An exclusive copy preserves no-clobber semantics there, at the cost of copying the bytes.
    if (!hasCode(error, linkUnsupportedCodes)) throw error;
    await fs.copyExclusive(fromPath, toPath);
  }
  await fs.unlink(fromPath).catch((error) => console.warn('Export finalized; an extra temporary copy could not be removed', fromPath, error));
}

/** Publish without removing the old destination first or racing an overwrite-disabled check. */
export default async function publishFile(fromPath: string, toPath: string, overwrite: boolean, fs: PublishFs) {
  try {
    await publishOnSameDrive(fromPath, toPath, overwrite, fs);
    return;
  } catch (error) {
    if (!hasCode(error, ['EXDEV'])) throw error;
  }
  // From another drive (exports are made in ClipPress's temporary folder): copied beside the destination under a
  // temporary name first, so its real name only ever holds a whole file, then published from there in one step.
  const stagedPath = `${toPath}.clippress-${process.pid}-${Date.now()}.tmp`;
  try {
    await fs.copyExclusive(fromPath, stagedPath);
    await publishOnSameDrive(stagedPath, toPath, overwrite, fs);
  } catch (error) {
    await fs.unlink(stagedPath).catch(() => undefined);
    throw error;
  }
  await fs.unlink(fromPath).catch((error) => console.warn('Export finalized; an extra temporary copy could not be removed', fromPath, error));
}
