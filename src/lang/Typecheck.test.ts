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
    env: Typecheck.Env = Immutable.Map(),
    atom: boolean = false
  ) {
    const expr =
      (typeof exprOrString === 'string') ? Parser.parseExpression(exprOrString)
      : exprOrString;
    expect(Typecheck.check(expr, env, type)).toEqual(atom);
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
      const env: Typecheck.Env = Immutable.Map({ foo: [Type.boolean, true] });
      expectCheck('foo', Type.boolean, env, true);
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
      const env: Typecheck.Env =  Immutable.Map({ foo: [type, true] });
      expectCheck('foo', type, env, true)
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
      const env: Typecheck.Env =  Immutable.Map({ foo: [type, true] });
      expectCheck('foo', type, env, true);
    });
  });

  describe('objects', () => {
    const type = Type.object({});

    it('throws on excess properties in literals', () => {
      expectCheckThrows('({ foo: 7 })', type);
    });

    it('permits excess properties in non-literal', () => {
      const env: Typecheck.Env = Immutable.Map({
        foo: [Type.object({ bar: Type.number }), true],
      });
      expectCheck('foo', type, env, true);
    });
  });

  describe('function expressions', () => {
    const type =
      Type.function(
        [ { name: 'p', type: Type.number } ],
        Type.string
      );

    it('ok', () => {
      expectCheck('x => x + "foo"', type);
    });

    it('wrong arg count', () => {
      expectCheckThrows('(x, y) => x + y', type);
    });

    it('wrong body type', () => {
      expectCheckThrows('x => x + x', type);
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
    env: Typecheck.Env = Immutable.Map(),
    atom: boolean = false
  ) {
    const expr =
      (typeof exprOrString === 'string') ? Parser.parseExpression(exprOrString)
      : exprOrString;
    expect(Typecheck.synth(expr, env)).toEqual([type, atom]);
  }

  describe('identifiers', () => {
    it('succeeds', () => {
      const env: Typecheck.Env = Immutable.Map({ foo: [Type.boolean, true] });
      expectSynth('foo', Type.boolean, env, true);
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

    it('strings + numbers', () => {
      expectSynth('"foo" + 7', Type.string);
      expectSynth('7 + "foo"', Type.string);
    });
  });

  describe('member expressions', () => {
    const env: Typecheck.Env = Immutable.Map({
      object: [Type.object({ foo: Type.boolean, bar: Type.number }), false],
      array: [Type.array(Type.number), false],
      tuple: [Type.tuple(Type.boolean, Type.number), false],
      numberUnion: [Type.union(
        Type.singleton(Type.number, 0),
        Type.singleton(Type.number, 1),
      ), false],
      stringUnion: [Type.union(
        Type.singleton(Type.string, 'foo'),
        Type.singleton(Type.string, 'bar'),
      ), false]
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
