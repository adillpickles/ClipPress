import { describe, expect, it } from 'vitest';

import { getLanguageFromSystem, mapLang } from './i18n.js';

describe('getLanguageFromSystem', () => {
  it("reads Windows' preferred languages the way app.getLocale() named them", () => {
    expect(getLanguageFromSystem(['es-MX', 'en-US'])).toBe('es-MX');
    expect(getLanguageFromSystem(['en-US'])).toBe('en-US');
    expect(getLanguageFromSystem(['de'])).toBe('de');
    expect(getLanguageFromSystem(['pt-BR'])).toBe('pt-BR');
    expect(getLanguageFromSystem(['es-419'])).toBe('es-419');
    expect(getLanguageFromSystem(['zh-Hans-CN'])).toBe('zh-CN');
    expect(getLanguageFromSystem(['zh-Hant-TW'])).toBe('zh-TW');
    expect(getLanguageFromSystem(['zh-Hant-HK'])).toBe('zh-TW');
    expect(getLanguageFromSystem(['zh-MO'])).toBe('zh-HK');
    expect(getLanguageFromSystem(['sr-Latn-RS'])).toBe('sr-RS');
    expect(getLanguageFromSystem([])).toBe('en');
    expect(getLanguageFromSystem([''])).toBe('en');
  });

  it("lands on ClipPress's own language folders", () => {
    expect(mapLang(getLanguageFromSystem(['es-ES']) as never)).toBe('es');
    expect(mapLang(getLanguageFromSystem(['zh-Hans-CN']) as never)).toBe('zh_Hans');
    expect(mapLang(getLanguageFromSystem(['zh-Hant-TW']) as never)).toBe('zh_Hant');
    expect(mapLang(getLanguageFromSystem(['pt-BR']) as never)).toBe('pt_BR');
  });
});
