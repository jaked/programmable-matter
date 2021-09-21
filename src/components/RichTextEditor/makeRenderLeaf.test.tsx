import React from 'react';
import { RenderLeafProps } from 'slate-react';
import makeRenderLeaf from './makeRenderLeaf';

it('renders marks', () => {
  const text = { text: 'foo', bold: true, underline: true };
  const rendered = makeRenderLeaf()({
    leaf: text,
    attributes: {},
    children: text.text,
  } as RenderLeafProps);
  expect(rendered).toEqual(<span>
    <u><strong>foo</strong></u>
  </span>)
});
