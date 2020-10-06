import React from 'react';

import File from '../../files/File';
import Signal from '../../util/Signal';
import Try from '../../util/Try';
import * as data from '../../data';
import * as PMAST from '../../PMAST';
import Type from '../Type';

export const renderNode = (node: PMAST.Node) => {
  if ('text' in node) {
    let text: any = node.text;
    if (node.bold)      text = <strong>{text}</strong>;
    if (node.italic)    text = <em>{text}</em>;
    if (node.underline) text = <u>{text}</u>;
    if (node.code)      text = <code>{text}</code>;
    return text;
  } else {
    let children = node.children.map(renderNode);
    // makes writing tests with JSX easier
    if (children.length === 1) children = children[0];
    switch (node.type) {
      case 'p':   return <p>{children}</p>;
      case 'h1':  return <h1>{children}</h1>;
      case 'h2':  return <h2>{children}</h2>;
      case 'h3':  return <h3>{children}</h3>;
      case 'h4':  return <h4>{children}</h4>;
      case 'h5':  return <h5>{children}</h5>;
      case 'h6':  return <h6>{children}</h6>;
    }
  }
}

export default function compileFilePm(
  file: File, // TODO(jaked) take a PMAST.Node[] instead of reparsing
): Signal<data.CompiledFile> {
  const nodes = file.content.map(content => PMAST.parse(content));

  const rendered = nodes.map(nodes => nodes.map(renderNode));

  return Signal.ok({
    exportType: Type.module({}),
    exportValue: { },
    rendered,
    problems: false,
    ast: Try.err(new Error('unimplemented')),
  });
}