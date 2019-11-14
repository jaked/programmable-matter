import Type from './index';

describe('toString', () => {
  it('primitives', () => {
    expect(Type.toString(Type.boolean)).toBe("boolean");
    expect(Type.toString(Type.nullType)).toBe("null");
  });

  it('singletons', () => {
    expect(Type.toString(Type.singleton(7))).toBe("7");
    expect(Type.toString(Type.singleton("foo"))).toBe("'foo'");
  });

  it('tuples', () => {
    const t = Type.tuple(Type.boolean, Type.string);
    expect(Type.toString(t)).toBe("[boolean, string]");
  });

  it('objects', () => {
    const t = Type.object({ f: Type.boolean, g: Type.string });
    expect(Type.toString(t)).toBe("{ f: boolean, g: string }");
  });

  it('unions', () => {
    const t = Type.union(Type.boolean, Type.string);
    expect(Type.toString(t)).toBe("boolean | string");
  });

  it('intersections', () => {
    const t = Type.intersection(
      Type.object({ f: Type.boolean}),
      Type.object({ g: Type.string })
    );
    expect(Type.toString(t)).toBe("{ f: boolean } & { g: string }");
  });

  it('not', () => {
    const t = Type.not(Type.string);
    expect(Type.toString(t)).toBe("not(string)");
  });
});
