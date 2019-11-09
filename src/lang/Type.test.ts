import * as Type from './Type';

describe('union', () => {
  it('returns bottom for empty args', () => {
    expect(Type.union()).toEqual(Type.never);
  });

  it('flattens nested unions', () => {
    const actual =
      Type.union(
        Type.string,
        Type.union(
          Type.number,
          Type.boolean)
        );
      const expected =
        Type.union(Type.string, Type.number, Type.boolean);
      expect(actual).toEqual(expected);
  });

  it('collapses identical elements', () => {
    const actual =
      Type.union(
        Type.array(Type.string),
        Type.boolean,
        Type.array(Type.string)
      );
    const expected =
      Type.union(Type.array(Type.string), Type.boolean);
    expect(actual).toEqual(expected);
  });

  it('elides Union node for single elements', () => {
    const actual =
      Type.union(
        Type.object({ foo: Type.string, bar: Type.boolean }),
        Type.object({ foo: Type.string, bar: Type.boolean })
      );
    const expected =
      Type.object({ foo: Type.string, bar: Type.boolean});
    expect(actual).toEqual(expected);
  });

  it('collapses equivalent elements', () => {
    const actual =
      Type.union(
        Type.object({ foo: Type.string, bar: Type.boolean }),
        Type.object({ bar: Type.boolean, foo: Type.string })
      );
    const expected =
      Type.object({ foo: Type.string, bar: Type.boolean});
    expect(actual).toEqual(expected);
  });
});

describe('intersection', () => {
  const foo = Type.object({ foo: Type.number });
  const bar = Type.object({ bar: Type.number });
  const baz = Type.object({ baz: Type.number });

  it('returns top for empty args', () => {
    expect(Type.intersection()).toEqual(Type.unknown);
  });

  it('flattens nested intersections', () => {
    const actual =
      Type.intersection(foo, Type.intersection(bar, baz));
    const expected =
      Type.intersection(foo, bar, baz);
    expect(actual).toEqual(expected);
  });

  it('collapses identical elements', () => {
    const actual =
      Type.intersection(foo, bar, foo);
    const expected =
      Type.intersection(foo, bar);
    expect(actual).toEqual(expected);
  });

  it('elides Intersection node for single elements', () => {
    const actual =
      Type.intersection(foo, foo);
    const expected = foo;
    expect(actual).toEqual(expected);
  });

  it('collapses equivalent elements', () => {
    const actual =
      Type.intersection(
        Type.object({ foo: Type.string, bar: Type.boolean }),
        Type.object({ bar: Type.boolean, foo: Type.string })
      );
    const expected =
      Type.object({ foo: Type.string, bar: Type.boolean});
    expect(actual).toEqual(expected);
  });

  it('distributes intersection over union', () => {
    const [a, b, c] =
      ['a', 'b', 'c'].map(x => Type.object({ [x]: Type.boolean }));
    const actual =
      Type.intersection(a, Type.union(b, c));
    const expected =
      Type.union(Type.intersection(a, b), Type.intersection(a, c));
    expect(actual).toEqual(expected);
  });

  it('returns bottom for uninhabited intersections', () => {
    const a = Type.singleton('A');
    const b = Type.singleton('B');
    expect(Type.intersection(a, b)).toEqual(Type.never);
  });

  it('A | (A & (A | B)) === A', () => {
    const a = Type.singleton('A');
    const b = Type.singleton('B');
    const t = Type.union(a, Type.intersection(a, Type.union(a, b)));

    expect(t).toEqual(a);
  });
});

describe('isSubtype', () => {
  // TODO(jaked) figure out property testing
  describe('never', () => {
    it('is bottom', () => {
      const types = [ Type.number, Type.string, Type.tuple(Type.number) ];
      types.forEach(t =>
        expect(Type.isSubtype(Type.never, t)).toBe(true)
      );
    })
  });

  describe('unknown', () => {
    it('is top', () => {
      const types = [ Type.number, Type.string, Type.tuple(Type.number) ];
      types.forEach(t =>
        expect(Type.isSubtype(t, Type.unknown)).toBe(true)
      );
    })
  });

  describe('Function', () => {
    it('ok', () => {
      const a = Type.function(
        [ Type.number ],
        Type.string);
      const b = Type.function(
        [ Type.never ],
        Type.unknown);
      expect(Type.isSubtype(a, b)).toBe(true);
    });

    it('wrong number of args', () => {
      const a = Type.function(
        [ Type.number ],
        Type.string);
      const b = Type.function(
        [ ],
        Type.unknown);
      expect(Type.isSubtype(a, b)).toBe(false);
    });

    it('wrong arg variance', () => {
      const a = Type.function(
        [ Type.number ],
        Type.string);
      const b = Type.function(
        [ Type.unknown ],
        Type.unknown);
      expect(Type.isSubtype(a, b)).toBe(false);
    });

    it('wrong return variance', () => {
      const a = Type.function(
        [ Type.number ],
        Type.string);
      const b = Type.function(
        [ Type.never ],
        Type.never);
      expect(Type.isSubtype(a, b)).toBe(false);
    });
  });

  describe('Object', () => {
    it('handles wider <: narrower subtyping', () => {
      const a = Type.object({ x: Type.string, y: Type.number });
      const b = Type.object({ x: Type.string });
      expect(Type.isSubtype(a, b)).toBe(true);
    });

    it('handles subtyping in fields', () => {
      const a = Type.object({ x: Type.string });
      const b = Type.object({ x: Type.union(Type.string, Type.number) });
      expect(Type.isSubtype(a, b)).toBe(true);
    });
  });

  describe('Singleton', () => {
    it('reflexive', () => {
      const t = Type.singleton(7);
      expect(Type.isSubtype(t, t)).toBe(true);
    });
  });

  describe('Union', () => {
    it('handles permutation', () => {
      const a = Type.union(Type.number, Type.boolean, Type.string);
      const b = Type.union(Type.string, Type.number, Type.boolean);
      expect(Type.isSubtype(a, b)).toBe(true);
      expect(Type.isSubtype(b, a)).toBe(true);
    });

    it('handles narrower <: wider subtyping', () => {
      const a = Type.union(Type.string, Type.boolean);
      const b = Type.union(Type.string, Type.number, Type.boolean);
      expect(Type.isSubtype(a, b)).toBe(true);
    });

    it('C<A | B> <: C<A> | C<B>', () => {
      const a = Type.union(Type.array(Type.string), Type.array(Type.boolean));
      const b = Type.array(Type.union(Type.string, Type.boolean));
      expect(Type.isSubtype(a, b)).toBe(true);
      expect(Type.isSubtype(b, a)).toBe(false);
    });

    it('singletons', () => {
      const a = Type.singleton(7);
      const b = Type.union(a, Type.singleton(9));
      expect(Type.isSubtype(a, b)).toBe(true);
    });

    it('fields that may be undefined are optional', () => {
      const styleType = Type.object({
        fontSize: Type.undefinedOrString,
        height: Type.string,
      });
      const actual = Type.object({
        height: Type.singleton('350px')
      })
      expect(Type.isSubtype(actual, styleType)).toBe(true);
    });
  });
});
