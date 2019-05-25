import * as Immutable from 'immutable';
import * as AcornJsxAst from './acornJsxAst';
import * as Parser from './Parser';
import * as Type from './Type';
import * as Typecheck from './Typecheck';

describe('check', () => {
  function expectCheckToThrow(
    expr: AcornJsxAst.Expression,
    env: Typecheck.Env,
    type: Type.Type
  ) {
    expect(() => Typecheck.check(expr, env, type)).toThrow();
  }

  function expectCheckNotToThrow(
    expr: AcornJsxAst.Expression,
    env: Typecheck.Env,
    type: Type.Type
  ) {
    expect(() => Typecheck.check(expr, env, type)).not.toThrow();
  }

  describe('primitives', () => {
    describe('literals', () => {
      const expr = Parser.parseJsxExpr('7');
      const env: Typecheck.Env = Immutable.Map();

      it('succeeds', () => {
        expectCheckNotToThrow(expr, env, Type.number);
      });

      it('throws', () => {
        expectCheckToThrow(expr, env, Type.string);
      });
    });

    it('identifiers', () => {
      const expr = Parser.parseJsxExpr('foo');
      const type = Type.boolean;
      const env = Immutable.Map({ foo: type });
      expectCheckNotToThrow(expr, env, type);
    });
  });

  describe('tuples', () => {
    const type = Type.tuple(Type.number, Type.boolean, Type.null);
    const env =  Immutable.Map({ foo: type });

    describe('literals', () => {
      it('succeeds', () => {
        const expr = Parser.parseJsxExpr('[1, true, null]');
        expectCheckNotToThrow(expr, env, type);
      });

      it ('throws', () => {
        const expr = Parser.parseJsxExpr('[1, "foo", null]');
        expectCheckToThrow(expr, env, type)
      });
    });

    it('identifiers', () => {
      const expr = Parser.parseJsxExpr('foo');
      expectCheckNotToThrow(expr, env, type)
    });

    it ('throws on long tuples', () => {
      const expr = Parser.parseJsxExpr('[1, "foo", null, 1]');
      expectCheckToThrow(expr, env, type)
    });
  });

  describe('arrays', () => {
    const type = Type.array(Type.number);
    const env =  Immutable.Map({ foo: type });

    describe('literals', () => {
      it('succeeds', () => {
        const expr = Parser.parseJsxExpr('[1, 2, 3]');
        expectCheckNotToThrow(expr, env, type);
      });

      it('throws', () => {
        const expr = Parser.parseJsxExpr('[1, true]');
        expectCheckToThrow(expr, env, type);
      });
    });

    it('identifiers', () => {
      const expr = Parser.parseJsxExpr('foo');
      expectCheckNotToThrow(expr, env, type);
    });
  });

  describe('objects', () => {
    const type = Type.object({});
    const env: Typecheck.Env = Immutable.Map({
      foo: Type.object({ bar: Type.number }),
    });

    it('throws on excess properties in literals', () => {
      const expr = Parser.parseJsxExpr('({ foo: 7 })');
      expectCheckToThrow(expr, env, type);
    });

    it('permits excess properties in non-literal', () => {
      const expr = Parser.parseJsxExpr('foo');
      expectCheckNotToThrow(expr, env, type);
    });
  });

  describe('singletons', () => {
    const env: Typecheck.Env = Immutable.Map();
    const type = Type.singleton(Type.number, 7);

    it('succeeds', () => {
      const expr = Parser.parseJsxExpr('7');
      expectCheckNotToThrow(expr, env, type);
    });

    it('throws', () => {
      const expr = Parser.parseJsxExpr('8');
      expectCheckToThrow(expr, env, type);
    });
  });

  describe('unions', () => {
    const env: Typecheck.Env = Immutable.Map();
    const type = Type.union(Type.boolean, Type.number);

    it('succeeds', () => {
      const expr = Parser.parseJsxExpr('true');
      expectCheckNotToThrow(expr, env, type);

      const expr2 = Parser.parseJsxExpr('7');
      expectCheckNotToThrow(expr2, env, type);
    });

    it('throws', () => {
      const expr = Parser.parseJsxExpr('"foo"');
      expectCheckToThrow(expr, env, type);
    });

    it('union inside array', () => {
      const type = Type.array(Type.union(Type.boolean, Type.number));
      const expr = Parser.parseJsxExpr('[ false, 7 ]');
      expectCheckNotToThrow(expr, env, type);
    });
  });

  describe('intersections', () => {
    const env: Typecheck.Env = Immutable.Map();
    const type = Type.intersection(
      Type.array(Type.number),
      Type.tuple(Type.number)
    );

    it('succeeds', () => {
      const expr = Parser.parseJsxExpr('[ 7 ]');
      expectCheckNotToThrow(expr, env, type);
    });

    it('throws', () => {
      const expr = Parser.parseJsxExpr('[ 7, 9 ]');
      expectCheckToThrow(expr, env, type);
    });
  });
});
