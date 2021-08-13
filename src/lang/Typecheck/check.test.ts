import { Interface } from '../../model';
import * as Parse from '../Parse';
import * as ESTree from '../../estree';
import Type from '../../type';
import Typecheck from './index';
import expectCheck from './expectCheck';

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

  it('succeeds', () => {
    expectCheck({
      expr: '[1, true, null]',
      type,
    });
  });

  it('identifiers', () => {
    expectCheck({
      expr: 'foo',
      env: { foo: type },
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

  it('throws on long tuples', () => {
    expectCheck({
      expr: '[1, "foo", null, 1]',
      type,
      error: true,
    });
  });

  it('trailing missing elements ok if can be undefined', () => {
    const type = Type.tuple(Type.boolean, Type.undefinedOrString);
    expectCheck({
      expr: `[ true ]`,
      type,
      error: false,
      actualType: type,
    });
  });

  it('erroneous elements ok if can be undefined', () => {
    const type = Type.tuple(Type.undefinedOrNumber, Type.boolean, Type.undefinedOrString);
    expectCheck({
      expr: `[ x, true, y ]`,
      type,
      error: true,
      actualType: type,
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

  it('erroneous elements ok if can be undefined', () => {
    const type = Type.array(Type.undefinedOrNumber);
    expectCheck({
      expr: '[ 1, z ]',
      type,
      error: true,
      actualType: type,
    })
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

describe('errors', () => {
  it('error types becomes Try errors', () => {
    const expr = Parse.parseExpression('error');
    const env = Typecheck.env({ error: Type.error(new Error('error')) });
    const interfaceMap = new Map<ESTree.Node, Interface>();
    const intf = Typecheck.check(expr, env, Type.number, interfaceMap);
    expect(intf.type).toBe('err');
  });

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
