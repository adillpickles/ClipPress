import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A class handed to a shared component (`<AnchoredPopover className={…}>`) that sets one of the component's own
 * properties with a plain `.name` rule weighs the same as the component's rule, so whichever the bundle's CSS puts
 * last wins: an unrelated import moved the clips list's `max-width: none` before the popover's own `max-width` and it
 * spilled out of its box. A component that lets callers change a property takes it as a CSS variable instead, and a
 * caller that restyles a component scopes its rules (a parent class) so they outweigh the component's.
 */

const componentsDir = dirname(new URL(import.meta.url).pathname);
const rendererDir = resolve(componentsDir, '..');

function listTsx(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listTsx(path);
    return name.endsWith('.tsx') ? [path] : [];
  });
}

/** The properties each plain `.name` rule sets (custom properties aside: setting those is the way to change one). */
function readPlainClassRules(cssPath: string) {
  const css = readFileSync(cssPath, 'utf8').replaceAll(/\/\*[\s\S]*?\*\//gu, '');
  const rules = new Map<string, Set<string>>();
  for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/gu)) {
    const properties = body!.split(';').map((declaration) => declaration.split(':')[0]!.trim()).filter((property) => property !== '' && !property.startsWith('--'));
    for (const selector of selectors!.split(',').map((s) => s.trim())) {
      const className = /^\.([\w-]+)$/u.exec(selector)?.[1];
      if (className != null) rules.set(className, new Set([...(rules.get(className) ?? []), ...properties]));
    }
  }
  return rules;
}

function findClashes() {
  // Shared components: a .tsx with its own CSS module that takes a className.
  const components = readdirSync(componentsDir).flatMap((file) => {
    if (!file.endsWith('.tsx')) return [];
    const name = basename(file, '.tsx');
    const source = readFileSync(join(componentsDir, file), 'utf8');
    const cssPath = join(componentsDir, `${name}.module.css`);
    if (!source.includes(`from './${name}.module.css'`) || !source.includes('className')) return [];
    const ownProperties = new Set([...readPlainClassRules(cssPath).values()].flatMap((properties) => [...properties]));
    return [{ name, file: join(componentsDir, file), ownProperties }];
  });

  const clashes: string[] = [];
  for (const file of listTsx(rendererDir)) {
    const source = readFileSync(file, 'utf8');
    const modules = new Map([...source.matchAll(/import (\w+) from '([^']+\.module\.css)'/gu)].map(([, variable, path]) => [variable!, resolve(dirname(file), path!)]));
    for (const component of components.filter(({ file: componentFile }) => componentFile !== file)) {
      // The class expression of each `<Component … className={…}>`.
      const usages = [...source.matchAll(new RegExp(`<${component.name}(?![.\\w])[^>]*?className=\\{([^}]*)\\}`, 'gsu'))].map((match) => match[1]!);
      for (const usage of usages) {
        for (const [, variable, className] of usage.matchAll(/(\w+)\['([\w-]+)'\]/gu)) {
          const cssPath = modules.get(variable!);
          const clash = cssPath == null ? [] : [...(readPlainClassRules(cssPath).get(className!) ?? [])].filter((property) => component.ownProperties.has(property));
          if (clash.length > 0) clashes.push(`${relative(rendererDir, file)}: <${component.name} className={${variable}['${className}']}> sets ${clash.join(', ')}`);
        }
      }
    }
  }
  return clashes;
}

describe('classes handed to shared components', () => {
  it("never set a component's own property at the same weight, so the CSS order can't decide", () => {
    expect(findClashes()).toEqual([]);
  });
});
