import { bug } from '../../util/bug';
import { Interface } from '../../model';
import * as Parse from '../Parse';
import * as ESTree from '../../estree';
import Type from '../../type';
import Typecheck from './index';
import expectSynth from './expectSynth';

const intfType = (intf: Interface) =>
  intf.type === 'ok' ? intf.ok.type : Type.error(intf.err);

describe('synth', () => {
  const error = new Error('error');
  const env = Typecheck.env({
    error: Type.error(error),
    number: Type.number,
    string: Type.string,
  });

  describe('identifiers', () => {
    it('succeeds', () => {
      expectSynth({
        expr: 'foo',
        env: { foo: 'boolean' },
        type: 'boolean',
      });
    });

    it('error', () => {
      expectSynth({
        expr: 'foo',
        error: true,
      });
    });

    it('error types becomes Try errors', () => {
      const expr = Parse.parseExpression('error');
      const interfaceMap = new Map<ESTree.Node, Interface>();
      const intf = Typecheck.synth(expr, env, interfaceMap);
      expect(intf.type).toBe('err');
    });
  });

  describe('literals', () => {
    it('boolean', () => {
      expectSynth({
        expr: 'true',
        type: 'true',
      });
    });

    it('string', () => {
      expectSynth({
        expr: '"foo"',
        type: '"foo"',
      });
    });

    it('null', () => {
      expectSynth({
        expr: 'null',
        type: 'null',
      });
    });
  });

  describe('arrays', () => {
    it('uniform', () => {
      // Typescript synths Array<number> here
      expectSynth({
        expr: '[ 7, 9 ]',
        type: '(7 | 9)[]',
      });
    });

    it('non-uniform', () => {
      // Typescript synths Array<number | boolean> here
      expectSynth({
        expr: '[ 7, true ]',
        type: '(7 | true)[]',
      });
    });
  });

  describe('objects', () => {
    it('succeeds', () => {
      expectSynth({
        expr: '({ foo: 7, bar: true })',
        type: '{ foo: 7, bar: true }',
      });
    });

    it('error on unbound shorthand property', () => {
      expectSynth({
        expr: '({ foo })',
        error: true,
      });
    });

    it('error on duplicate property name, drops property', () => {
      expectSynth({
        expr: `({ foo: 7, foo: 'bar' })`,
        type: '{ foo: 7 }',
        error: true,
      });
    });
  });

  describe('unary expressions', () => {
    describe('!', () => {
      it('ok', () => {
        expectSynth({
          expr: '!7',
          type: 'false',
        });
      });

      it('error is falsy', () => {
        expectSynth({
          expr: '!error',
          env,
          type: 'true',
        });
      });
    });

    describe('typeof', () => {
      it('ok', () => {
        expectSynth({
          expr: 'typeof 7',
          type: `'number'`,
        });
      });

      it(`returns 'error' on error`, () => {
        expectSynth({
          expr: 'typeof error',
          env,
          type: `'error'`,
        });
      });
    });
  });

  describe('sequence expressions', () => {
    it('returns type of last expression', () => {
      expectSynth({
        expr: `1, true, 'foo'`,
        type: `'foo'`,
      });
    });

    it('survives errors', () => {
      expectSynth({
        expr: `1, error, 'foo'`,
        type: `'foo'`,
      });
    });
  });

  describe('conditional expressions', () => {
    it('ok', () => {
      expectSynth({
        expr: 'b ? 1 : 2',
        env: { b: Type.boolean },
        type: '1 | 2',
      });
    });

    it('ok with statically evaluable test', () => {
      expectSynth({
        expr: 'true ? 1 : 2',
        type: '1',
      });
    });

    it('ok with statically evaluable test 2', () => {
      expectSynth({
        expr: `x === 'foo' ? 1 : 2`,
        env: { x: Type.singleton('foo') },
        type: '1',
      });
    });

    it('errors are falsy', () => {
      expectSynth({
        expr: `error ? 1 : 2`,
        env,
        type: '2',
      });
    });

    describe('narrowing', () => {
      describe('equality tests', () => {
        it('true branch', () => {
          expectSynth({
            expr: `s === 'foo' ? s : 'foo'`,
            env: { s: `'foo' | 'bar'` },
            type: `'foo'`,
          });
        });

        it('false branch', () => {
          expectSynth({
            expr: `s === 'foo' ? 'bar' : s`,
            env: { s: `'foo' | 'bar'` },
            type: `'bar'`,
          });
        });
      });

      describe('member expressions', () => {
        expectSynth({
          expr: `s.type === 'foo' ? s.foo : s.bar`,
          env: {
            s: `{ type: 'foo', foo: number } | { type: 'bar', bar: number }`
          },
          type: 'number',
        });
      });

      describe('typeof expressions', () => {
        it('true branch', () => {
          expectSynth({
            expr: `typeof(s) === 'string' ? s : 'foo'`,
            env: { s: `number | string` },
            type: 'string',
          });
        });

        it('false branch', () => {
          expectSynth({
            expr: `typeof(s) === 'string' ? 7 : s`,
            env: { s: `number | string` },
            type: 'number',
          });
        });

        describe('objects', () => {
          it('true branch', () => {
            expectSynth({
              expr: `typeof(s) === 'object' ? s.foo : 'foo'`,
              env: { s: 'undefined | { foo: string }' },
              type: 'string',
            });
          });
        });
      });

      describe('truthiness tests', () => {
        it('truthiness', () => {
          expectSynth({
            expr: `s ? s : 7`,
            env: { s: 'undefined | number' },
            type: 'number',
          });
        });

        it('falsiness', () => {
          expectSynth({
            expr: `!s ? s : 7`,
            env: { s: 'number | true' },
            type: 'number',
          });
        });
      });

      describe('nested conditionals', () => {
        expectSynth({
          expr: `typeof(s) === 'boolean' ? 'foo' : typeof(s) === 'number' ? 'bar' : s`,
          env: { s: 'number | string | boolean' },
          type: 'string',
        });
      });
    });
  });
});

describe('synthProgram', () => {
  it('binds unexported variables', () => {
    const moduleEnv = new Map();
    const program = Parse.parseProgram(`
      const x = 7
    `);
    const env = Typecheck.env();
    const interfaceMap = new Map<ESTree.Node, Interface>();
    const env2 = Typecheck.synthProgram(
      moduleEnv,
      program,
      env,
      interfaceMap
    );
    const x = env2.get('x') ?? bug(`expected x`);

    expect(intfType(x)).toEqual(Type.singleton(7));
  });

  it('binding gets ascribed type', () => {
    const moduleEnv = new Map();
    const program = Parse.parseProgram(`
      const x: number = 7
    `);
    const env = Typecheck.env();
    const interfaceMap = new Map<ESTree.Node, Interface>();
    const env2 = Typecheck.synthProgram(
      moduleEnv,
      program,
      env,
      interfaceMap
    );
    const x = env2.get('x') ?? bug(`expected x`);

    expect(intfType(x)).toEqual(Type.number);
  });
});
