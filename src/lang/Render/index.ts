import * as Immutable from 'immutable';
import * as React from 'react';

import Signal from '../../util/Signal';

export { initTypeEnv } from './initTypeEnv';
export { initValueEnv } from './initValueEnv';

export type Env = Immutable.Map<string, Signal<any>>;

export const context = React.createContext<'screen' | 'server'>('screen');
