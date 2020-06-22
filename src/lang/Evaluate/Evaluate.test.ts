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

  const error = new Error('error');
  const tenv = Typecheck.env({
    error: Type.error(error),
    bug: Type.functionType([], Type.never),
  });
  const env = Immutable.Map({
    error: error,
    bug: () => { throw 'bug' },
  });

  describe('unary expressions', () => {
    describe('!', () => {
      it('!false', () => {
        expectEval('!false', true);
      });

      it('!error', () => {
        expectEval('!error', true);
      });
    })

    describe('typeof', () => {
      it('typeof 7', () => {
        expectEval('typeof 7', 'number');
      });

      it('typeof error', () => {
        expectEval('typeof error', 'error');
      });
    });
  });

  describe('logical expressions', () => {
    it('short-circuit &&', () => {
      expectEval('false && bug()', false, tenv, env);
    });

    // TODO(jaked)
    // this doesn't actually execute the &&
    // because the return type is already Error
    it('short-circuit error &&', () => {
      expectEval('error && bug()', error, tenv, env);
    });

    it('short-circuit ||', () => {
      expectEval('true || bug()', true, tenv, env);
    });

    it('error is falsy in ||', () => {
      expectEval('error || true', true, tenv, env);
    });
  });

  describe('binary expressions', () => {
    describe('+', () => {
      it('number + error', () => {
        expectEval(`7 + error`, 7, tenv, env);
      });

      it('error + number', () => {
        expectEval(`error + 7`, 7, tenv, env);
      });
    });
  });

  describe('member expressions', () => {
    const tenv = Typecheck.env({
      error: Type.error(error),
      object: Type.object({ foo: Type.boolean }),
      array: Type.array(Type.number),
    });
    const env = Immutable.Map({
      error: error,
      object: { foo: true },
      array: [ 1, 2, 3 ],
    });

    it('error in target propagates', () => {
      expectEval(`error.foo`, error, tenv, env);
    });

    it('error in object property propagates', () => {
      expectEval(`object[error]`, error, tenv, env);
    });

    it('error in array property is undefined', () => {
      expectEval(`array[error]`, undefined, tenv, env);
    });
  });

  describe('conditional expressions', () => {
    it('true', () => {
      expectEval(`true ? 1 : 2`, 1);
    });

    it('false', () => {
      expectEval(`false ? 1 : 2`, 2);
    });

    it('error', () => {
      expectEval(`error ? 1 : 2`, 2);
    });
  });

  describe('call expressions', () => {
    const tenv = Typecheck.env({
      error: Type.error(error),
      g: Type.functionType(
        [ Type.undefinedOrBoolean, Type.boolean, Type.undefinedOrBoolean ],
        Type.boolean
      ),
    });
    const env = Immutable.Map({
      error: error,
      g: (a, b, c) => a || b || c
    });

    it('survives missing trailing args when arg can be undefined', () => {
      expectEval(
        `g(false, true)`,
        true,
        tenv,
        env
      );
    });

    it('survives erroneous args when arg can be undefined', () => {
      expectEval(
        `g(error, false, false)`,
        false,
        tenv,
        env
      );
    });
  });

  describe('JSX', () => {
    const tenv = Typecheck.env({
      Foo: Type.functionType([ Type.object({ bar: Type.boolean })], Type.boolean),
      Bar: Type.abstract('React.FC', Type.object({ baz: Type.undefinedOrString })),
      Baz: Type.abstract('React.FC', Type.object({ quux: Type.string })),
    });
    const env = Immutable.Map({
      Foo: ({ bar }) => bar,
      Bar: ({ children, baz }) => baz ? [ baz, ...children] : children,
    });

    it('attr with no value', () => {
      // TODO(jaked)
      // this depends on Evaluate hack that applies Foo
      expectEval('<Foo bar={false} />', false, tenv, env);
      expectEval('<Foo bar />', true, tenv, env);
    });

    it('survives children with type errors', () => {
      expectEval(
        `<Bar>this<Baz quux={7} />that</Bar>`,
        ['this', undefined, 'that'],
        tenv,
        env
      );
    });

    it('survives attrs with type errors if attr can be undefined', () => {
      expectEval(
        `<Bar>this<Bar baz={7} />that</Bar>`,
        ['this', [], 'that'],
        tenv,
        env
      );
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
