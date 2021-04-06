import * as Immutable from 'immutable';
import Type from '../Type';
import * as Parse from '../Parse';
import * as ESTree from '../ESTree';
import Typecheck from '../Typecheck';
import * as Evaluate from './index';

it('evals', () => {
  // can't use expectEval because function values can't be compared
  const code = `() => { 1; 2; 3 }`;
  const expr = Parse.parseExpression(code);
  const tenv = Typecheck.env();
  const typesMap = new Map<ESTree.Node, Type>();
  Typecheck.synth(expr, tenv, typesMap);
  const venv: Evaluate.Env = Immutable.Map();
  expect(Evaluate.evaluateExpression(expr, typesMap, venv)()).toEqual(3);
});
