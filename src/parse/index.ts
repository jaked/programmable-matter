import * as Babel from '@babel/parser';

import { bug } from '../util/bug';
import Try from '../util/Try';
import { InterfaceMap } from '../model';
import * as PMAST from '../pmast';
import * as ESTree from '../estree';
import Type from '../type';

export function parseProgram(input: string) {
  const ast = Babel.parse(input, {
    sourceType: 'module',
    plugins: [
      'jsx',
      'typescript',
      'estree'
    ]
  }).program as ESTree.Program;
  return ast;
}

export function parseExpression(input: string) {
  const ast = Babel.parseExpression(input, {
    sourceType: 'module',
    plugins: [
      'jsx',
      'typescript',
      'estree'
    ]
  }) as ESTree.Expression;
  return ast;
}

export function parseType(input: string): Type {
  const ast = parseExpression(`_ as ${input}`);
  if (ast.type !== 'TSAsExpression') bug(`unexpected ${ast.type}`);
  const interfaceMap: InterfaceMap = new Map();
  return Type.ofTSType(ast.typeAnnotation, interfaceMap);
}

// Slate guarantees fresh objects for changed nodes
// so it's safe to keep a global weak map (I think?)
// TODO(jaked)
// maybe it would be better to keep an explicit context of parsed code
// with explicit lifetimes?
// or maybe rewrite the PMAST with parsed code (and types / dynamic flags)
const parsedCode = new WeakMap<PMAST.Node, Try<ESTree.Node>>();

export function parseLiveCodeNode(node: PMAST.LiveCode): Try<ESTree.Program> {
  const ast = parsedCode.get(node);
  if (ast) return ast as Try<ESTree.Program>;
  if (!(node.children.length === 1)) bug('expected 1 child');
  const child = node.children[0];
  if (!(PMAST.isText(child))) bug('expected text');
  const ast2 = Try.apply(() => parseProgram(child.text));
  parsedCode.set(node, ast2);
  return ast2;
}

export function parseInlineLiveCodeNode(node: PMAST.InlineLiveCode): Try<ESTree.Expression> {
  const ast = parsedCode.get(node);
  if (ast) return ast as Try<ESTree.Expression>;
  if (!(node.children.length === 1)) bug('expected 1 child');
  const child = node.children[0];
  if (!(PMAST.isText(child))) bug('expected text');
  const ast2 = Try.apply(() => parseExpression(child.text));
  parsedCode.set(node, ast2);
  return ast2;
}
