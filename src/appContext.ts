import * as React from 'react';
import Trace from './util/trace';

export default React.createContext<{ level: number, trace: Trace }>({ level: 0, trace: new Trace() });
