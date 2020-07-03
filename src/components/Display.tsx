import * as React from 'react';

import Signal from '../util/Signal';

interface Props {
  signal: Signal<React.ReactNode>,
  log?: boolean,
}

export default React.memo(({ signal, log }: Props) => {
  if (log) console.log('outer render');
  const level = React.useContext(Signal.level);
  signal.reconcile(level);
  return React.useMemo(() => {
    if (log) console.log('inner render');
    return <>{
      signal.value.type === 'ok' ?
        signal.value.ok :
        <pre>{signal.value.err}</pre>
    }</>;
  }, [ signal, signal.version ]);
});
