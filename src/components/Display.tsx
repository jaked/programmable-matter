import * as React from 'react';

import Signal from '../util/Signal';
import AppContext from '../appContext';

interface Props {
  signal: Signal<React.ReactNode>,
  log?: boolean,
}

export default React.memo(({ signal, log }: Props) => {
  if (log) console.log('outer render');
  const { level, trace } = React.useContext(AppContext);
  signal.reconcile(trace, level);
  return React.useMemo(() => {
    if (log) console.log('inner render');
    return <>{
      signal.value.type === 'ok' ?
        signal.value.ok :
        <pre>{signal.value.err}</pre>
    }</>;
  }, [ signal, signal.version ]);
});
