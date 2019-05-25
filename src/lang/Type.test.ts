import * as Type from './Type';

describe('leastUpperBound', () => {
  it('returns bottom for empty args', () => {
    expect(Type.leastUpperBound()).toEqual(Type.never);
  });

  it('flattens nested unions', () => {
    const actual =
      Type.leastUpperBound(
        Type.string,
        Type.leastUpperBound(
          Type.number,
          Type.boolean)
        );
      const expected =
        Type.union(Type.string, Type.number, Type.boolean);
      expect(actual).toEqual(expected);
  });

  it('collapses identical elements', () => {
    const actual =
      Type.leastUpperBound(
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
      Type.leastUpperBound(
        Type.object({ foo: Type.string, bar: Type.boolean }),
        Type.object({ foo: Type.string, bar: Type.boolean })
      );
    const expected =
      Type.object({ foo: Type.string, bar: Type.boolean});
    expect(actual).toEqual(expected);
  });

  it('collapses equivalent elements', () => {
    const actual =
      Type.leastUpperBound(
        Type.object({ foo: Type.string, bar: Type.boolean }),
        Type.object({ bar: Type.boolean, foo: Type.string })
      );
    const expected =
      Type.object({ foo: Type.string, bar: Type.boolean});
    // TODO(jaked) Type.equiv matcher
    expect(actual).toEqual(expected);
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
  });
});
