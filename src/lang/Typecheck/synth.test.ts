import * as ESTree from '../ESTree';
import * as Parser from '../Parser';
import Type from '../Type';
import Typecheck from './index';

describe('synth', () => {
  function expectSynthThrows(
    exprOrString: ESTree.Expression | string,
    env: Typecheck.Env = Typecheck.env()
  ) {
    const expr =
      (typeof exprOrString === 'string') ? Parser.parseExpression(exprOrString)
      : exprOrString;
    expect(() => Typecheck.synth(expr, env)).toThrow();
  }

  function expectSynth(
    exprOrString: ESTree.Expression | string,
    type: Type,
    env: Typecheck.Env = Typecheck.env()
  ) {
    const expr =
      (typeof exprOrString === 'string') ? Parser.parseExpression(exprOrString)
      : exprOrString;
    expect(Typecheck.synth(expr, env)).toEqual(type);
  }

  describe('identifiers', () => {
    it('succeeds', () => {
      const env = Typecheck.env({ foo: Type.boolean });
      expectSynth('foo', Type.boolean, env);
    });

    it('throws', () => {
      expectSynthThrows('foo');
    });
  });

  describe('literals', () => {
    it('boolean', () => {
      expectSynth('true', Type.singleton(true));
    });

    it('string', () => {
      expectSynth('"foo"', Type.singleton("foo"));
    });

    it('null', () => {
      expectSynth('null', Type.nullType);
    });
  });

  describe('arrays', () => {
    it('uniform', () => {
      // Typescript synths Array<number> here
      const type = Type.array(Type.union(
        Type.singleton(7),
        Type.singleton(9)
      ));
      expectSynth('[ 7, 9 ]', type);
    });

    it('non-uniform', () => {
      // Typescript synths Array<number | boolean> here
      const type = Type.array(Type.union(
        Type.singleton(7),
        Type.singleton(true)
      ));
      expectSynth('[ 7, true ]', type);
    });
  });

  describe('objects', () => {
    it('succeeds', () => {
      const type = Type.object({
        foo: Type.singleton(7),
        bar: Type.singleton(true)
      });
      expectSynth('({ foo: 7, bar: true })', type);
    });

    it('throws', () => {
      // object with duplicate field names is invalid
      expectSynthThrows('({ foo: 7, foo: 9 })');
    });
  });

  describe('unary expressions', () => {
    it('!', () => {
      expectSynth('!7', Type.singleton(false));
    });

    it('typeof', () => {
      expectSynth('typeof 7', Type.singleton('number'));
    });
  });

  describe('logical expressions', () => {
    describe('statically evaluated', () => {
      const env = Typecheck.env({
        number: Type.number,
        string: Type.string,
      });

      it('&& truthy', () => {
        expectSynth('"foo" && number', Type.number, env);
      });

      it('&& falsy', () => {
        expectSynth('0 && string', Type.singleton(0), env);
      });

      it('|| truthy', () => {
        expectSynth('"foo" || number', Type.singleton("foo"), env);
      });

      it('|| falsy', () => {
        expectSynth('0 || string', Type.string, env);
      });
    });

    describe('not statically evaluated', () => {
      const env = Typecheck.env({
        number: Type.number,
        string: Type.string,
      });

      it('&&', () => {
        expectSynth(
          'number && string',
          Type.union(Type.singleton(0), Type.string),
          env
        );
      });

      it('||', () => {
        expectSynth(
          'number || string',
          Type.union(Type.number, Type.string),
          env
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
          Type.union(Type.undefined, Type.number),
          env
        );
      });

      it('|| narrows to non-truthy on rhs', () => {
        const env = Typecheck.env({
          s: Type.union(Type.nullType, Type.object({ length: Type.number }))
        });
        expectSynth(
          's === null || s.length',
          // TODO(jaked) boolean & not(false) === true
          Type.union(Type.boolean, Type.number),
          env
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
          Type.union(Type.undefined, Type.number),
          env
        );
      });
    });
  });

  describe('binary expressions', () => {
    describe('statically evaluated', () => {
      it('+ numbers', () => {
        expectSynth('1 + 2', Type.singleton(3));
      });

      it('+ strings', () => {
        expectSynth('"foo" + "bar"', Type.singleton('foobar'));
      });

      it('===', () => {
        expectSynth('"foo" === "bar"', Type.singleton(false));
      });

      it('!==', () => {
        expectSynth('"foo" !== "bar"', Type.singleton(true));
      });
    });

    describe('not statically evaluated', () => {
      const env = Typecheck.env({
        number: Type.number,
        string: Type.string,
      });

      it('+ numbers', () => {
        expectSynth('number + number', Type.number, env);
      });

      it('+ strings', () => {
        expectSynth('string + string', Type.string, env);
      });

      it('===', () => {
        expectSynth('string === string', Type.boolean, env);
      });

      it('!==', () => {
        expectSynth('string !== string', Type.boolean, env);
      });
    });
  });

  describe('member expressions', () => {
    const env = Typecheck.env({
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
      expectSynth('object.foo', Type.boolean, env);
    });

    it('string index', () => {
      expectSynth('object["foo"]', Type.boolean, env);
    });

    it('number index in array', () => {
      expectSynth('array[0]', Type.number, env);
    });

    it('number index in tuple', () => {
      expectSynth('tuple[0]', Type.boolean, env);
    });

    it('multiple number indexes in tuple', () => {
      expectSynth('tuple[numberUnion]', Type.union(Type.boolean, Type.number), env);
    });

    it('multiple string indexes in object', () => {
      expectSynth('object[stringUnion]', Type.union(Type.boolean, Type.number), env);
    });

    it('throws on string index to array', () => {
      expectSynthThrows('array["xyzzy"]');
    });

    it('throws on tuple index out of range', () => {
      expectSynthThrows('tuple[2]');
    });

    it('throws on unknown object index', () => {
      expectSynthThrows('object["quux"]');
    });

    it('throws on unknown object property', () => {
      expectSynthThrows('object.quux');
    });
  });

  describe('function expressions', () => {
    it('ok', () => {
      expectSynth(
        '() => 7',
        Type.functionType([], Type.singleton(7))
      );
    });

    it('ok with params', () => {
      expectSynth(
        '(x: number, y: 7) => x + y',
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
      expectSynth('f(7)', Type.string, env);
    });

    it('ok intersection', () => {
      expectSynth(`intf(7)`, Type.number, env);
      expectSynth(`intf('nine')`, Type.string, env);
    });

    it('throws when callee is not a function', () => {
      expectSynthThrows('7(9)');
    });

    it('throws when not enough args', () => {
      expectSynthThrows('f()');
    });

    it('throws when too many args', () => {
      expectSynthThrows('f(7, 9)');
    });

    it('throws when arg is wrong type', () => {
      expectSynthThrows('f("seven")');
    });
  });

  describe('JSX elements', () => {
    const env = Typecheck.env({
      Component: Type.functionType(
        [ Type.object({ foo: Type.number, bar: Type.undefinedOrNumber }) ],
        Type.string
      ),
      NotFunction: Type.string,
      TooManyParams: Type.functionType([ Type.string, Type.number ], Type.boolean),
      ParamNotObject: Type.functionType([ Type.string ], Type.boolean),
      WrongChildrenType: Type.functionType([ Type.object({ children: Type.number }) ], Type.boolean),
    });

    it('ok', () => {
      // bar may be omitted because the type may be undefined
      expectSynth('<Component foo={7} />', Type.string, env);
    });

    it('throws when prop is missing', () => {
      expectSynthThrows('<Component />', env);
    });

    it('throws when prop has wrong type', () => {
      expectSynthThrows('<Component foo={"bar"} />', env);
    });

    it('throws when not a function', () => {
      expectSynthThrows('<NotFunction />', env);
    });

    it('throws when too many params', () => {
      expectSynthThrows('<TooManyParams />', env);
    });

    it('throws when param is not an object', () => {
      expectSynthThrows('<ParamNotObject />', env);
    });

    it('throws when wrong children type', () => {
      expectSynthThrows('<WrongChildrenType />', env);
    });
  });

  describe('conditional expressions', () => {
    it('ok', () => {
      const env = Typecheck.env({ b: Type.boolean });
      expectSynth('b ? 1 : 2', Type.enumerate(1, 2), env);
    });

    it('ok with statically evaluable test', () => {
      expectSynth('true ? 1 : 2', Type.singleton(1));
    });

    it('ok with statically evaluable test 2', () => {
      const env = Typecheck.env({ x: Type.singleton('foo') });
      expectSynth(`x === 'foo' ? 1 : 2`, Type.singleton(1), env);
    });

    describe('narrowing', () => {
      describe('equality tests', () => {
        it('true branch', () => {
          const env = Typecheck.env({ s: Type.enumerate('foo', 'bar') });
          expectSynth(`s === 'foo' ? s : 'foo'`, Type.singleton('foo'), env);
        });

        it('false branch', () => {
          const env = Typecheck.env({ s: Type.enumerate('foo', 'bar') });
          expectSynth(`s === 'foo' ? 'bar' : s`, Type.singleton('bar'), env);
        });
      });

      describe('member expressions', () => {
        const env = Typecheck.env({
          s: Type.union(
            Type.object({ type: Type.singleton('foo'), foo: Type.number }),
            Type.object({ type: Type.singleton('bar'), bar: Type.number }),
          )
        });
        expectSynth(`s.type === 'foo' ? s.foo : s.bar`, Type.number, env);
      });

      describe('typeof expressions', () => {
        it('true branch', () => {
          const env = Typecheck.env({ s: Type.union(Type.number, Type.string) });
          expectSynth(`typeof(s) === 'string' ? s : 'foo'`, Type.string, env)
        });

        it('false branch', () => {
          const env = Typecheck.env({ s: Type.union(Type.number, Type.string) });
          expectSynth(`typeof(s) === 'string' ? 7 : s`, Type.number, env)
        });

        describe('objects', () => {
          it('true branch', () => {
            const env =
              Typecheck.env({ s: Type.undefinedOr(Type.object({ foo: Type.string })) });
            expectSynth(`typeof(s) === 'object' ? s.foo : 'foo'`, Type.string, env)
          });
        });
      });

      describe('truthiness tests', () => {
        it('truthiness', () => {
          const env = Typecheck.env({ s: Type.union(Type.number, Type.undefined) });
          expectSynth(`s ? s : 7`, Type.number, env);
        });

        it('falsiness', () => {
          const env = Typecheck.env({ s: Type.union(Type.number, Type.singleton(true)) });
          expectSynth(`!s ? s : 7`, Type.number, env);
        });
      });

      describe('nested conditionals', () => {
        const env =
          Typecheck.env({ s: Type.union(Type.number, Type.string, Type.boolean) });
        expectSynth(
          `typeof(s) === 'boolean' ? 'foo' : typeof(s) === 'number' ? 'bar' : s`,
          Type.string,
          env
        );
      });
    });
  });
});
