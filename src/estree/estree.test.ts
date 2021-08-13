import * as ESTree from '.';
import * as Parse from '../parse';

describe('visit', () => {
  it('BlockStatement', () => {
    const code = `() => { x }`
    const fn = () => {}
    expect(() => ESTree.visit(Parse.parseExpression(code), fn)).not.toThrow();
  });
});

describe('freeIdentifiers', () => {
  it('BlockStatement', () => {
    const code = `() => { x }`
    expect(
      ESTree.freeIdentifiers(Parse.parseExpression(code)).map(ident => ident.name)
    ).toEqual(['x']);
  });
});
