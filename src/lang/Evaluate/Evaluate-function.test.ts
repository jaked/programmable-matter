import * as Immutable from 'immutable';
import { Interface } from '../../model';
import * as Parse from '../Parse';
import * as ESTree from '../ESTree';
import Typecheck from '../Typecheck';
import * as Dyncheck from '../Dyncheck';
import * as Evaluate from './index';

it('evals', () => {
  // can't use expectEval because function values can't be compared
  const code = `() => { 1; 2; 3 }`;
  const expr = Parse.parseExpression(code);
  const tenv = Typecheck.env();
  const interfaceMap = new Map<ESTree.Node, Interface>();
  Typecheck.synth(expr, tenv, interfaceMap);
  const denv: Dyncheck.Env = Immutable.Map();
  const dynamicMap = new Map<ESTree.Node, boolean>();
  Dyncheck.expression(expr, interfaceMap, denv, dynamicMap)
  const venv: Evaluate.Env = Immutable.Map();
  expect((Evaluate.evaluateExpression(expr, interfaceMap, dynamicMap, venv) as any)()).toEqual(3);
});
