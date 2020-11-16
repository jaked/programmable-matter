import React from 'react';

import { bug } from '../../util/bug';
import File from '../../files/File';
import Signal from '../../util/Signal';
import Try from '../../util/Try';
import * as data from '../../data';
import * as PMAST from '../../PMAST';
import * as Parse from '../Parse';
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
    return <span style={{whiteSpace: 'pre-line'}} key={key}>{text}</span>;
  } else {
    const children = node.children.map(renderNode);
    if (node.type === 'a') {
      return React.createElement(node.type, { key, href: node.href }, ...children);
    } else if (node.type === 'code' || node.type === 'inlineCode') {
      return null;
    } else {
      return React.createElement(node.type, { key }, ...children);
    }
  }
}

const parseCode = (node: PMAST.Node, parsedCode: WeakMap<PMAST.Node, unknown>) => {
  if (parsedCode.has(node)) return;

  if (PMAST.isCode(node) || PMAST.isInlineCode(node)) {
    // TODO(jaked) don't reparse if text hasn't changed
    // TODO(jaked) enforce tree constraints in editor
    if (!(node.children.length === 1)) bug('expected 1 child');
    const child = node.children[0];
    if (!(PMAST.isText(child))) bug('expected text');
    if (PMAST.isCode(node)) {
      const ast = Try.apply(() => Parse.parseProgram(child.text));
      parsedCode.set(node, ast);
    } else {
      const ast = Try.apply(() => Parse.parseExpression(child.text));
      parsedCode.set(node, ast);
    }
  } else if (PMAST.isElement(node)) {
    node.children.map(child => parseCode(child, parsedCode));
  }
}

export default function compileFilePm(
  file: File, // TODO(jaked) take a PMAST.Node[] instead of reparsing
): Signal<data.CompiledFile> {
  // TODO(jaked) handle parse errors
  const nodes = file.content.map(content => PMAST.parse(content));
  const ast = nodes.map(nodes => {
    const parsedCode = new WeakMap<PMAST.Node, unknown>();
    nodes.forEach(node => parseCode(node, parsedCode));
    return { nodes, parsedCode }
  });
  const rendered = nodes.map(nodes => nodes.map(renderNode));

  return ast.map(ast => ({
    exportType: Type.module({}),
    exportValue: { },
    rendered,
    problems: false,
    ast: Try.ok(ast),
  }));
}
