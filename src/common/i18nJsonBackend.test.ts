import { describe, expect, it } from 'vitest';

import createJsonFileBackend from './i18nJsonBackend.js';

const readWith = async (files: Record<string, string>, language: string) => new Promise<{ err: unknown, data: unknown }>((resolve) => {
  const backend = createJsonFileBackend({
    loadPath: (lng: string, ns: string) => `${lng}/${ns}.json`,
    readText: async (path: string) => {
      const text = files[path];
      if (text == null) throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
      return text;
    },
  });
  backend.read(language, 'translation', (err: unknown, data: unknown) => resolve({ err, data }));
});

describe('the language file reader', () => {
  it("reads a language's JSON file", async () => {
    expect(await readWith({ 'de/translation.json': '{"Open":"Öffnen"}' }, 'de')).toEqual({ err: null, data: { Open: 'Öffnen' } });
  });
  it('reports a missing or broken file, so i18next falls back', async () => {
    const missing = await readWith({}, 'en-US');
    expect(missing.err).toBeInstanceOf(Error);
    expect(missing.data).toBe(false);
    const broken = await readWith({ 'de/translation.json': '{"Open":' }, 'de');
    expect(broken.err).toBeInstanceOf(Error);
    expect(broken.data).toBe(false);
  });
  it('answers at once with a synchronous reader, so init can finish before the first render', () => {
    const backend = createJsonFileBackend({ loadPath: (lng: string, ns: string) => `${lng}/${ns}.json`, readText: () => '{"Open":"Ouvrir"}' });
    let answer: unknown;
    backend.read('fr', 'translation', (_err: unknown, data: unknown) => { answer = data; });
    expect(answer).toEqual({ Open: 'Ouvrir' });
    const failing = createJsonFileBackend({ loadPath: (lng: string, ns: string) => `${lng}/${ns}.json`, readText: () => { throw new Error('ENOENT'); } });
    let failure: unknown;
    failing.read('xx', 'translation', (err: unknown, data: unknown) => { failure = { err, data }; });
    expect(failure).toEqual({ err: expect.any(Error), data: false });
  });
});
