import * as Immutable from 'immutable';
import { InterfaceMap } from '../model';
import * as Parse from '../parse';
import * as ESTree from '../estree';
import Typecheck from '../typecheck';
import * as Evaluate from './index';

it('evals', () => {
  // can't use expectEval because function values can't be compared
  const code = `() => { 1; 2; 3 }`;
  const expr = Parse.parseExpression(code);
  const tenv = Typecheck.env();
  const interfaceMap: InterfaceMap = new Map();
  Typecheck.synth(expr, tenv, interfaceMap);
  const venv: Evaluate.Env = Immutable.Map();
  expect((Evaluate.evaluateExpression(expr, interfaceMap, venv) as any)()).toEqual(3);
});
