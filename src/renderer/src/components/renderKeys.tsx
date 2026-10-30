import { Fragment } from 'react';
import { FaPlus } from 'react-icons/fa';

import Kbd from './Kbd';


// Its own module so Settings can show shortcuts without loading the (lazily loaded) shortcuts dialog.
export default function renderKeys(keys: string[]) {
  return keys.map((key, i) => (
    <Fragment key={key}>
      {i > 0 && <FaPlus style={{ verticalAlign: 'middle', fontSize: '.4em', opacity: 0.8, marginLeft: '.4em', marginRight: '.4em' }} />}
      <Kbd code={key} />
    </Fragment>
  ));
}
