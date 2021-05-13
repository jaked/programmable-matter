import * as Immutable from 'immutable';
import { Interface } from '../../model';
import * as Parse from '../Parse';
import * as ESTree from '../ESTree';
import Typecheck from '../Typecheck';
import * as Evaluate from './index';

it('evals', () => {
  // can't use expectEval because function values can't be compared
  const code = `() => { 1; 2; 3 }`;
  const expr = Parse.parseExpression(code);
  const tenv = Typecheck.env();
  const interfaceMap = new Map<ESTree.Node, Interface>();
  Typecheck.synth(expr, tenv, interfaceMap);
  const dynamicMap = new Map<ESTree.Node, boolean>();
  const venv: Evaluate.Env = Immutable.Map();
  expect((Evaluate.evaluateExpression(expr, interfaceMap, venv) as any)()).toEqual(3);
});
