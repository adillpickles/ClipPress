import { Fragment } from 'react';

import { findSearchMatches, useSettingsSearch } from './settingsSearch';
import styles from './Settings.module.css';

/** A setting's name (or its explanation) with the letters the search found in ClipPress blue. */
export default function SearchHighlight({ text }: { text: string }) {
  const query = useSettingsSearch();
  const ranges = findSearchMatches(text, query);
  if (ranges.length === 0) return <span>{text}</span>;
  const parts: { text: string, match: boolean, at: number }[] = [];
  let at = 0;
  for (const [from, to] of ranges) {
    if (from > at) parts.push({ text: text.slice(at, from), match: false, at });
    parts.push({ text: text.slice(from, to), match: true, at: from });
    at = to;
  }
  if (at < text.length) parts.push({ text: text.slice(at), match: false, at });
  // One span, so a row's name stays one piece in its flex row (the marks would each be laid out apart).
  return <span>{parts.map((part) => (part.match ? <mark key={part.at} className={styles['searchMark']}>{part.text}</mark> : <Fragment key={part.at}>{part.text}</Fragment>))}</span>;
}
