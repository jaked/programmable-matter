import React from 'react';

import File from '../../files/File';
import Signal from '../../util/Signal';
import Try from '../../util/Try';
import * as data from '../../data';
import * as PMAST from '../../PMAST';
import Type from '../Type';

let nextKey = 0;
const KEYS = new WeakMap<PMAST.Node, string>();
function findKey(node: PMAST.Node): string {
  let key = KEYS.get(node);
  if (key === undefined) {
    key = `${nextKey++}`;
    KEYS.set(node, key);
  }
  return key;
}

export const renderNode = (node: PMAST.Node) => {
  const key = findKey(node);
  if ('text' in node) {
    let text: any = node.text;
    if (node.bold)      text = <strong>{text}</strong>;
    if (node.italic)    text = <em>{text}</em>;
    if (node.underline) text = <u>{text}</u>;
    if (node.code)      text = <code>{text}</code>;
    return <span key={key}>{text}</span>;
  } else {
    const children = node.children.map(renderNode);
    if (node.type === 'a') {
      return React.createElement(node.type, { key, href: node.href }, ...children);
    } else {
      return React.createElement(node.type, { key }, ...children);
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