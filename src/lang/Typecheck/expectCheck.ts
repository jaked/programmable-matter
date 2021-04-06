import * as Immutable from 'immutable';
import * as ESTree from '../ESTree';
import * as Parse from '../Parse';
import Type from '../Type';
import Typecheck from './index';

// TODO(jaked)
// seems like TS should be able to figure it out from the instanceof
function isEnv(env: any): env is Typecheck.Env {
  return env instanceof Immutable.Map;
}

export default function expectCheck({ expr, env, type, actualType, error }: {
  expr: ESTree.Expression | string,
  env?: Typecheck.Env | { [s: string]: string | Type },
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
  const typesMap = new Map<ESTree.Node, Type>();
  const actualTypeValue = Typecheck.check(expr, env, type, typesMap);
  const errorValue = [...typesMap.values()].some(t => t.kind === 'Error');
  if (error !== undefined) expect(errorValue).toBe(error);
  if (actualType) expect(actualTypeValue).toEqual(actualType);
}
