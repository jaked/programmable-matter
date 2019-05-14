/// <reference types="jest" />

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
      Type.union(Type.string, Type.boolean, Type.string);
    const expected =
      Type.union(Type.string, Type.boolean);
    expect(actual).toEqual(expected);
  });
});
