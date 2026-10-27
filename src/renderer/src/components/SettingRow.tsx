import type { ReactNode } from 'react';

import HelpTip from './HelpTip';
import SearchHighlight from './SearchHighlight';
import { matchesSearch, useSettingsSearch } from './settingsSearch';
import styles from './Settings.module.css';

/**
 * One setting: a short name on the left, the control on the right. What it does is behind a small "i"
 * (hover or focus), so the screen isn't full of explanations; a live value (a folder, a percentage, a status)
 * stays visible under the name.
 */
export default function SettingRow({ label, description, details, value, children, controlId, keywords }: {
  label: ReactNode,
  /** What the setting does: shown on hover or focus of the "i". */
  description?: ReactNode,
  /** More about it, shown in the same bubble under the description. */
  details?: ReactNode,
  /** The current value or state, always shown under the name. */
  value?: ReactNode,
  children: ReactNode,
  /** The id of the control, so that the label focuses it. */
  controlId?: string | undefined,
  /** More words the Settings search finds it by. */
  keywords?: string | undefined,
}) {
  const query = useSettingsSearch();
  if (!matchesSearch(query, label, description, details, keywords)) return null;
  const hasHelp = description != null || details != null;
  // Found by its explanation alone: the "i" lights up, since the name shows nothing found.
  const foundInHelp = hasHelp && query.trim() !== '' && !matchesSearch(query, label) && matchesSearch(query, label, description, details);
  const highlight = (node: ReactNode) => (typeof node === 'string' ? <SearchHighlight text={node} /> : node);

  return (
    <div className={styles['row']} data-setting-row="">
      <div className={styles['rowText']}>
        <div className={styles['rowLabel']}>
          {controlId != null ? <label htmlFor={controlId}>{highlight(label)}</label> : highlight(label)}
          {hasHelp && (
            <HelpTip lit={foundInHelp}>
              {description != null && <p>{highlight(description)}</p>}
              {details != null && <p>{highlight(details)}</p>}
            </HelpTip>
          )}
        </div>
        {value != null && <div className={styles['rowValue']}>{value}</div>}
      </div>
      <div className={styles['rowControl']}>{children}</div>
    </div>
  );
}
