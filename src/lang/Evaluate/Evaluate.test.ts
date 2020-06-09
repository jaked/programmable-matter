import * as Immutable from 'immutable';
import * as ESTree from '../ESTree';
import Type from '../Type';
import * as Parse from '../Parse';
import Typecheck from '../Typecheck';
import * as Evaluate from './index';

describe('evaluateExpression', () => {
  function expectEval(
    exprOrString: ESTree.Expression | string,
    value: any,
    tenv: Typecheck.Env = Typecheck.env(),
    env: Evaluate.Env = Immutable.Map()
  ) {
    const expr =
      (typeof exprOrString === 'string') ? Parse.parseExpression(exprOrString)
      : exprOrString;
    const annots = new Map<unknown, Type>();
    Typecheck.synth(expr, tenv, annots);
    expect(Evaluate.evaluateExpression(expr, annots, env)).toEqual(value)
  }

  describe('conditional expressions', () => {
    it('true', () => {
      expectEval(`true ? 1 : 2`, 1);
    });

    it('false', () => {
      expectEval(`false ? 1 : 2`, 2);
    });
  });

  describe('unary expressions', () => {
    it('!', () => {
      expectEval('!false', true);
    });

    it('typeof', () => {
      expectEval('typeof 7', 'number');
    });
  });

  describe('short-circult Booleans', () => {
    const tenv = Typecheck.env({
      bug: Type.functionType([], Type.never)
    });
    const env = Immutable.Map({
      bug: () => { throw 'bug' }
    });

    it('&&', () => {
      expectEval('false && bug()', false, tenv, env);
    });

    it('||', () => {
      expectEval('true || bug()', true, tenv, env);
    });
  });

  describe('JSX', () => {
    const tenv = Typecheck.env({
      Foo: Type.functionType([ Type.object({ bar: Type.boolean })], Type.boolean)
    });
    const env = Immutable.Map({
      Foo: ({ bar }) => bar
    });

    it('attr with no value', () => {
      expectEval('<Foo bar={false} />', false, tenv, env);
      expectEval('<Foo bar />', true, tenv, env);
    });
  });

  describe('Map#filter', () => {
    it('works', () => {
      expectEval(
        `foo.filter((v, k) => k === 'bar').size`,
        1,
        Typecheck.env({
          foo: Type.map(Type.string, Type.number),
        }),
        Immutable.Map({
          foo: Immutable.Map({
            bar: 7,
            baz: 9,
          })
        })
      );
    });
  });
});
