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

/** Every word of the query is somewhere in the text (in any order, any case), as the Claude app's settings search. */
export function matchesSearch(query: string, ...texts: ReactNode[]) {
  const words = getQueryWords(query);
  if (words.length === 0) return true;
  const text = texts.map((t) => getNodeText(t)).join(' ').toLocaleLowerCase();
  return words.every((word) => text.includes(word));
}

/** Where each word of the query first appears in a text, in order and merged, for highlighting it. */
export function findSearchMatches(text: string, query: string) {
  const lower = text.toLocaleLowerCase();
  const ranges = getQueryWords(query).flatMap((word) => {
    const at = lower.indexOf(word);
    return at !== -1 ? [[at, at + word.length] as [number, number]] : [];
  });
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last != null && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  return merged;
}
