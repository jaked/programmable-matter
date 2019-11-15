import Type from './index';
import { isPrimitiveSubtype } from './isSubtype';

describe('isPrimitiveSubtype', () => {
  it('singletons', () => {
    expect(isPrimitiveSubtype(Type.singleton(7), Type.number)).toBe(true);
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
      const a = Type.functionType(
        [ Type.number ],
        Type.string);
      const b = Type.functionType(
        [ Type.never ],
        Type.unknown);
      expect(Type.isSubtype(a, b)).toBe(true);
    });

    it('wrong number of args', () => {
      const a = Type.functionType(
        [ Type.number ],
        Type.string);
      const b = Type.functionType(
        [ ],
        Type.unknown);
      expect(Type.isSubtype(a, b)).toBe(false);
    });

    it('wrong arg variance', () => {
      const a = Type.functionType(
        [ Type.number ],
        Type.string);
      const b = Type.functionType(
        [ Type.unknown ],
        Type.unknown);
      expect(Type.isSubtype(a, b)).toBe(false);
    });

    it('wrong return variance', () => {
      const a = Type.functionType(
        [ Type.number ],
        Type.string);
      const b = Type.functionType(
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

    it('different values', () => {
      expect(Type.isSubtype(Type.singleton(7), Type.singleton(9))).toBe(false);
    });

    it('singleton a subtype of base type', () => {
      expect(Type.isSubtype(Type.singleton(7), Type.number)).toBe(true);
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
