import { createContext, isValidElement, useContext } from 'react';
import type { ReactNode } from 'react';

/** What the Settings search box holds: rows that don't match it hide (an empty query shows everything). */
export const SettingsSearchContext = createContext('');

export const useSettingsSearch = () => useContext(SettingsSearchContext);

/** The words in a setting's name, description or details (React nodes), for searching. */
export function getNodeText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map((child) => getNodeText(child)).join(' ');
  if (isValidElement<{ children?: ReactNode }>(node)) return getNodeText(node.props.children);
  return '';
}

const getQueryWords = (query: string) => query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
const isWordCharacter = (char: string | undefined) => char != null && /[\p{L}\p{N}]/u.test(char);

/** Where a word typed is the start of a word of the text (as Windows' and macOS' settings search): "p" finds "playing". */
function findWordStarts(lowerText: string, word: string) {
  const starts: number[] = [];
  for (let at = lowerText.indexOf(word); at >= 0; at = lowerText.indexOf(word, at + 1)) {
    if (!isWordCharacter(lowerText[at - 1])) starts.push(at);
  }
  return starts;
}

/** Every word of the query starts a word of the text (in any order, any case). */
export function matchesSearch(query: string, ...texts: ReactNode[]) {
  const words = getQueryWords(query);
  if (words.length === 0) return true;
  const text = texts.map((t) => getNodeText(t)).join(' ').toLocaleLowerCase();
  return words.every((word) => findWordStarts(text, word).length > 0);
}

/** The parts of a text the query's words found, in order and merged, for highlighting them. */
export function findSearchMatches(text: string, query: string) {
  const lower = text.toLocaleLowerCase();
  const ranges = getQueryWords(query).flatMap((word) => findWordStarts(lower, word).map((at): [number, number] => [at, at + word.length]));
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last != null && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  return merged;
}
