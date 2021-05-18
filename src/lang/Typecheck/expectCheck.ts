import * as Immutable from 'immutable';
import { Interface } from '../../model';
import * as ESTree from '../ESTree';
import * as Parse from '../Parse';
import Type from '../Type';
import Typecheck from './index';

const intfType = (intf: Interface) =>
  intf.type === 'ok' ? intf.ok.type : Type.error(intf.err);

// TODO(jaked)
// seems like TS should be able to figure it out from the instanceof
function isEnv(env: any): env is Typecheck.Env {
  return env instanceof Immutable.Map;
}

export default function expectCheck({ expr, env, type, actualType, error }: {
  expr: ESTree.Expression | string,
  env?: Typecheck.Env | { [s: string]: string | Type | Interface },
  type: Type | string,
  actualType?: Type,
  error?: boolean,
}) {
  expr = (typeof expr === 'string') ? Parse.parseExpression(expr) : expr;
  env = env ?
    (isEnv(env) ?
      env :
      Typecheck.env(env as any)) :
    Typecheck.env();
  type = (typeof type === 'string') ? Parse.parseType(type) : type;
  error = (error !== undefined) ? error : false;
  const interfaceMap = new Map<ESTree.Node, Interface>();
  const intf = Typecheck.check(expr, env, type, interfaceMap);
  const errorValue = [...interfaceMap.values()].some(intf => intf.type === 'err');
  if (error !== undefined) expect(errorValue).toBe(error);
  if (actualType) expect(intfType(intf)).toEqual(actualType);
}
