import * as Immutable from 'immutable';
import * as ESTree from '../ESTree';
import * as Parse from '../Parse';
import Type from '../Type';
import Typecheck from './index';

// TODO(jaked)
// seems like TS should be able to figure it out from the instanceof
function isEnv(env: any): env is Typecheck.Env {
  return env instanceof Immutable.Map;
}

describe('check', () => {
  function expectCheck({ expr, env, type, actualType, error }: {
    expr: ESTree.Expression | string,
    env?: Typecheck.Env | { [s: string]: string | Type },
    type: Type | string,
    actualType?: Type,
    error?: boolean,
  }) {
    expr = (typeof expr === 'string') ? Parse.parseExpression(expr) : expr;
    env = env ?
      (isEnv(env) ?
        env :
        Typecheck.env(env as any)) :
      Typecheck.env();
    type = (typeof type === 'string') ? Parse.parseType(type) : type;
    error = (error !== undefined) ? error : false;
    const annots = new Map<unknown, Type>();
    const actualTypeValue = Typecheck.check(expr, env, type, annots);
    const errorValue = [...annots.values()].some(t => t.kind === 'Error');
    if (error !== undefined) expect(errorValue).toBe(error);
    if (actualType) expect(actualTypeValue).toEqual(actualType);
  }

  describe('primitives', () => {
    describe('literals', () => {
      it('succeeds', () => {
        expectCheck({
          expr: '7',
          type: 'number',
        })
      });

      it('throws', () => {
        expectCheck({
          expr: '7',
          type: 'string',
          error: true,
        });
      });
    });

    it('identifiers', () => {
      expectCheck({
        expr: 'foo',
        env: { foo: 'boolean' },
        type: 'boolean',
      });
    });
  });

  describe('tuples', () => {
    const type = '[ number, boolean, null ]';

    describe('literals', () => {
      it('succeeds', () => {
        expectCheck({
          expr: '[1, true, null]',
          type,
        });
      });

      it('throws', () => {
        expectCheck({
          expr: '[1, "foo", null]',
          type,
          error: true,
        });
      });
    });

    it('identifiers', () => {
      expectCheck({
        expr: 'foo',
        env: { foo: type },
        type,
      });
    });

    it('throws on long tuples', () => {
      expectCheck({
        expr: '[1, "foo", null, 1]',
        type,
        error: true,
      });
    });
  });

  describe('arrays', () => {
    const type = 'number[]';

    describe('literals', () => {
      it('succeeds', () => {
        expectCheck({
          expr: '[1, 2, 3]',
          type,
        });
      });

      it('throws', () => {
        expectCheck({
          expr: '[1, true]',
          type,
          error: true,
        });
      });
    });

    it('identifiers', () => {
      expectCheck({
        expr: 'foo',
        env: { foo: type },
        type,
      });
    });
  });

  describe('objects', () => {
    const type = '{ foo: number, bar: undefined | number }';

    it('undefined properties may be omitted', () => {
      expectCheck({
        expr: '({ foo: 7 })',
        type,
      });
    });

    it('throws on missing properties', () => {
      expectCheck({
        expr: '({ })',
        type,
        error: true,
      });
    });

    it('throws on excess properties in literals', () => {
      expectCheck({
        expr: '({ foo: 7, baz: 9 })',
        type,
        error: true,
      });
    });

    it('permits excess properties in non-literal', () => {
      expectCheck({
        expr: 'foo',
        env: { foo: '{ foo: number, baz: number }' },
        type,
      });
    });
  });

  describe('function expressions', () => {
    const type = '(n: number) => number';

    it('ok', () => {
      expectCheck({
        expr: 'x => x + 7',
        type,
      });
    });

    it('fewer args ok', () => {
      expectCheck({
        expr: '() => 7',
        type,
      });
    });

    it('too many args', () => {
      expectCheck({
        expr: '(x, y) => x + y',
        type,
        error: true,
      });
    });

    it('wrong body type', () => {
      expectCheck({
        expr: `x => 'foo'`,
        type,
        error: true
      });
    });

    it('object pattern arg', () => {
      expectCheck({
        expr: '({ x: xArg, y: yArg }) => xArg + yArg',
        type: '(o: { x: number, y: number }) => number',
      });
    });

    it('shorthand object pattern arg', () => {
      expectCheck({
        expr: '({ x, y }) => x + y',
        type: '(o: { x: number, y: number }) => number',
      });
    });

    // Babel parser already checks this
    // it('duplicate identifiers', () => {
    //   const type = Type.functionType(
    //     [ Type.object({ x: Type.number, y: Type.number }) ],
    //     Type.number
    //   );
    //   expectCheckThrows('({ x: z, y: z }) => z + z', type);
    // });

    it('function component', () => {
      expectCheck({
        expr: '({ children, foo }) => foo',
        type: 'React.FC<{ foo: string }>',
      });
    })
  });

  describe('singletons', () => {
    it('succeeds', () => {
      expectCheck({
        expr: '7',
        type: '7',
      });
    });

    it('throws', () => {
      expectCheck({
        expr: '8',
        type: '7',
        error: true,
      });
    });
  });

  describe('unions', () => {
    const type = 'boolean | number'

    it('succeeds', () => {
      expectCheck({
        expr: 'true',
        type,
      });
      expectCheck({
        expr: '7',
        type,
      });
    });

    it('throws', () => {
      expectCheck({
        expr: '"foo"',
        type,
        error: true,
      });
    });

    it('union inside array', () => {
      expectCheck({
        expr: '[ false, 7 ]',
        type: '(boolean | number)[]',
      });
    });
  });

  describe('intersections', () => {
    const type = 'number[] & 7[]';

    it('succeeds', () => {
      expectCheck({
        expr: '[ 7 ]',
        type,
      });
    });

    it('throws', () => {
      expectCheck({
        expr: '[ 9 ]',
        type,
        error: true,
      });
    });

    it('succeeds for a uniform function', () => {
      expectCheck({
        expr: 'x => x',
        type: '((n: number) => number) & ((s: string) => string)',
      });
    });

    it('succeeds for a non-uniform function', () => {
      expectCheck({
        expr: `x => x === 'number' ? 7 : 'nine'`,
        type: `((s: 'number') => number) & ((s: 'string') => string)`,
      });
    });
  });

  describe('conditional expressions', () => {
    it('ok', () => {
      expectCheck({
        expr: 'b ? 1 : 2',
        env: { b: 'boolean' },
        type: '1 | 2',
      });
    });

    it('ok with statically evaluable test', () => {
      expectCheck({
        expr: 'true ? 1 : 2',
        type: '1',
      });
    });

    it('ok with statically evaluable test 2', () => {
      expectCheck({
        expr: `x === 'foo' ? 1 : 2`,
        env: { x: `'foo'` },
        type: '1',
      });
    });

    it('narrows type for equality tests', () => {
      expectCheck({
        expr: `s === 'foo' ? s : 'foo'`,
        env: { s: `'foo' | 'bar'` },
        type: `'foo'`,
      });
    });
  });

  describe('errors', () => {
    it('checking an error returns that error, not subtype error', () => {
      const error = Type.error(new Error('error'));
      expectCheck({
        expr: `error`,
        env: { error: error },
        type: 'string',
        error: true,
        actualType: error,
      });
    })
  });
});
