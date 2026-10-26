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

/** Every word of the query is in the text (in any order, any case). */
export function matchesSearch(query: string, ...texts: ReactNode[]) {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = texts.map((t) => getNodeText(t)).join(' ').toLocaleLowerCase();
  return words.every((word) => text.includes(word));
}
