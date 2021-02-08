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
});
