import * as Immutable from 'immutable';
import Trace from '../../util/Trace';
import * as ESTree from '../ESTree';
import * as MDXHAST from '../mdxhast';
import * as Parse from '../Parse';
import Type from '../Type';
import Typecheck from './index';

describe('synth', () => {
  function expectSynth(
    exprOrString: ESTree.Expression | string,
    env: Typecheck.Env = Typecheck.env(),
    expectedType?: Type,
    expectedError: boolean = false,
  ) {
    const expr =
      (typeof exprOrString === 'string') ? Parse.parseExpression(exprOrString)
      : exprOrString;
    const annots = new Map<unknown, Type>();
    const type = Typecheck.synth(expr, env, annots);
    const hasError = [...annots.values()].some(t => t.kind === 'Error');
    if (expectedError) expect(hasError).toBe(expectedError);
    if (expectedType) expect(type).toEqual(expectedType);
  }

  const error = new Error('error');
  const env = Typecheck.env({
    error: Type.error(error),
    number: Type.number,
    string: Type.string,
  });

  describe('identifiers', () => {
    it('succeeds', () => {
      const env = Typecheck.env({ foo: Type.boolean });
      expectSynth('foo', env, Type.boolean);
    });

    it('error', () => {
      expectSynth('foo', undefined, undefined, true);
    });
  });

  describe('literals', () => {
    it('boolean', () => {
      expectSynth('true', undefined, Type.singleton(true));
    });

    it('string', () => {
      expectSynth('"foo"', undefined, Type.singleton("foo"));
    });

    it('null', () => {
      expectSynth('null', undefined, Type.nullType);
    });
  });

  describe('arrays', () => {
    it('uniform', () => {
      // Typescript synths Array<number> here
      const type = Type.array(Type.union(
        Type.singleton(7),
        Type.singleton(9)
      ));
      expectSynth('[ 7, 9 ]', undefined, type);
    });

    it('non-uniform', () => {
      // Typescript synths Array<number | boolean> here
      const type = Type.array(Type.union(
        Type.singleton(7),
        Type.singleton(true)
      ));
      expectSynth('[ 7, true ]', undefined, type);
    });
  });

  describe('objects', () => {
    it('succeeds', () => {
      const type = Type.object({
        foo: Type.singleton(7),
        bar: Type.singleton(true)
      });
      expectSynth('({ foo: 7, bar: true })', undefined, type);
    });

    it('error on unbound shorthand property', () => {
      expectSynth('({ foo })', undefined, undefined, true);
    });

    it('error on duplicate property name, drops property', () => {
      expectSynth(
        `({ foo: 7, foo: 'bar' })`,
        undefined,
        Type.object({ foo: Type.singleton(7) }),
        true
      );
    });
  });

  describe('unary expressions', () => {
    describe('!', () => {
      it('ok', () => {
        expectSynth('!7', undefined, Type.singleton(false));
      });

      it('error is falsy', () => {
        expectSynth('!error', env, Type.singleton(true));
      });
    });

    describe('typeof', () => {
      it('ok', () => {
        expectSynth('typeof 7', undefined, Type.singleton('number'));
      });

      it(`returns 'error' on error`, () => {
        expectSynth('typeof error', env, Type.singleton('error'));
      });
    });
  });

  describe('logical expressions', () => {
    describe('&&', () => {
      it('truthy && unknown', () => {
        expectSynth('"foo" && number', env, Type.number);
      });

      it('falsy && unknown', () => {
        expectSynth('0 && string', env, Type.singleton(0));
      });

      it('error && unknown', () => {
        expectSynth('error && string', env, Type.error(error));
      });

      it('unknown && unknown', () => {
        expectSynth(
          'number && string',
          env,
          Type.union(Type.singleton(0), Type.string),
        );
      });
    });

    describe('||', () => {
      it('truthy || unknown', () => {
        expectSynth('"foo" || number', env, Type.singleton("foo"));
      });

      it('falsy || unknown', () => {
        expectSynth('0 || string', env, Type.string);
      });

      it('error || unknown', () => {
        expectSynth('error || string', env, Type.string);
      });

      it('unknown || unknown', () => {
        expectSynth(
          'number || string',
          env,
          Type.union(Type.number, Type.string),
        );
      });
    });

    describe('narrowing', () => {
      it('&& narrows to non-falsy on rhs', () => {
        const env = Typecheck.env({
          s: Type.undefinedOr(Type.object({ length: Type.number }))
        });
        expectSynth(
          's && s.length',
          env,
          Type.union(Type.undefined, Type.number),
        );
      });

      it('|| narrows to non-truthy on rhs', () => {
        const env = Typecheck.env({
          s: Type.union(Type.nullType, Type.object({ length: Type.number }))
        });
        expectSynth(
          's === null || s.length',
          env,
          // TODO(jaked) boolean & not(false) === true
          Type.union(Type.boolean, Type.number),
        );
      });

      it('narrowed && narrows both sides when true', () => {
        const env = Typecheck.env({
          foo: Type.undefinedOr(
            Type.object({
              bar: Type.undefinedOr(
                Type.object({
                  baz: Type.number
                })
              )
            })
          )
        });
        expectSynth(
          'foo && foo.bar && foo.bar.baz',
          env,
          Type.union(Type.undefined, Type.number),
        );
      });
    });
  });

  describe('binary expressions', () => {
    describe('+', () => {
      it('literal number + literal number', () => {
        expectSynth('1 + 2', undefined, Type.singleton(3));
      });

      it('error + literal number', () => {
        expectSynth('error + 2', undefined, Type.singleton(2));
      });

      it('literal number + error', () => {
        expectSynth('1 + error', undefined, Type.singleton(1));
      });

      it('literal string + literal string', () => {
        expectSynth('"foo" + "bar"', undefined, Type.singleton('foobar'));
      });

      it('number + number', () => {
        expectSynth('number + number', env, Type.number);
      });

      it('error + number', () => {
        expectSynth('error + number', env, Type.number);
      });

      it('number + error', () => {
        expectSynth('error + number', env, Type.number);
      });

      it('string + string', () => {
        expectSynth('string + string', env, Type.string);
      });
    });

    describe('=== / !==', () => {
      it('literal string === literal string', () => {
        expectSynth('"foo" === "bar"', undefined, Type.singleton(false));
      });

      it('literal string !== literal string', () => {
        expectSynth('"foo" !== "bar"', undefined, Type.singleton(true));
      });

      it('string === string', () => {
        expectSynth('string === string', env, Type.boolean);
      });

      it('string !== string', () => {
        expectSynth('string !== string', env, Type.boolean);
      });

      it('error === string', () => {
        expectSynth('error === string', undefined, Type.singleton(false));
      });

      it('error !== string', () => {
        expectSynth('error !== string', undefined, Type.singleton(true));
      });
    });
  });

  describe('sequence expressions', () => {
    it('returns type of last expression', () => {
      expectSynth(`1, true, 'foo'`, undefined, Type.singleton('foo'));
    });

    it('survives errors', () => {
      expectSynth(`1, error, 'foo'`, undefined, Type.singleton('foo'));
    });
  });

  describe('member expressions', () => {
    const env = Typecheck.env({
      error: Type.error(error),
      object: Type.object({ foo: Type.boolean, bar: Type.number }),
      array: Type.array(Type.number),
      tuple: Type.tuple(Type.boolean, Type.number),
      numberUnion: Type.union(
        Type.singleton(0),
        Type.singleton(1),
      ),
      stringUnion: Type.union(
        Type.singleton('foo'),
        Type.singleton('bar'),
      ),
    });

    it('property names', () => {
      expectSynth('object.foo', env, Type.boolean);
    });

    it('error in target propagates', () => {
      expectSynth('error.foo', env, Type.error(error));
    });

    it('error in object property propagates', () => {
      expectSynth('object[error]', env, Type.error(error));
    });

    it('error in array property is undefined', () => {
      expectSynth('array[error]', env, Type.undefined);
    });

    it('string index', () => {
      expectSynth('object["foo"]', env, Type.boolean);
    });

    it('number index in array', () => {
      expectSynth('array[0]', env, Type.number);
    });

    it('number index in tuple', () => {
      expectSynth('tuple[0]', env, Type.boolean);
    });

    it('multiple number indexes in tuple', () => {
      expectSynth('tuple[numberUnion]', env, Type.union(Type.boolean, Type.number));
    });

    it('multiple string indexes in object', () => {
      expectSynth('object[stringUnion]', env, Type.union(Type.boolean, Type.number));
    });

    it('error on string index to array', () => {
      expectSynth('array["xyzzy"]', undefined, undefined, true);
    });

    it('error on tuple index out of range', () => {
      expectSynth('tuple[2]', undefined, undefined, true);
    });

    it('error on unknown object index', () => {
      expectSynth('object["quux"]', undefined, undefined, true);
    });

    it('error on unknown object property', () => {
      expectSynth('object.quux', undefined, undefined, true);
    });
  });

  describe('function expressions', () => {
    it('ok', () => {
      expectSynth(
        '() => 7',
        undefined,
        Type.functionType([], Type.singleton(7))
      );
    });

    it('ok with params', () => {
      expectSynth(
        '(x: number, y: 7) => x + y',
        undefined,
        Type.functionType(
          [ Type.number, Type.singleton(7) ],
          Type.number
        )
      );
    });
  });

  describe('function calls', () => {
    const env = Typecheck.env({
      f: Type.functionType([ Type.number ], Type.string),
      intf: Type.intersection(
        Type.functionType([ Type.number ], Type.number),
        Type.functionType([ Type.string ], Type.string),
      ),
    });

    it('ok', () => {
      expectSynth('f(7)', env, Type.string);
    });

    it('ok intersection', () => {
      expectSynth(`intf(7)`, env, Type.number);
      expectSynth(`intf('nine')`, env, Type.string);
    });

    it('error when callee is not a function', () => {
      expectSynth('7(9)', undefined, undefined, true);
    });

    it('error when not enough args', () => {
      expectSynth('f()', undefined, undefined, true);
    });

    it('error when too many args', () => {
      expectSynth('f(7, 9)', undefined, undefined, true);
    });

    it('error when arg is wrong type', () => {
      expectSynth('f("seven")', undefined, undefined, true);
    });
  });

  describe('JSX elements', () => {
    const env = Typecheck.env({
      Component: Type.functionType(
        [ Type.object({ foo: Type.number, bar: Type.undefinedOrNumber }) ],
        Type.string
      ),
      FC: Type.abstract('React.FC', Type.object({ foo: Type.number })),
      Component2: Type.functionType([ Type.object({ baz: Type.undefinedOrBoolean })], Type.string),
      NotFunction: Type.string,
      TooManyParams: Type.functionType([ Type.string, Type.number ], Type.boolean),
      ParamNotObject: Type.functionType([ Type.string ], Type.boolean),
      WrongChildrenType: Type.functionType([ Type.object({ children: Type.number }) ], Type.boolean),
    });

    it('ok', () => {
      // bar may be omitted because the type may be undefined
      expectSynth('<Component foo={7} />', env, Type.string);
    });

    it('ok FC', () => {
      expectSynth('<FC foo={7} />', env, Type.reactNodeType);
    });

    it('ok no attr value', () => {
      expectSynth('<Component2 baz />', env, Type.string);
    });

    it('error with no attr value of wrong type', () => {
      expectSynth('<Component2 baz={7} />', env, undefined, true);
    });

    it('error when prop is missing', () => {
      expectSynth('<Component />', env, undefined, true);
    });

    it('error when prop has wrong type', () => {
      expectSynth('<Component foo={"bar"} />', env, undefined, true);
    });

    it('error when not a function', () => {
      expectSynth('<NotFunction />', env, undefined, true);
    });

    it('error when too many params', () => {
      expectSynth('<TooManyParams />', env, undefined, true);
    });

    it('error when param is not an object', () => {
      expectSynth('<ParamNotObject />', env, undefined, true);
    });

    it('error when wrong children type', () => {
      expectSynth('<WrongChildrenType />', env, undefined, true);
    });

    it('survives attrs with type errors if attr can be undefined', () => {
      expectSynth(
        `<Component foo={7} bar={'baz'} />`,
        env,
        Type.string,
        true
      );
    });

    it('survives children with type errors', () => {
      expectSynth(
        `<FC foo={7}><FC foo={'bar'} /></FC>`,
        env,
        Type.reactNodeType,
        true
      );
    });
  });

  describe('conditional expressions', () => {
    it('ok', () => {
      const env = Typecheck.env({ b: Type.boolean });
      expectSynth('b ? 1 : 2', env, Type.enumerate(1, 2));
    });

    it('ok with statically evaluable test', () => {
      expectSynth('true ? 1 : 2', undefined, Type.singleton(1));
    });

    it('ok with statically evaluable test 2', () => {
      const env = Typecheck.env({ x: Type.singleton('foo') });
      expectSynth(`x === 'foo' ? 1 : 2`, env, Type.singleton(1));
    });

    describe('narrowing', () => {
      describe('equality tests', () => {
        it('true branch', () => {
          const env = Typecheck.env({ s: Type.enumerate('foo', 'bar') });
          expectSynth(`s === 'foo' ? s : 'foo'`, env, Type.singleton('foo'));
        });

        it('false branch', () => {
          const env = Typecheck.env({ s: Type.enumerate('foo', 'bar') });
          expectSynth(`s === 'foo' ? 'bar' : s`, env, Type.singleton('bar'));
        });
      });

      describe('member expressions', () => {
        const env = Typecheck.env({
          s: Type.union(
            Type.object({ type: Type.singleton('foo'), foo: Type.number }),
            Type.object({ type: Type.singleton('bar'), bar: Type.number }),
          )
        });
        expectSynth(`s.type === 'foo' ? s.foo : s.bar`, env, Type.number);
      });

      describe('typeof expressions', () => {
        it('true branch', () => {
          const env = Typecheck.env({ s: Type.union(Type.number, Type.string) });
          expectSynth(`typeof(s) === 'string' ? s : 'foo'`, env, Type.string)
        });

        it('false branch', () => {
          const env = Typecheck.env({ s: Type.union(Type.number, Type.string) });
          expectSynth(`typeof(s) === 'string' ? 7 : s`, env, Type.number)
        });

        describe('objects', () => {
          it('true branch', () => {
            const env =
              Typecheck.env({ s: Type.undefinedOr(Type.object({ foo: Type.string })) });
            expectSynth(`typeof(s) === 'object' ? s.foo : 'foo'`, env, Type.string)
          });
        });
      });

      describe('truthiness tests', () => {
        it('truthiness', () => {
          const env = Typecheck.env({ s: Type.union(Type.number, Type.undefined) });
          expectSynth(`s ? s : 7`, env, Type.number);
        });

        it('falsiness', () => {
          const env = Typecheck.env({ s: Type.union(Type.number, Type.singleton(true)) });
          expectSynth(`!s ? s : 7`, env, Type.number);
        });
      });

      describe('nested conditionals', () => {
        const env =
          Typecheck.env({ s: Type.union(Type.number, Type.string, Type.boolean) });
        expectSynth(
          `typeof(s) === 'boolean' ? 'foo' : typeof(s) === 'number' ? 'bar' : s`,
          env,
          Type.string,
        );
      });
    });
  });
});

