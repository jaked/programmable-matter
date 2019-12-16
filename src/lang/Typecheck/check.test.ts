import * as ESTree from '../ESTree';
import * as Parser from '../Parser';
import Type from '../Type';
import Typecheck from './index';

describe('check', () => {
  function expectCheckThrows(
    exprOrString: ESTree.Expression | string,
    type: Type,
    env: Typecheck.Env = Typecheck.env()
  ) {
    const expr =
      (typeof exprOrString === 'string') ? Parser.parseExpression(exprOrString)
      : exprOrString;
    expect(() => Typecheck.check(expr, env, type)).toThrow();
  }

  function expectCheck(
    exprOrString: ESTree.Expression | string,
    type: Type,
    env: Typecheck.Env = Typecheck.env()
  ) {
    const expr =
      (typeof exprOrString === 'string') ? Parser.parseExpression(exprOrString)
      : exprOrString;
    expect(Typecheck.check(expr, env, type)).toBe(undefined);
  }

  describe('primitives', () => {
    describe('literals', () => {
      it('succeeds', () => {
        expectCheck('7', Type.number);
      });

      it('throws', () => {
        expectCheckThrows('7', Type.string);
      });
    });

    it('identifiers', () => {
      const env = Typecheck.env({ foo: Type.boolean });
      expectCheck('foo', Type.boolean, env);
    });
  });

  describe('tuples', () => {
    const type = Type.tuple(Type.number, Type.boolean, Type.nullType);

    describe('literals', () => {
      it('succeeds', () => {
        expectCheck('[1, true, null]', type);
      });

      it ('throws', () => {
        expectCheckThrows('[1, "foo", null]', type)
      });
    });

    it('identifiers', () => {
      const env = Typecheck.env({ foo: type });
      expectCheck('foo', type, env)
    });

    it ('throws on long tuples', () => {
      expectCheckThrows('[1, "foo", null, 1]', type)
    });
  });

  describe('arrays', () => {
    const type = Type.array(Type.number);

    describe('literals', () => {
      it('succeeds', () => {
        expectCheck('[1, 2, 3]', type);
      });

      it('throws', () => {
        expectCheckThrows('[1, true]', type);
      });
    });

    it('identifiers', () => {
      const env = Typecheck.env({ foo: type });
      expectCheck('foo', type, env);
    });
  });

  describe('objects', () => {
    const type = Type.object({ bar: Type.undefinedOrNumber });

    it('undefined properties may be omitted', () => {
      expectCheck('({ })', type);
    });

    it('throws on excess properties in literals', () => {
      expectCheckThrows('({ foo: 7 })', type);
    });

    it('permits excess properties in non-literal', () => {
      const env = Typecheck.env({
        foo: Type.object({ baz: Type.number }),
      });
      expectCheck('foo', type, env);
    });
  });

  describe('function expressions', () => {
    const type =
      Type.functionType(
        [ Type.number ],
        Type.number
      );

    it('ok', () => {
      expectCheck('x => x + 7', type);
    });

    it('wrong arg count', () => {
      expectCheckThrows('(x, y) => x + y', type);
    });

    it('wrong body type', () => {
      expectCheckThrows(`x => 'foo'`, type);
    });
  });

  describe('singletons', () => {
    const type = Type.singleton(7);

    it('succeeds', () => {
      expectCheck('7', type);
    });

    it('throws', () => {
      expectCheckThrows('8', type);
    });
  });

  describe('unions', () => {
    const type = Type.union(Type.boolean, Type.number);

    it('succeeds', () => {
      expectCheck('true', type);
      expectCheck('7', type);
    });

    it('throws', () => {
      expectCheckThrows('"foo"', type);
    });

    it('union inside array', () => {
      const type = Type.array(Type.union(Type.boolean, Type.number));
      expectCheck('[ false, 7 ]', type);
    });
  });

  describe('intersections', () => {
    const type = Type.intersection(
      Type.array(Type.number),
      Type.array(Type.singleton(7))
    );

    it('succeeds', () => {
      expectCheck('[ 7 ]', type);
    });

    it('throws', () => {
      expectCheckThrows('[ 9 ]', type);
    });

    it('succeeds for a uniform function', () => {
      const type = Type.intersection(
        Type.functionType([ Type.number ], Type.number),
        Type.functionType([ Type.string ], Type.string),
      );
      expectCheck('x => x', type);
    });

    it('succeeds for a non-uniform function', () => {
      const type = Type.intersection(
        Type.functionType([ Type.singleton('number') ], Type.number),
        Type.functionType([ Type.singleton('string') ], Type.string),
      );
      expectCheck(`x => x === 'number' ? 7 : 'nine'`, type);
    });
  });

  describe('conditional expressions', () => {
    it('ok', () => {
      const env = Typecheck.env({ b: Type.boolean });
      expectCheck('b ? 1 : 2', Type.enumerate(1, 2), env);
    });

    it('ok with statically evaluable test', () => {
      expectCheck('true ? 1 : 2', Type.singleton(1));
    });

    it('ok with statically evaluable test 2', () => {
      const env = Typecheck.env({ x: Type.singleton('foo') });
      expectCheck(`x === 'foo' ? 1 : 2`, Type.singleton(1), env);
    });

    it('narrows type for equality tests', () => {
      const env = Typecheck.env({ s: Type.enumerate('foo', 'bar') });
      expectCheck(`s === 'foo' ? s : 'foo'`, Type.singleton('foo'), env);
    });
  });
});