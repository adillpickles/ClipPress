import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * A class handed to a shared component (`<AnchoredPopover className={…}>`) that sets one of the component's own
 * properties at the same weight (`.name` against the component's `.popover`, `.name:hover` against its `.x:hover`)
 * loses or wins by the bundle's CSS order alone: an unrelated import moved the clips list's `max-width: none` before
 * the popover's own `max-width` and the list spilled out of its box. A component that lets callers change a property
 * takes it as a CSS variable instead, and a caller that restyles a component scopes its rules (a parent class) so
 * they outweigh the component's. This checks the classes callers hand to shared components directly.
 */

const componentsDir = dirname(fileURLToPath(import.meta.url));
const rendererDir = resolve(componentsDir, '..');

function listTsx(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listTsx(path);
    return name.endsWith('.tsx') ? [path] : [];
  });
}

/** The longhands a property sets, so `padding` and `padding-bottom` (or `background` and `background-color`) meet. */
const shorthands: Record<string, string[]> = {
  padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
  margin: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
  inset: ['top', 'right', 'bottom', 'left'],
  border: ['border-width', 'border-style', 'border-color', 'border-top', 'border-right', 'border-bottom', 'border-left'],
  'border-radius': ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'],
  background: ['background-color', 'background-image', 'background-position', 'background-position-x', 'background-position-y', 'background-size', 'background-repeat'],
  font: ['font-family', 'font-size', 'font-weight', 'font-style', 'line-height'],
  gap: ['row-gap', 'column-gap'],
  transition: ['transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay'],
  animation: ['animation-name', 'animation-duration', 'animation-timing-function', 'animation-delay'],
};
const expand = (property: string) => [property, ...(shorthands[property] ?? [])];

/**
 * Per rule with a selector that is one class and then only pseudo-classes, pseudo-elements and element names
 * (`.x`, `.x:hover`, `.x::picker(select)`, `.x option:checked`): the class, what follows it, and the properties it
 * sets (custom properties aside: setting those is the way to change one).
 */
function readClassRules(cssPath: string) {
  const css = readFileSync(cssPath, 'utf8').replaceAll(/\/\*[\s\S]*?\*\//gu, '');
  const rules: { className: string, suffix: string, properties: string[] }[] = [];
  for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/gu)) {
    const properties = body!.split(';').map((declaration) => declaration.split(':')[0]!.trim()).filter((property) => property !== '' && !property.startsWith('--'));
    for (const selector of selectors!.split(',').map((s) => s.trim())) {
      const match = /^\.([\w-]+)((?:(?:::?[\w-]+(?:\([^)]*\))?)|(?:\s+[a-z]+))*)$/u.exec(selector);
      if (match != null) rules.push({ className: match[1]!, suffix: match[2]!.replaceAll(/\s+/gu, ' '), properties });
    }
  }
  return rules;
}

/** Where the comment or string starting at `start` ends, or undefined when none starts there. */
function skipCommentOrString(source: string, start: number) {
  if (source.startsWith('//', start)) return source.indexOf('\n', start);
  if (source.startsWith('/*', start)) return source.indexOf('*/', start) + 1;
  const quote = source[start];
  if (quote !== '"' && quote !== "'" && quote !== '`') return undefined;
  let end = start + 1;
  while (end < source.length && source[end] !== quote) end += source[end] === '\\' ? 2 : 1;
  return end;
}

/** The attributes of each `<Name …>` in a file, up to its own `>` (not one in `{…}`, a string or a comment). */
function findElementAttributes(source: string, name: string) {
  const found: string[] = [];
  for (const match of source.matchAll(new RegExp(`<${name}(?![.\\w])`, 'gu'))) {
    let depth = 0;
    let end = match.index + match[0].length;
    for (; end < source.length; end += 1) {
      const skipped = skipCommentOrString(source, end);
      if (skipped != null) {
        end = skipped;
      } else if (source[end] === '{') {
        depth += 1;
      } else if (source[end] === '}') {
        depth -= 1;
      } else if (depth === 0 && source[end] === '>') {
        break;
      }
    }
    found.push(source.slice(match.index, end));
  }
  return found;
}

/** What's in the element's own `className={…}` (not one of an element inside its attributes), balanced braces and all. */
function getClassNameExpression(attributes: string) {
  let depth = 0;
  for (let i = 0; i < attributes.length; i += 1) {
    const skipped = skipCommentOrString(attributes, i);
    if (skipped != null) {
      i = skipped;
    } else if (attributes[i] === '{') {
      depth += 1;
    } else if (attributes[i] === '}') {
      depth -= 1;
    } else if (depth === 0 && attributes.startsWith('className={', i)) {
      const start = i + 'className={'.length;
      let inner = 1;
      for (let end = start; end < attributes.length; end += 1) {
        if (attributes[end] === '{') inner += 1;
        if (attributes[end] === '}') inner -= 1;
        if (inner === 0) return attributes.slice(start, end);
      }
    }
  }
  return undefined;
}

function findClashes() {
  // Shared components: a .tsx with its own CSS module that takes a className.
  const components = readdirSync(componentsDir).flatMap((file) => {
    if (!file.endsWith('.tsx')) return [];
    const name = basename(file, '.tsx');
    const source = readFileSync(join(componentsDir, file), 'utf8');
    if (!source.includes(`from './${name}.module.css'`) || !source.includes('className')) return [];
    // A caller's class lands on the element whose class list takes the `className` prop, beside the classes listed
    // there (all of the module's, when one is picked by a variable, like Button's variant).
    const rootExpression = [...source.matchAll(/className=\{([^}]*\bclassName\b[^}]*)\}/gu)].map((match) => match[1]!).join(' ');
    const rootClasses = new Set([...rootExpression.matchAll(/styles\['([\w-]+)'\]/gu)].map((match) => match[1]!));
    // No class list takes it: callers can't hand it one.
    if (rootExpression === '') return [];
    const anyClass = /styles\[(?!')/u.test(rootExpression);
    const rules = readClassRules(join(componentsDir, `${name}.module.css`)).filter(({ className }) => anyClass || rootClasses.has(className));
    return [{ name, file: join(componentsDir, file), rules }];
  });

  const clashes: string[] = [];
  for (const file of listTsx(rendererDir)) {
    const source = readFileSync(file, 'utf8');
    const modules = new Map([...source.matchAll(/import (\w+) from '([^']+\.module\.css)'/gu)].map(([, variable, path]) => [variable!, resolve(dirname(file), path!)]));
    for (const component of components.filter(({ file: componentFile }) => componentFile !== file)) {
      const expressions = findElementAttributes(source, component.name).flatMap((attributes) => getClassNameExpression(attributes) ?? []);
      for (const expression of expressions) {
        for (const [, variable, className] of expression.matchAll(/(\w+)\['([\w-]+)'\]/gu)) {
          const cssPath = modules.get(variable!);
          const callerRules = cssPath == null ? [] : readClassRules(cssPath).filter((rule) => rule.className === className);
          for (const callerRule of callerRules) {
            // The component's rules with the same pseudo-classes and elements after their class weigh the same.
            const ownProperties = new Set(component.rules.filter(({ suffix }) => suffix === callerRule.suffix).flatMap(({ properties }) => properties.flatMap((property) => expand(property))));
            const clash = callerRule.properties.filter((property) => expand(property).some((longhand) => ownProperties.has(longhand)));
            if (clash.length > 0) clashes.push(`${relative(rendererDir, file)}: <${component.name} className={${variable}['${className}']}> .${className}${callerRule.suffix} sets ${clash.join(', ')}`);
          }
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
