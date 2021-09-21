import React from 'react';
import { RenderLeafProps } from 'slate-react';
import makeStyledSpan from '../../highlight/makeStyledSpan';

export default (
  setSelected: (name: string) => void = () => { },
) => {

  return ({ leaf, attributes, children } : RenderLeafProps) => {
    if (leaf.bold)
      children = <strong>{children}</strong>;
    if (leaf.italic)
      children = <em>{children}</em>;
    if (leaf.underline)
      children = <u>{children}</u>;
    if (leaf.strikethrough)
      children = <del>{children}</del>;
    if (leaf.subscript)
      children = <sub>{children}</sub>;
    if (leaf.superscript)
      children = <sup>{children}</sup>;
    if (leaf.code)
      children = <code>{children}</code>;

    let style = '';

    let onClick;
    if (leaf.link) {
      style += `
:hover {
  cursor: pointer;
}
text-decoration: underline;
`;
      const link = leaf.link;
      onClick = () => { setSelected(link) };
    }

    if (leaf.color) {
      style += `
color: ${leaf.color};
`;
    }

    if (leaf.status) {
      style += `
background-color: #ffc0c0;
`
    }

    return React.createElement(
      style === '' ? 'span' : makeStyledSpan(style),
      {
        ...attributes,
        ...(leaf.status ? { 'data-status': leaf.status } : {}),
        ...(onClick ? { onClick } : {})
      },
      children
    );
  }
}
