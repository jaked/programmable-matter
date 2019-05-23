import * as Immutable from 'immutable';
import * as Parser from './Parser';
import * as Type from './Type';
import * as Typecheck from './Typecheck';

describe('check', () => {
  describe('checks object types', () => {
    it('throws on excess properties in object literals', () => {
      const env: Typecheck.Env = Immutable.Map();
      const expr = Parser.parseJsxExpr('({ foo: 7 })');
      const type = Type.object({});
      expect(() =>
        Typecheck.check(expr, env, type)
      ).toThrow();
    });

    it('permits excess properties in non-literal objects', () => {
      const env: Typecheck.Env = Immutable.Map({
        foo: Type.object({ bar: Type.number }),
      });
      const expr = Parser.parseJsxExpr('foo');
      const type = Type.object({});
      expect(() =>
        Typecheck.check(expr, env, type)
      ).not.toThrow();
    });
  });

  describe('checks properties of modules in environment', () => {
    const env = Immutable.Map({
      Foo: Type.object({
        bar: Type.object({ baz: Type.boolean }),
      }),
    });
    const expr = Parser.parseJsxExpr('Foo.bar');

    it('succeeds on correct type', () => {
      expect(() =>
        Typecheck.check(expr, env, Type.object({ baz: Type.boolean }))
      ).not.toThrow();
    });

    it('throws on incorrect type', () => {
      expect(() =>
        Typecheck.check(expr, env, Type.number)
      ).toThrow();
    });
  });
});
