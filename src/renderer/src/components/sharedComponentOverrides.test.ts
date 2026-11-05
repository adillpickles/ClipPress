import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
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
/** A renderer file as `components/Shelf.tsx`, with forward slashes on Windows too. */
const toRendererPath = (file: string) => relative(rendererDir, file).split(sep).join('/');

function listTsx(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listTsx(path);
    return name.endsWith('.tsx') ? [path] : [];
  });
}

/** The longhands a property sets, so `padding` and `padding-bottom` (or `background` and `background-color`) meet. */
const sides = (prefix: string, suffix = '') => ['top', 'right', 'bottom', 'left'].map((side) => `${prefix}-${side}${suffix}`);
const shorthands: Record<string, string[]> = {
  padding: [...sides('padding'), 'padding-inline', 'padding-block'],
  'padding-inline': ['padding-left', 'padding-right'],
  'padding-block': ['padding-top', 'padding-bottom'],
  margin: [...sides('margin'), 'margin-inline', 'margin-block'],
  'margin-inline': ['margin-left', 'margin-right'],
  'margin-block': ['margin-top', 'margin-bottom'],
  inset: ['top', 'right', 'bottom', 'left'],
  border: ['border-width', 'border-style', 'border-color', ...sides('border'), ...sides('border', '-width'), ...sides('border', '-style'), ...sides('border', '-color')],
  'border-width': sides('border', '-width'),
  'border-style': sides('border', '-style'),
  'border-color': sides('border', '-color'),
  ...Object.fromEntries(['top', 'right', 'bottom', 'left'].map((side) => [`border-${side}`, [`border-${side}-width`, `border-${side}-style`, `border-${side}-color`]])),
  'border-radius': ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'],
  background: ['background-color', 'background-image', 'background-position', 'background-size', 'background-repeat'],
  'background-position': ['background-position-x', 'background-position-y'],
  font: ['font-family', 'font-size', 'font-weight', 'font-style', 'line-height'],
  flex: ['flex-grow', 'flex-shrink', 'flex-basis'],
  overflow: ['overflow-x', 'overflow-y'],
  outline: ['outline-width', 'outline-style', 'outline-color'],
  gap: ['row-gap', 'column-gap'],
  'place-items': ['align-items', 'justify-items'],
  'place-content': ['align-content', 'justify-content'],
  'place-self': ['align-self', 'justify-self'],
  transition: ['transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay'],
  animation: ['animation-name', 'animation-duration', 'animation-timing-function', 'animation-delay'],
};
/** A property and everything it sets, two levels down (`border` → `border-top` → `border-top-color`). */
const expand = (property: string): string[] => [property, ...(shorthands[property] ?? []).flatMap((longhand) => [longhand, ...(shorthands[longhand] ?? [])])];

/**
 * Per rule with a selector that is one class and then only pseudo-classes, pseudo-elements and element names
 * (`.x`, `.x:hover`, `.x::picker(select)`, `.x option:checked`): the class, what follows it, and the properties it
 * sets (custom properties aside: setting those is the way to change one).
 */
