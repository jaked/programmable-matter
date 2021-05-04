import * as Immutable from 'immutable';
import * as ESTree from '../ESTree';
import Type from '../Type';
import * as Parse from '../Parse';
import Typecheck from '../Typecheck';
import * as Dyncheck from '../Dyncheck';
import * as Evaluate from './index';
import { bug } from '../../util/bug';

// TODO(jaked)
// seems like TS should be able to figure it out from the instanceof
function isTEnv(env: any): env is Typecheck.Env {
  return env instanceof Immutable.Map;
}
function isDEnv(env: any): env is Dyncheck.Env {
  return env instanceof Immutable.Map;
}
function isVEnv(env: any): env is Evaluate.Env {
  return env instanceof Immutable.Map;
}

export default function expectEval({ expr, tenv, denv, venv, value } : {
  expr: ESTree.Expression | string,
  value: any,
  tenv?: Typecheck.Env | { [s: string]: string | Type },
  denv?: Dyncheck.Env | { [s: string]: boolean },
  venv?: Evaluate.Env | { [s: string]: any },
}) {
  expr = (typeof expr === 'string') ? Parse.parseExpression(expr) : expr;
  tenv = tenv ?
    (isTEnv(tenv) ?
      tenv :
      Typecheck.env(tenv as any)) :
    Typecheck.env();
  denv = denv ?
    (isDEnv(denv) ?
      denv :
      Immutable.Map(denv)) :
    (Immutable.Map());
  venv = venv ?
    (isVEnv(venv) ?
      venv :
      (Immutable.Map(venv))) :
    (Immutable.Map());
  const interfaceMap = new Map<ESTree.Node, Type>();
  Typecheck.synth(expr, tenv, interfaceMap);
  const dynamicMap = new Map<ESTree.Node, boolean>();
  Dyncheck.expression(expr, interfaceMap, denv, dynamicMap);

  // TODO(jaked) not sure why this is necessary
  // maybe because Immutable.Map construction doesn't constrain types?
  if (!isVEnv(venv)) bug(`expected VEnv`);

  expect(Evaluate.evaluateExpression(expr, interfaceMap, dynamicMap, venv)).toEqual(value)
}
