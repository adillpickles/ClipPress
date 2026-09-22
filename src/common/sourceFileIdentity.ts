interface FileIdentity {
  dev: bigint,
  ino: bigint,
}

/** stat follows symlinks and junctions; device/inode also catches hard links and Windows aliases. */
export default async function findSourceFileCollision({ outPaths, protectedPaths, stat }: {
  outPaths: readonly (string | undefined)[],
  protectedPaths: readonly (string | undefined)[],
  stat: (path: string) => Promise<FileIdentity>,
}) {
  const readIdentity = async (path: string) => {
    try {
      const { dev, ino } = await stat(path);
      // Some virtual filesystems do not expose file identities.
      return ino === 0n ? undefined : `${dev}:${ino}`;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
      throw error;
    }
  };
  const sourcePaths = [...new Set(protectedPaths.filter((path): path is string => path != null))];
  const sourceIds = new Set((await Promise.all(sourcePaths.map((path) => readIdentity(path)))).filter((id) => id != null));
  for (const path of outPaths.filter((value): value is string => value != null)) {
    // eslint-disable-next-line no-await-in-loop
    const identity = await readIdentity(path);
    if (identity != null && sourceIds.has(identity)) return path;
  }
  return undefined;
}
