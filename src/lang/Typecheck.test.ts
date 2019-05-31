import * as Immutable from 'immutable';
import * as AcornJsxAst from './acornJsxAst';
import * as Parser from './Parser';
import * as Type from './Type';
import * as Typecheck from './Typecheck';

describe('check', () => {
  function expectCheckThrows(
    exprOrString: AcornJsxAst.Expression | string,
    type: Type.Type,
    env: Typecheck.Env = Immutable.Map()
  ) {
    const expr =
      (typeof exprOrString === 'string') ? Parser.parseExpression(exprOrString)
      : exprOrString;
    expect(() => Typecheck.check(expr, env, type)).toThrow();
  }

  function expectCheck(
    exprOrString: AcornJsxAst.Expression | string,
    type: Type.Type,
    env: Typecheck.Env = Immutable.Map()
  ) {
    const expr =
      (typeof exprOrString === 'string') ? Parser.parseExpression(exprOrString)
      : exprOrString;
    expect(() => Typecheck.check(expr, env, type)).not.toThrow();
  }

  describe('primitives', () => {
    describe('literals', () => {
      it('succeeds', () => {
        expectCheck('7', Type.number);
      });

      it('throws', () => {
        expectCheckThrows('7', Type.string);
      });
    });

    it('identifiers', () => {
      const env: Typecheck.Env = Immutable.Map({ foo: Type.boolean });
      expectCheck('foo', Type.boolean, env);
    });
  });

  describe('tuples', () => {
    const type = Type.tuple(Type.number, Type.boolean, Type.null);

    describe('literals', () => {
      it('succeeds', () => {
        expectCheck('[1, true, null]', type);
      });

      it ('throws', () => {
        expectCheckThrows('[1, "foo", null]', type)
      });
    });

    it('identifiers', () => {
      const env =  Immutable.Map({ foo: type });
      expectCheck('foo', type, env)
    });

    it ('throws on long tuples', () => {
      expectCheckThrows('[1, "foo", null, 1]', type)
    });
  });

  describe('arrays', () => {
    const type = Type.array(Type.number);

    describe('literals', () => {
      it('succeeds', () => {
        expectCheck('[1, 2, 3]', type);
      });

      it('throws', () => {
        expectCheckThrows('[1, true]', type);
      });
    });

    it('identifiers', () => {
      const env =  Immutable.Map({ foo: type });
      expectCheck('foo', type, env);
    });
  });

  describe('objects', () => {
    const type = Type.object({});

    it('throws on excess properties in literals', () => {
      expectCheckThrows('({ foo: 7 })', type);
    });

    it('permits excess properties in non-literal', () => {
      const env: Typecheck.Env = Immutable.Map({
        foo: Type.object({ bar: Type.number }),
      });
      expectCheck('foo', type, env);
    });
  });

  describe('singletons', () => {
    const type = Type.singleton(Type.number, 7);

    it('succeeds', () => {
      expectCheck('7', type);
    });

    it('throws', () => {
      expectCheckThrows('8', type);
    });
  });

  describe('unions', () => {
    const type = Type.union(Type.boolean, Type.number);

    it('succeeds', () => {
      expectCheck('true', type);
      expectCheck('7', type);
    });

    it('throws', () => {
      expectCheckThrows('"foo"', type);
    });

    it('union inside array', () => {
      const type = Type.array(Type.union(Type.boolean, Type.number));
      expectCheck('[ false, 7 ]', type);
    });
  });

  describe('intersections', () => {
    const type = Type.intersection(
      Type.array(Type.number),
      Type.tuple(Type.number)
    );

    it('succeeds', () => {
      expectCheck('[ 7 ]', type);
    });

    it('throws', () => {
      expectCheckThrows('[ 7, 9 ]', type);
    });
  });
});

describe('synth', () => {
  function expectSynthThrows(
    exprOrString: AcornJsxAst.Expression | string,
    env: Typecheck.Env = Immutable.Map()
  ) {
    const expr =
      (typeof exprOrString === 'string') ? Parser.parseExpression(exprOrString)
      : exprOrString;
    expect(() => Typecheck.synth(expr, env)).toThrow();
  }

  function expectSynth(
    exprOrString: AcornJsxAst.Expression | string,
    type: Type.Type,
    env: Typecheck.Env = Immutable.Map()
  ) {
    const expr =
      (typeof exprOrString === 'string') ? Parser.parseExpression(exprOrString)
      : exprOrString;
    expect(Typecheck.synth(expr, env)).toEqual(type);
  }

  describe('identifiers', () => {
    it('succeeds', () => {
      const env = Immutable.Map({ foo: Type.boolean });
      expectSynth('foo', Type.boolean, env);
    });

    it('throws', () => {
      expectSynthThrows('foo');
    });
  });

  describe('literals', () => {
    it('boolean', () => {
      expectSynth('true', Type.singleton(Type.boolean, true));
    });

    it('string', () => {
      expectSynth('"foo"', Type.singleton(Type.string, "foo"));
    });

    it('null', () => {
      expectSynth('null', Type.null);
    });
  });

  describe('arrays', () => {
    it('uniform', () => {
      // Typescript synths Array<number> here
      const type = Type.array(Type.union(
        Type.singleton(Type.number, 7),
        Type.singleton(Type.number, 9)
      ));
      expectSynth('[ 7, 9 ]', type);
    });

    it('non-uniform', () => {
      // Typescript synths Array<number | boolean> here
      const type = Type.array(Type.union(
        Type.singleton(Type.number, 7),
        Type.singleton(Type.boolean, true)
      ));
      expectSynth('[ 7, true ]', type);
    });
  });

  describe('objects', () => {
    it('succeeds', () => {
      const type = Type.object({
        foo: Type.singleton(Type.number, 7),
        bar: Type.singleton(Type.boolean, true)
      });
      expectSynth('({ foo: 7, bar: true })', type);
    });

    it('throws', () => {
      // object with duplicate field names is invalid
      expectSynthThrows('({ foo: 7, foo: 9 })');
    });
  });

  describe('binary expressions', () => {
    it('numbers', () => {
      expectSynth('1 + 2', Type.number);
    });

    it('strings', () => {
      expectSynth('"foo" + "bar"', Type.string);
    });

    it('throws', () => {
      // TODO(jdonham) permitted in Typescript
      expectSynthThrows('1 + "foo"');
    });
  });

  describe('member expressions', () => {
    const env = Immutable.Map({
      object: Type.object({ foo: Type.boolean, bar: Type.number }),
      array: Type.array(Type.number),
      tuple: Type.tuple(Type.boolean, Type.number),
      numberUnion: Type.union(
        Type.singleton(Type.number, 0),
        Type.singleton(Type.number, 1),
      ),
      stringUnion: Type.union(
        Type.singleton(Type.string, 'foo'),
        Type.singleton(Type.string, 'bar'),
      )
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
});