describe('synthMdx', () => {
  function expectSynthMdx(
    astOrString: MDXHAST.Node | string,
    initEnv: Typecheck.Env = Typecheck.env(),
    expectedError: boolean = false,
  ) {
    const trace = new Trace();
    const ast =
      (typeof astOrString === 'string') ? Parse.parse(trace, astOrString)
      : astOrString;
    const annots = new Map<unknown, Type>();
    const env = Typecheck.synthMdx(ast, Immutable.Map(), initEnv, {}, annots);
    const hasError = [...annots.values()].some(t => t.kind === 'Error');
    if (expectedError) expect(hasError).toBe(expectedError);
  }

  describe('type annotation on binding', () => {
    it('ok', () => {
      expectSynthMdx(`export const foo: string = 'bar'`);
    });

    it('fails', () => {
      expectSynthMdx(`export const foo: string = 7`, undefined, true);
    });

    it('fails with bad annotation', () => {
      expectSynthMdx(`export const foo: bar = 7`, undefined, true);
    });
  });

  describe('binding without initializer', () => {
    it('fails with type annotation', () => {
      expectSynthMdx(`export const foo: number`, undefined, true);
    });

    it('fails without type annotation', () => {
      expectSynthMdx(`export const foo`, undefined, true);
    });
  });
});
