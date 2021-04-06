import * as Immutable from 'immutable';
import * as ESTree from '../ESTree';
import Type from '../Type';
import * as Parse from '../Parse';
import Typecheck from '../Typecheck';
import * as Evaluate from './index';
import { bug } from '../../util/bug';

// TODO(jaked)
// seems like TS should be able to figure it out from the instanceof
function isTEnv(env: any): env is Typecheck.Env {
  return env instanceof Immutable.Map;
}
function isVEnv(env: any): env is Evaluate.Env {
  return env instanceof Immutable.Map;
}

export default function expectEval({ expr, tenv, venv, value } : {
  expr: ESTree.Expression | string,
  tenv?: Typecheck.Env | { [s: string]: string | Type },
  venv?: Evaluate.Env | { [s: string]: any },
  value: any,
}) {
  expr = (typeof expr === 'string') ? Parse.parseExpression(expr) : expr;
  tenv = tenv ?
    (isTEnv(tenv) ?
      tenv :
      Typecheck.env(tenv as any)) :
    Typecheck.env();
  venv = venv ?
    (isVEnv(venv) ?
      venv :
      (Immutable.Map(venv))) :
    (Immutable.Map());
  const typeMap = new Map<ESTree.Node, Type>();
  Typecheck.synth(expr, tenv, typeMap);

  // TODO(jaked) not sure why this is necessary
  // maybe because Immutable.Map construction doesn't constrain types?
  if (!isVEnv(venv)) bug(`expected VEnv`);

  expect(Evaluate.evaluateExpression(expr, typeMap, venv)).toEqual(value)
}
