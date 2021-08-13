import * as React from 'react';

import { bug } from '../../util/bug';
import Try from '../../util/Try';
import Signal from '../../util/Signal';
import * as PMAST from '../../pmast';
import * as ESTree from '../ESTree';
import { Interface, InterfaceMap } from '../../model';
import { computeChildren } from '../../highlight/prism';
import * as Parse from '../Parse';
import Typecheck from '../Typecheck';
import * as Evaluate from '../Evaluate';
import initEnv from './initEnv';

const intfDynamic = (intf: Interface) =>
  intf.type === 'ok' ? intf.ok.dynamic : false;

export const initInterfaceEnv: Typecheck.Env = initEnv.map(({ type, dynamic }) => (Try.ok({ type, dynamic })));
export const initValueEnv: Evaluate.Env = initEnv.map(({ value }) => value);

export const context = React.createContext<'screen' | 'server'>('screen');

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

// memo table of rendered static nodes
// code nodes or nodes containing code nodes are not memoized
// since their rendering may depend on typechecking etc.
const renderedNode = new WeakMap<PMAST.Node, React.ReactNode>();

export function renderNode(
  node: PMAST.Node,
  interfaceMap: InterfaceMap,
  valueEnv: Evaluate.Env,
  nextRootId: [ number ],
  Link: React.FunctionComponent<{ href: string }> = () => null,
): React.ReactNode {
  const rendered = renderedNode.get(node);
  if (rendered) return rendered;
  const key = findKey(node);

  if (PMAST.isText(node)) {
    let text: any = node.text;
    if (node.bold)          text = <strong>{text}</strong>;
    if (node.italic)        text = <em>{text}</em>;
    if (node.underline)     text = <u>{text}</u>;
    if (node.strikethrough) text = <del>{text}</del>;
    if (node.subscript)     text = <sub>{text}</sub>;
    if (node.superscript)   text = <sup>{text}</sup>
    if (node.code)          text = <code>{text}</code>;
    const rendered = <span key={key}>{text}</span>;
    renderedNode.set(node, rendered);
    return rendered;

  } else if (PMAST.isCode(node)) {
    if (node.language) {
      if (!(node.children.length === 1)) bug('expected 1 child');
      const child = node.children[0];
      if (!(PMAST.isText(child))) bug('expected text');
      const code = child.text;
      const children = computeChildren(code, node.language);

      return (
        <pre style={{
          backgroundColor: '#f7f7f7',
          marginLeft: '10px',
          marginRight: '10px',
          padding: '10px',
        }}>
          <code>
            {children}
          </code>
        </pre>
      );

    } else {
      const children = node.children.map(child => renderNode(child, interfaceMap, valueEnv, nextRootId, Link));
      const rendered = React.createElement('pre', { key }, ...children);
      if (node.children.every(node => renderedNode.has(node)))
        renderedNode.set(node, rendered);
      return rendered;
    }

  } else if (PMAST.isLiveCode(node)) {
    const code = Parse.parseLiveCodeNode(node);
    if (code.type !== 'ok') return null;
    const rendered: React.ReactNode[] = [];
    for (const node of (code.ok as ESTree.Program).body) {
      if (node.type === 'ExpressionStatement') {
        const dynamic = intfDynamic(interfaceMap.get(node.expression) ?? bug(`expected dynamic`));
        const value = Evaluate.evaluateExpression(node.expression, interfaceMap, valueEnv);
        if (dynamic) {
          rendered.push(<div id={`__root${nextRootId[0]}`}>{
            Signal.node(value as Signal<React.ReactNode>)
          }</div>);
          nextRootId[0]++;
        } else {
          rendered.push(value as React.ReactNode);
        }
      }
    }
    return <>{...rendered}</>;

  } else if (PMAST.isInlineLiveCode(node)) {
    const code = Parse.parseInlineLiveCodeNode(node);
    if (code.type !== 'ok') return null;
    const expr = code.ok as ESTree.Expression;
    const dynamic = intfDynamic(interfaceMap.get(expr) ?? bug(`expected dynamic`));
    const value = Evaluate.evaluateExpression(expr, interfaceMap, valueEnv);
    if (dynamic) {
      const elem = <span id={`__root${nextRootId[0]}`}>
        {Signal.node(value as Signal<React.ReactNode>)}
      </span>;
      nextRootId[0]++;
      return elem;
    } else {
      return value as React.ReactNode
    }

  } else {
    const children = node.children.map(child => renderNode(child, interfaceMap, valueEnv, nextRootId, Link));
    let rendered;
    if (node.type === 'a') {
      rendered = React.createElement(Link, { key, href: node.href }, ...children);
    } else {
      rendered = React.createElement(node.type, { key }, ...children);
    }
    if (node.children.every(node => renderedNode.has(node)))
      renderedNode.set(node, rendered);
    return rendered;
  }
}
