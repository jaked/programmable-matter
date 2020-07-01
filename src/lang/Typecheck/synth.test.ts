import * as Immutable from 'immutable';
import * as ESTree from '../ESTree';
import * as MDXHAST from '../mdxhast';
import * as Parse from '../Parse';
import Type from '../Type';
import Typecheck from './index';

// TODO(jaked)
// seems like TS should be able to figure it out from the instanceof
function isEnv(env: any): env is Typecheck.Env {
  return env instanceof Immutable.Map;
}

describe('synth', () => {
  function expectSynth({ expr, env, type, error } : {
    expr: ESTree.Expression | string,
    env?: Typecheck.Env | { [s: string]: string | Type },
    type?: Type | string,
    error?: boolean
  }) {
    expr = (typeof expr === 'string') ? Parse.parseExpression(expr) : expr;
    env = env ?
      (isEnv(env) ?
        env :
        Typecheck.env(env as any)) :
      Typecheck.env();
    type = (typeof type === 'string') ? Parse.parseType(type) : type;
    const annots = new Map<unknown, Type>();
    const typeValue = Typecheck.synth(expr, env, annots);
    const errorValue = [...annots.values()].some(t => t.kind === 'Error');
    if (error !== undefined) expect(errorValue).toBe(error);
    if (type) expect(typeValue).toEqual(type);
  }

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

  describe('binary expressions', () => {
    describe('+', () => {
      it('literal number + literal number', () => {
        expectSynth({
          expr: '1 + 2',
          type: '3',
        });
      });

      it('error + literal number', () => {
        expectSynth({
          expr: 'error + 2',
          type: '2',
        });
      });

      it('literal number + error', () => {
        expectSynth({
          expr: '1 + error',
          type: '1',
        });
      });

      it('literal string + literal string', () => {
        expectSynth({
          expr: '"foo" + "bar"',
          type: `'foobar'`,
        });
      });

      it('number + number', () => {
        expectSynth({
          expr: 'number + number',
          env,
          type: 'number',
        });
      });

      it('error + number', () => {
        expectSynth({
          expr: 'error + number',
          env,
          type: 'number',
        });
      });

      it('number + error', () => {
        expectSynth({
          expr: 'error + number',
          env,
          type: 'number',
        });
      });

      it('string + string', () => {
        expectSynth({
          expr: 'string + string',
          env,
          type: 'string',
        });
      });
    });

    describe('=== / !==', () => {
      it('literal string === literal string', () => {
        expectSynth({
          expr: '"foo" === "bar"',
          type: 'false',
        });
      });

      it('literal string !== literal string', () => {
        expectSynth({
          expr: '"foo" !== "bar"',
          type: 'true',
        });
      });

      it('string === string', () => {
        expectSynth({
          expr: 'string === string',
          env,
          type: 'boolean',
        });
      });

      it('string !== string', () => {
        expectSynth({
          expr: 'string !== string',
          env,
          type: 'boolean',
        });
      });

      it('error === string', () => {
        expectSynth({
          expr: 'error === string',
          type: 'false',
        });
      });

      it('error !== string', () => {
        expectSynth({
          expr: 'error !== string',
          type: 'true',
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

  describe('member expressions', () => {
    const env = Typecheck.env({
      error: Type.error(error),
      object: '{ foo: boolean, bar: number }',
      array: 'number[]',
      tuple: '[ boolean, number ]',
      numberUnion: '0 | 1',
      stringUnion: `'foo' | 'bar'`,
    });

    it('property names', () => {
      expectSynth({
        expr: 'object.foo',
        env,
        type: 'boolean',
      });
    });

    it('error in target propagates', () => {
      expectSynth({
        expr: 'error.foo',
        env,
        type: Type.error(error),
      });
    });

    it('error in object property propagates', () => {
      expectSynth({
        expr: 'object[error]',
        env,
        type: Type.error(error),
      });
    });

    it('error in array property is undefined', () => {
      expectSynth({
        expr: 'array[error]',
        env,
        type: 'undefined',
      });
    });

    it('string index', () => {
      expectSynth({
        expr: 'object["foo"]',
        env,
        type: 'boolean'
      });
    });

    it('number index in array', () => {
      expectSynth({
        expr: 'array[0]',
        env,
        type: 'number',
      });
    });

    it('number index in tuple', () => {
      expectSynth({
        expr: 'tuple[0]',
        env,
        type: 'boolean',
      });
    });

    it('multiple number indexes in tuple', () => {
      expectSynth({
        expr: 'tuple[numberUnion]',
        env,
        type: 'boolean | number',
      });
    });

    it('multiple string indexes in object', () => {
      expectSynth({
        expr: 'object[stringUnion]',
        env,
        type: 'boolean | number',
      });
    });

    it('error on string index to array', () => {
      expectSynth({
        expr: 'array["xyzzy"]',
        error: true,
      });
    });

    it('error on tuple index out of range', () => {
      expectSynth({
        expr: 'tuple[2]',
        error: true,
      });
    });

    it('error on unknown object index', () => {
      expectSynth({
        expr: 'object["quux"]',
        error: true,
      });
    });

    it('error on unknown object property', () => {
      expectSynth({
        expr: 'object.quux',
        error: true,
      });
    });
  });

  describe('function expressions', () => {
    it('ok', () => {
      expectSynth({
        expr: '() => 7',
        type: '() => 7',
      });
    });

    it('ok with params', () => {
      expectSynth({
        expr: '(x: number, y: 7) => x + y',
        type: '(n: number, s: 7) => number',
      });
    });

    it('erroneous return', () => {
      expectSynth({
        expr: '(x: number) => error',
        env,
        type: Type.functionType([ Type.number ], Type.error(error)),
      })
    })

    it('missing param type', () => {
      expectSynth({
        expr: '(x) => x',
        env,
        type: Type.functionType(
          [ Type.unknown ],
          Type.error(new Error('function parameter must have a type'))
        ),
      })
    })

    it('missing param type with pattern', () => {
      expectSynth({
        expr: '({ x }) => x',
        env,
        type: Type.functionType(
          [ Type.object({ x: Type.unknown }) ],
          Type.error(new Error('function parameter must have a type'))
        ),
      })
    })
  });

  describe('function calls', () => {
    const env = Typecheck.env({
      f: '(n: number) => string',
      intf: '((n: number) => number) & ((s: string) => string)',
      g: '(a: undefined | boolean, b: boolean, c: undefined | boolean) => boolean',
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

  describe('JSX elements', () => {
    const env = Typecheck.env({
      Component: '(o: { foo: number, bar: undefined | number }) => string',
      FC: 'React.FC<{ foo: number }>',
      Component2: '(o: { baz: undefined | boolean }) => string',
      NotFunction: 'string',
      TooManyParams: '(s: string, n: number) => boolean',
      ParamNotObject: '(s: string) => boolean',
      WrongChildrenType: '(o: { children: number }) => boolean',
    });

    it('ok', () => {
      // bar may be omitted because the type may be undefined
      expectSynth({
        expr: '<Component foo={7} />',
        env,
        type: 'string',
      });
    });

    it('ok FC', () => {
      expectSynth({
        expr: '<FC foo={7} />',
        env,
        type: Type.reactNodeType,
      });
    });

    it('ok no attr value', () => {
      expectSynth({
        expr: '<Component2 baz />',
        env,
        type: 'string',
      });
    });

    it('error with no attr value of wrong type', () => {
      expectSynth({
        expr: '<Component2 baz={7} />',
        env,
        error: true,
      });
    });

    it('error when prop is missing', () => {
      expectSynth({
        expr: '<Component />',
        env,
        error: true,
      });
    });

    it('error when prop has wrong type', () => {
      expectSynth({
        expr: '<Component foo={"bar"} />',
        env,
        error: true,
      });
    });

    it('error when not a function', () => {
      expectSynth({
        expr: '<NotFunction />',
        env,
        error: true,
      });
    });

    it('error when too many params', () => {
      expectSynth({
        expr: '<TooManyParams />',
        env,
        error: true,
      });
    });

    it('error when param is not an object', () => {
      expectSynth({
        expr: '<ParamNotObject />',
        env,
        error: true,
      });
    });

    it('error when wrong children type', () => {
      expectSynth({
        expr: '<WrongChildrenType />',
        env,
        error: true,
      });
    });

    it('survives attrs with type errors if attr can be undefined', () => {
      expectSynth({
        expr: `<Component foo={7} bar={'baz'} />`,
        env,
        type: 'string',
        error: true,
      });
    });

    it('survives children with type errors', () => {
      expectSynth({
        expr: `<FC foo={7}><FC foo={'bar'} /></FC>`,
        env,
        type: Type.reactNodeType,
        error: true,
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

describe('synthMdx', () => {
  function expectSynthMdx({ mdx, env, error } : {
    mdx: MDXHAST.Node | string,
    env?: Typecheck.Env | { [s: string]: string | Type },
    error?: boolean
  }) {
    mdx = (typeof mdx === 'string') ? Parse.parse(mdx) : mdx;
    env = env ?
      (isEnv(env) ?
        env :
        Typecheck.env(env as any)) :
      Typecheck.env();
    const annots = new Map<unknown, Type>();
    Typecheck.synthMdx(mdx, Immutable.Map(), env, {}, annots);
    const errorValue = [...annots.values()].some(t => t.kind === 'Error');
    if (error !== undefined) expect(errorValue).toBe(error);
  }

  describe('type annotation on binding', () => {
    it('ok', () => {
      expectSynthMdx({
        mdx: `export const foo: string = 'bar'`
      });
    });

    it('fails', () => {
      expectSynthMdx({
        mdx: `export const foo: string = 7`,
        error: true,
      });
    });

    it('fails with bad annotation', () => {
      expectSynthMdx({
        mdx: `export const foo: bar = 7`,
        error: true,
      });
    });
  });

  describe('binding without initializer', () => {
    it('fails with type annotation', () => {
      expectSynthMdx({
        mdx: `export const foo: number`,
        error: true,
      });
    });

    it('fails without type annotation', () => {
      expectSynthMdx({
        mdx: `export const foo`,
        error: true,
      });
    });
  });
});
