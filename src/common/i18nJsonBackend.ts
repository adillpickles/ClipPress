import type { BackendModule, ReadCallback } from 'i18next';

/**
 * An i18next backend that reads a language's JSON file, as i18next-fs-backend did for ClipPress's `.json` files, without
 * loading that package's YAML, JSON5 and JSONC parsers at every start (~7 ms in each process). A missing file (a
 * language with no translation of its own) is reported to i18next, which then falls back. With a synchronous reader
 * (and i18next's `initAsync: false`) the language is there as soon as `init` returns, so the first render has its text.
 */
export default function createJsonFileBackend({ loadPath, readText }: {
  loadPath: (language: string, namespace: string) => string,
  readText: (path: string) => string | Promise<string>,
}): BackendModule {
  return {
    type: 'backend',
    init: () => undefined,
    read: (language: string, namespace: string, callback: ReadCallback) => {
      const fail = (err: unknown) => callback(err instanceof Error ? err : new Error(String(err)), false);
      const parse = (text: string) => {
        let data: unknown;
        try {
          data = JSON.parse(text);
        } catch (err) {
          fail(err);
          return;
        }
        callback(null, data as Parameters<ReadCallback>[1]);
      };
      let result: string | Promise<string>;
      try {
        result = readText(loadPath(language, namespace));
      } catch (err) {
        fail(err);
        return;
      }
      if (typeof result === 'string') parse(result);
      else result.then(parse, fail);
    },
  };
}
