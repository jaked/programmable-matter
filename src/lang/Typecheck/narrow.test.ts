import Type from '../Type';
import { narrowType } from './narrow';

describe("narrowType", () => {
  it("narrow to notFalsy rules out undefined", () => {
    const actual = narrowType(Type.undefinedOr(Type.number), Type.notFalsy);
    const expected = Type.number;
    expect(actual).toEqual(expected);
  });

  it("narrow to notFalsy rules out undefined with object", () => {
    const object = Type.object({ foo: Type.number })
    const actual = narrowType(Type.undefinedOr(object), Type.notFalsy);
    expect(actual).toEqual(object);
  });

  it('narrow to notUndefined rules out undefined', () => {
    const actual = narrowType(Type.undefinedOrNumber, Type.notUndefined);
    expect(actual).toEqual(Type.number);
  });
});
