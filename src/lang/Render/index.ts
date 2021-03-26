import * as Immutable from 'immutable';
import * as React from 'react';

import Signal from '../../util/Signal';
import Type from '../Type';
import initEnv from './initEnv';

export type TypeEnv = Immutable.Map<string, Type>;
export type ValueEnv = Immutable.Map<string, unknown>;
export type DynamicEnv = Immutable.Map<string, boolean>;

export const initTypeEnv: TypeEnv = initEnv.map(({ type }) => type);
export const initValueEnv: ValueEnv = initEnv.map(({ value, dynamic }) =>
  dynamic ? value : Signal.ok(value)
);
export const initDynamicEnv: DynamicEnv = initEnv.map(({ dynamic }) => dynamic);

export const context = React.createContext<'screen' | 'server'>('screen');
