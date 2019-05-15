import * as Type from './Type';

describe('union', () => {
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

  it('deduplicates elements', () => {
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
});
