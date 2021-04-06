import * as Parse from '../Parse';
import * as ESTree from '../ESTree';
import Type from '../Type';
import Typecheck from './index';
import expectSynth from './expectSynth';

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

  describe('logical expressions', () => {
    describe('&&', () => {
      it('truthy && unknown', () => {
        expectSynth({
          expr: '"foo" && number',
          env,
          type: 'number',
        });
      });

      it('falsy && unknown', () => {
        expectSynth({
          expr: '0 && string',
          env,
          type: '0',
        });
      });

      it('error && unknown', () => {
        expectSynth({
          expr: 'error && string',
          env,
          type: Type.error(error),
        });
      });

      it('unknown && unknown', () => {
        expectSynth({
          expr: 'number && string',
          env,
          type: '0 | string',
        });
      });
    });

    describe('||', () => {
      it('truthy || unknown', () => {
        expectSynth({
          expr: '"foo" || number',
          env,
          type: `'foo'`,
        });
      });

      it('falsy || unknown', () => {
        expectSynth({
          expr: '0 || string',
          env,
          type: 'string',
        });
      });

      it('error || unknown', () => {
        expectSynth({
          expr: 'error || string',
          env,
          type: 'string',
        });
      });

      it('unknown || unknown', () => {
        expectSynth({
          expr: 'number || string',
          env,
          type: 'number | string'
        });
      });
    });

    describe('narrowing', () => {
      it('&& narrows to non-falsy on rhs', () => {
        expectSynth({
          expr: 's && s.length',
          env: { s: 'undefined | { length: number }' },
          type: 'undefined | number',
        });
      });

      it('|| narrows to non-truthy on rhs', () => {
        expectSynth({
          expr: 's === null || s.length',
          env: { s: 'null | { length : number }' },
          // TODO(jaked) boolean & not(false) === true
          type: 'boolean | number',
        });
      });

      it('narrowed && narrows both sides when true', () => {
        expectSynth({
          expr: 'foo && foo.bar && foo.bar.baz',
          env: { foo: 'undefined | { bar: undefined | { baz: number } }' },
          type: 'undefined | number',
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
    const typeMap = new Map<ESTree.Node, Type>();
    const env2 = Typecheck.synthProgram(
      moduleEnv,
      program,
      env,
      typeMap
    );
    const x = env2.get('x');

    expect(x).toEqual(Type.singleton(7));
  });

  it('binding gets ascribed type', () => {
    const moduleEnv = new Map();
    const program = Parse.parseProgram(`
      const x: number = 7
    `);
    const env = Typecheck.env();
    const typeMap = new Map<ESTree.Node, Type>();
    const env2 = Typecheck.synthProgram(
      moduleEnv,
      program,
      env,
      typeMap
    );
    const x = env2.get('x');

    expect(x).toEqual(Type.number);
  });
});
