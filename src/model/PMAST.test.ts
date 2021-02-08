import * as PMAST from './PMAST';

describe('validateNodes', () => {
  it('allows inlines in header', () => {
    const nodes: PMAST.Node[] = [
      { type: 'h1', children: [
        { text: 'foo' },
        { type: `inlineCode`, children: [ { text: 'bar' } ]},
        { text: 'baz' },
      ]}
    ];
    expect(() => PMAST.validateNodes(nodes)).not.toThrow();
  })

  it('allows headers inside blockquotes', () => {
    const nodes: PMAST.Node[] = [
      { type: 'blockquote', children: [
        { type: 'h1', children:[{text:'header'}]}
      ]}
    ];
    expect(() => PMAST.validateNodes(nodes)).not.toThrow();
  });
});
