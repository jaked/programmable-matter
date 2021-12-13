import * as Immutable from 'immutable';
import Interface from '../model/interface';
import { InterfaceMap } from '../model';
import * as ESTree from '../estree';
import * as Parse from '../parse';
import Type from '../type';
import Typecheck from './index';

// TODO(jaked)
// seems like TS should be able to figure it out from the instanceof
function isEnv(env: any): env is Typecheck.Env {
  return env instanceof Immutable.Map;
}

export default function expectSynth({ expr, env, type, error } : {
  expr: ESTree.Expression | string,
  env?: Typecheck.Env | { [s: string]: string | Type | Interface },
  type?: Type | string,
  error?: boolean
}) {
  expr = (typeof expr === 'string') ? Parse.parseExpression(expr) : expr;
  env = env ?
    (isEnv(env) ?
      env :
      Typecheck.env(env as any)) :
    Typecheck.env();
  type = (typeof type === 'string') ? Parse.parseType(type) : type;
  const interfaceMap: InterfaceMap = new Map();
  const intf = Typecheck.synth(expr, env, interfaceMap);
  const errorValue = [...interfaceMap.values()].some(intf => intf.type === 'err');
  if (error !== undefined) expect(errorValue).toBe(error);
  if (type) expect(Interface.type(intf)).toEqual(type);
}
