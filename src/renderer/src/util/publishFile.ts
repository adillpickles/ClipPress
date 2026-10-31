interface PublishFs {
  rename: (from: string, to: string) => Promise<void>,
  link: (from: string, to: string) => Promise<void>,
  copyExclusive: (from: string, to: string) => Promise<void>,
  unlink: (path: string) => Promise<void>,
}

const hasCode = (error: unknown, codes: string[]) => error instanceof Error && 'code' in error && codes.includes(String(error.code));

/** Publish without removing the old destination first or racing an overwrite-disabled check. */
export default async function publishFile(fromPath: string, toPath: string, overwrite: boolean, fs: PublishFs) {
  if (overwrite) {
    try {
      await fs.rename(fromPath, toPath);
      return;
    } catch (error) {
      // From another drive (exports are made in ClipPress's temporary folder): copied straight to its name when
      // nothing is there (usually: names are new), else next to it first and then over the old file in one step, so
      // a failed copy never leaves half a file under its name.
      if (!hasCode(error, ['EXDEV'])) throw error;
      try {
        await fs.copyExclusive(fromPath, toPath);
        await fs.unlink(fromPath).catch((unlinkError) => console.warn('Export finalized; an extra temporary copy could not be removed', fromPath, unlinkError));
        return;
      } catch (copyError) {
        if (!hasCode(copyError, ['EEXIST'])) throw copyError;
      }
      const stagedPath = `${toPath}.clippress-${process.pid}-${Date.now()}.tmp`;
      await fs.copyExclusive(fromPath, stagedPath);
      try {
        await fs.rename(stagedPath, toPath);
      } catch (renameError) {
        await fs.unlink(stagedPath).catch(() => undefined);
        throw renameError;
      }
    }
  } else {
    try {
      await fs.link(fromPath, toPath);
    } catch (error) {
      // Another drive, FAT/exFAT and some network filesystems cannot create hard links. An exclusive
      // copy preserves no-clobber semantics there, at the cost of copying the bytes.
      if (!hasCode(error, ['ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EXDEV', 'EINVAL'])) throw error;
      await fs.copyExclusive(fromPath, toPath);
    }
  }
  await fs.unlink(fromPath).catch((error) => console.warn('Export finalized; an extra temporary copy could not be removed', fromPath, error));
}