function readClassRules(cssPath: string) {
  let css = readFileSync(cssPath, 'utf8').replaceAll(/\/\*[\s\S]*?\*\//gu, '');
  // Nested `&…{…}` blocks (Dialog.module.css): taken out, so their rule's own declarations are read.
  for (let previous = ''; previous !== css;) {
    previous = css;
    css = css.replaceAll(/&[^{}]*\{[^{}]*\}/gu, '');
  }
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

/** The classes on the element whose class list takes the `className` prop, in a piece of a component's source. */
function getRootClasses(source: string) {
  const rootExpression = [...source.matchAll(/className=\{([^}]*\bclassName\b[^}]*)\}/gu)].map((match) => match[1]!).join(' ');
  if (rootExpression === '') return undefined;
  // All of the module's when one is picked by a variable, like Button's variant.
  return /styles\[(?!')/u.test(rootExpression) ? 'any' : new Set([...rootExpression.matchAll(/styles\['([\w-]+)'\]/gu)].map((match) => match[1]!));
}

interface SharedComponent { name: string, file: string, rules: ReturnType<typeof readClassRules>, passesTo: string[] }

/** Shared components: a .tsx with its own CSS module that takes a className, and its named parts (`Dialog.Content`). */
function findSharedComponents() {
  const components = readdirSync(componentsDir).flatMap((file): SharedComponent[] => {
    if (!file.endsWith('.tsx')) return [];
    const name = basename(file, '.tsx');
    const source = readFileSync(join(componentsDir, file), 'utf8');
    if (!source.includes(`from './${name}.module.css'`)) return [];
    const moduleRules = readClassRules(join(componentsDir, `${name}.module.css`));
    const pick = (roots: Set<string> | 'any') => moduleRules.filter(({ className }) => roots === 'any' || roots.has(className));
    // Other shared components it hands its className on to (ConfirmButton → Button).
    const passesTo = (text: string) => [...text.matchAll(/<(\w+)(?![.\w])/gu)].map((match) => match[1]!).filter((other) => findElementAttributes(text, other).some((attributes) => /\bclassName\b/u.test(getClassNameExpression(attributes) ?? '')));
    const found: SharedComponent[] = [];
    // Named parts: `export const Part = withClass(…, styles['x']…)` or a forwardRef taking a className.
    for (const match of source.matchAll(/export const (\w+) = /gu)) {
      const end = source.indexOf('\nexport ', match.index + 1);
      const text = source.slice(match.index, end === -1 ? undefined : end);
      const withClass = /withClass\([^,]+,\s*styles\['([\w-]+)'\]/u.exec(text);
      const roots = withClass != null ? new Set([withClass[1]!]) : getRootClasses(text);
      if (roots != null) found.push({ name: `${name}.${match[1]}`, file: join(componentsDir, file), rules: pick(roots), passesTo: passesTo(text) });
    }
    const roots = getRootClasses(source);
    if (roots != null && found.length === 0) found.push({ name, file: join(componentsDir, file), rules: pick(roots), passesTo: passesTo(source) });
    return found;
  });
  // One level of handing on: a class given to ConfirmButton lands on Button too.
  return components.map((component) => ({
    ...component,
    rules: [...component.rules, ...components.filter(({ name }) => component.passesTo.includes(name)).flatMap(({ rules }) => rules)],
  }));
}

/** Each `<Component className={…}>` (or `<Namespace.Part …>`) in the renderer, with the CSS module of its classes. */
function findUsages(components: SharedComponent[]) {
  const usages: { file: string, component: SharedComponent, expression: string, modules: Map<string, string> }[] = [];
  for (const file of listTsx(rendererDir)) {
    const source = readFileSync(file, 'utf8');
    const modules = new Map([...source.matchAll(/import (\w+) from '([^']+\.module\.css)'/gu)].map(([, variable, path]) => [variable!, resolve(dirname(file), path!)]));
    // `import * as Dialog from './Dialog'`: its parts are written `<Dialog.Content …>`.
    const namespaces = new Map([...source.matchAll(/import \* as (\w+) from '[^']*\/(\w+)'/gu)].map(([, alias, moduleName]) => [moduleName!, alias!]));
    for (const component of components.filter(({ file: componentFile }) => componentFile !== file)) {
      const [moduleName, part] = component.name.split('.');
      const alias = namespaces.get(moduleName!);
      // A part is written through its namespace (none imported here: none written).
      const written = part == null ? component.name : (alias != null ? `${alias}\\.${part}` : undefined);
      for (const attributes of written == null ? [] : findElementAttributes(source, written)) {
        const expression = getClassNameExpression(attributes);
        if (expression != null) usages.push({ file, component, expression, modules });
      }
    }
  }
  return usages;
}

function findClashes() {
  const clashes: string[] = [];
  for (const { file, component, expression, modules } of findUsages(findSharedComponents())) {
    for (const [, variable, className] of expression.matchAll(/(\w+)\['([\w-]+)'\]/gu)) {
      const cssPath = modules.get(variable!);
      const callerRules = cssPath == null ? [] : readClassRules(cssPath).filter((rule) => rule.className === className);
      for (const callerRule of callerRules) {
        // The component's rules with the same pseudo-classes and elements after their class weigh the same.
        const ownProperties = new Set(component.rules.filter(({ suffix }) => suffix === callerRule.suffix).flatMap(({ properties }) => properties.flatMap((property) => expand(property))));
        const clash = callerRule.properties.filter((property) => expand(property).some((longhand) => ownProperties.has(longhand)));
        if (clash.length > 0) clashes.push(`${toRendererPath(file)}: <${component.name} className={${variable}['${className}']}> .${className}${callerRule.suffix} sets ${clash.join(', ')}`);
      }
    }
  }
  return clashes;
}

describe('classes handed to shared components', () => {
  it('are all found (a check that finds nothing passes for nothing)', () => {
    const found = new Set(findUsages(findSharedComponents()).map(({ file, component }) => `${toRendererPath(file)} ${component.name}`));
    for (const usage of ['components/ShelfButton.tsx AnchoredPopover', 'components/ShortcutField.tsx Select', 'components/QuickExportSettings.tsx ShortcutField', 'components/GenericDialog.tsx Dialog.Content', 'components/GenericDialog.tsx Dialog.Title', 'components/MissingRecordingDialog.tsx AlertDialog.Content']) {
      expect(found).toContain(usage);
    }
    expect(found.size).toBeGreaterThanOrEqual(10);
  });

  it("read the components' own rules (a check that reads no rules passes for nothing)", () => {
    const ownProperties = (name: string, suffix = '') => findSharedComponents().find((component) => component.name === name)?.rules.filter((rule) => rule.suffix === suffix).flatMap(({ properties }) => properties);
    expect(ownProperties('AnchoredPopover')).toContain('max-width');
    // Read past its nested `&[data-state]` blocks.
    expect(ownProperties('Dialog.Content')).toContain('width');
    expect(ownProperties('Dialog.Title')).toContain('margin');
    // Handed on: ConfirmButton's class lands on Button.
    expect(ownProperties('ConfirmButton')).toContain('padding');
    expect(ownProperties('Select', ':hover')).not.toBeUndefined();
  });

  it("never set a component's own property at the same weight, so the CSS order can't decide", () => {
    expect(findClashes()).toEqual([]);
  });
});
