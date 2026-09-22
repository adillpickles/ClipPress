interface PublishFs {
  rename: (from: string, to: string) => Promise<void>,
  link: (from: string, to: string) => Promise<void>,
  copyExclusive: (from: string, to: string) => Promise<void>,
  unlink: (path: string) => Promise<void>,
}

/** Publish without removing the old destination first or racing an overwrite-disabled check. */
export default async function publishFile(fromPath: string, toPath: string, overwrite: boolean, fs: PublishFs) {
  if (overwrite) {
    await fs.rename(fromPath, toPath);
    return;
  }
  try {
    await fs.link(fromPath, toPath);
  } catch (error) {
    // FAT/exFAT and some network filesystems cannot create hard links. An exclusive
    // copy preserves no-clobber semantics there, at the cost of copying the bytes.
    if (!(error instanceof Error) || !('code' in error) || !['ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EXDEV', 'EINVAL'].includes(String(error.code))) throw error;
    await fs.copyExclusive(fromPath, toPath);
  }
  await fs.unlink(fromPath).catch((error) => console.warn('Export finalized; an extra temporary copy could not be removed', fromPath, error));
}
