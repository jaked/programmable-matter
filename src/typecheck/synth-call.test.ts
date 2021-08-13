import Typecheck from './index';
import expectSynth from './expectSynth';

describe('function calls', () => {
  const env = Typecheck.env({
    f: '(n: number) => string',
    intf: '((n: number) => number) & ((s: string) => string)',
    g: '(a: undefined | boolean, b: boolean, c: undefined | boolean) => boolean',
    intObjF: '{ foo: number } & ((bar: number) => number)',
  });

  it('ok', () => {
    expectSynth({
      expr: 'f(7)',
      env,
      type: 'string',
    });
  });

  it('ok intersection', () => {
    expectSynth({
      expr: `intf(7)`,
      env,
      type: 'number',
    });
    expectSynth({
      expr: `intf('nine')`,
      env,
      type: 'string',
    });
  });

  it('ok intersection with non-function', () => {
    expectSynth({
      expr: `intObjF(7)`,
      env,
      type: 'number'
    });
  });

  it('error when callee is not a function', () => {
    expectSynth({
      expr: '7(9)',
      error: true,
    });
  });

  it('error when not enough args', () => {
    expectSynth({
      expr: 'f()',
      env,
      error: true,
    });
  });

  it('error when too many args', () => {
    expectSynth({
      expr: 'f(7, 9)',
      env,
      error: true,
    });
  });

  it('error when arg is wrong type', () => {
    expectSynth({
      expr: 'f("seven")',
      env,
      error: true,
    });
  });

  it('non-trailing undefined arguments are not optional', () => {
    expectSynth({
      expr: `g()`,
      env,
      error: true,
    });
  });

  it('trailing undefined arguments are optional', () => {
    expectSynth({
      expr: `g(true, false)`,
      env,
      type: 'boolean',
    });
  });

  it('survives erroneous args when arg can be undefined', () => {
    expectSynth({
      expr: `g(x, false, y)`,
      env,
      type: 'boolean',
      error: true,
    });
  });
});
