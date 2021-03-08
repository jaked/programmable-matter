import { bug } from '../../util/bug';
import * as model from '../../model';
import * as PMAST from '../../model/PMAST';
import * as ESTree from '../ESTree';
import * as Parse from '../Parse';

const e = (el: string, attrs: {}, ...children: string[]) =>
  `__e(${el}, {}, ${children.join(', ')})`

function evaluateExpression(
  ast: ESTree.Expression
): string {
  switch (ast.type) {
    case 'Identifier':
      return ast.name;

      case 'Literal':
      return JSON.stringify(ast.value);

    case 'BinaryExpression': {
      const left = evaluateExpression(ast.left);
      const right = evaluateExpression(ast.right);
      return `(${left} ${ast.operator} ${right})`;
    }

    case 'ConditionalExpression': {
      const test = evaluateExpression(ast.test);
      const consequent = evaluateExpression(ast.consequent);
      const alternate = evaluateExpression(ast.alternate);
      return `(${test} ? ${consequent} : ${alternate})`;
    }

    default:
      throw new Error('unimplemented');
  }
}

function renderNode(
  node: PMAST.Node,
  decls: string[],
): string {
  if ('text' in node) {
    let text: string = JSON.stringify(node.text);
    if (node.bold)          text = e(`'strong'`, {}, text);
    if (node.italic)        text = e(`'em'`, {}, text);
    if (node.underline)     text = e(`'u'`, {}, text);
    if (node.strikethrough) text = e(`'del'`, {}, text);
    if (node.subscript)     text = e(`'sub'`, {}, text);
    if (node.superscript)   text = e(`'sup'`, {}, text);
    if (node.code)          text = e(`'code'`, {}, text);
    return e(`'span'`, {}, text);
  } else {
    if (node.type === 'code') {
      if (!(node.children.length === 1)) bug('expected 1 child');
      const child = node.children[0];
      if (!(PMAST.isText(child))) bug('expected text');
      try {
        const children: string[] = [];
        const ast = Parse.parseProgram(child.text);
        for (const node of ast.body) {
          switch (node.type) {
            case 'ExpressionStatement':
              children.push(evaluateExpression(node.expression));
              break;

            case 'VariableDeclaration': {
              switch (node.kind) {
                case 'const': {
                  for (const declarator of node.declarations) {
                    const name = declarator.id.name;
                    const value = evaluateExpression(declarator.init);
                    decls.push(`const ${name} = ${value};`);
                  }
                }
              }
              break;
            }

            default:
              throw new Error('unimplemented');
          }
        }
        return e('React.Fragment', {}, ...children);
      } catch (e) {
        return 'null';
      }
    } else if (node.type === 'inlineCode') {
      if (!(node.children.length === 1)) bug('expected 1 child');
      const child = node.children[0];
      if (!(PMAST.isText(child))) bug('expected text');
      try {
        const ast = Parse.parseExpression(child.text);
        return evaluateExpression(ast);
      } catch (e) {
        return 'null';
      }

    } else {
      const children = node.children.map(child => renderNode(child, decls));
      return e(`'${node.type}'`, {}, ...children);
    }
  }
}

export function generatePm(content: model.PMContent) {
  const decls: string[] = []
  const nodes = content.nodes.map(node => renderNode(node, decls));
  const element = e('React.Fragment', {}, ...nodes);

  // TODO(jaked) can we use symbols instead of __ids to avoid collisions?
  return `
import React from 'https://cdn.skypack.dev/pin/react@v17.0.1-yH0aYV1FOvoIPeKBbHxg/mode=imports/optimized/react.js';
import ReactDOM from 'https://cdn.skypack.dev/pin/react-dom@v17.0.1-N7YTiyGWtBI97HFLtv0f/mode=imports/optimized/react-dom.js';

const __e = (el, props, ...children) => React.createElement(el, props, ...children)

${decls.join('\n')}
const __element = ${element};

ReactDOM.hydrate(__element, document.body);
`;
}