import Type from './index';

describe('intersection', () => {
  const foo = Type.object({ foo: Type.number });
  const bar = Type.object({ bar: Type.number });
  const baz = Type.object({ baz: Type.number });

  it('returns top for empty args', () => {
    expect(Type.intersection()).toEqual(Type.unknown);
  });

  it('elides Intersection node for single elements', () => {
    const actual = Type.intersection(foo, foo);
    const expected = foo;
    expect(actual).toEqual(expected);
  });

  it('flattens nested intersections', () => {
    const actual =
      Type.intersection(foo, Type.intersection(bar, baz));
    const expected =
      Type.intersection(foo, bar, baz);
    expect(actual).toEqual(expected);
  });

  it('collapses unknowns', () => {
    const actual =
      Type.intersection(foo, Type.unknown, bar);
    const expected =
      Type.intersection(foo, bar);
    expect(actual).toEqual(expected);
  });

  it('collapses identical elements', () => {
    const actual =
      Type.intersection(foo, bar, foo);
    const expected =
      Type.intersection(foo, bar);
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

  it('collapses subtypes', () => {
    const actual =
      Type.intersection(
        Type.object({ foo: Type.string, bar: Type.boolean }),
        Type.object({ foo: Type.string, bar: Type.boolean, baz: Type.number })
      );
    const expected =
      Type.object({ foo: Type.string, bar: Type.boolean, baz: Type.number });
    expect(actual).toEqual(expected);
  });

  it('collapses redundant Nots', () => {
    const notA = Type.not(Type.singleton('a'));
    const bOrC = Type.union(Type.singleton('b'), Type.singleton('c'));
    expect(Type.intersection(notA, bOrC)).toEqual(bOrC);
  });

  it('discards noisy Nots', () => {
    const actual = Type.intersection(
      Type.not(Type.singleton('a')),
      Type.string
    );
    const expected = Type.string;
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

  it('returns bottom for uninhabited object intersections', () => {
    const a = Type.object({ type: Type.singleton('A') });
    const b = Type.object({ type: Type.singleton('B') });
    expect(Type.intersection(a, b)).toEqual(Type.never);
  });

  it('A | (A & (A | B)) === A', () => {
    const a = Type.singleton('A');
    const b = Type.singleton('B');
    const t = Type.union(a, Type.intersection(a, Type.union(a, b)));

    expect(t).toEqual(a);
  });
});
