export interface ExportedFile {
  path: string,
  created: boolean,
}

/** Only outputs written by this run belong in success counts, notifications and cleanup. */
export function getWrittenExportPaths({ files, merged, deletedSegments = false }: {
  files: readonly ExportedFile[],
  merged?: ExportedFile | undefined,
  deletedSegments?: boolean | undefined,
}) {
  return [
    ...(deletedSegments ? [] : files.filter((file) => file.created).map((file) => file.path)),
    ...(merged?.created ? [merged.path] : []),
  ];
}
