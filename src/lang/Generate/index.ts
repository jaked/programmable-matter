import { bug } from '../../util/bug';
import * as model from '../../model';
import * as PMAST from '../../model/PMAST';
import * as ESTree from '../ESTree';
import * as Parse from '../Parse';
import * as JS from '@babel/types';
import babelGenerator from '@babel/generator';

const reactFragment = JS.memberExpression(JS.identifier('React'), JS.identifier('Fragment'));

const e = (el: JS.Expression, attrs: { [s: string]: JS.Expression }, ...children: JS.Expression[]) =>
  JS.callExpression(
    JS.identifier('__e'),
    [
      el,
      JS.objectExpression(Object.keys(attrs).map(key => JS.objectProperty(JS.identifier(key), attrs[key]))),
      ...children
    ]
  )


function evaluateExpression(
  ast: ESTree.Expression
): JS.Expression {
  switch (ast.type) {
    case 'Identifier':
      return JS.identifier(ast.name);

    case 'Literal':
      switch (typeof ast.value) {
        case 'boolean': return JS.booleanLiteral(ast.value);
        case 'number':  return JS.numericLiteral(ast.value);
        case 'string':  return JS.stringLiteral(ast.value);
        default: bug(`unexpected literal type ${typeof ast.value}`);
      }

    case 'BinaryExpression':
      return JS.binaryExpression(
        ast.operator,
        evaluateExpression(ast.left),
        evaluateExpression(ast.right),
      );

    case 'ConditionalExpression':
      return JS.conditionalExpression(
        evaluateExpression(ast.test),
        evaluateExpression(ast.consequent),
        evaluateExpression(ast.alternate),
      );

    default:
      throw new Error('unimplemented');
  }
}

function renderNode(
  node: PMAST.Node,
  decls: JS.Statement[],
): JS.Expression {
  if ('text' in node) {
    let text: JS.Expression = JS.stringLiteral(node.text);
    if (node.bold)          text = e(JS.stringLiteral('strong'), {}, text);
    if (node.italic)        text = e(JS.stringLiteral('em'), {}, text);
    if (node.underline)     text = e(JS.stringLiteral('u'), {}, text);
    if (node.strikethrough) text = e(JS.stringLiteral('del'), {}, text);
    if (node.subscript)     text = e(JS.stringLiteral('sub'), {}, text);
    if (node.superscript)   text = e(JS.stringLiteral('sup'), {}, text);
    if (node.code)          text = e(JS.stringLiteral('code'), {}, text);
    return e(JS.stringLiteral('span'), {}, text);
  } else {
    if (node.type === 'code') {
      if (!(node.children.length === 1)) bug('expected 1 child');
      const child = node.children[0];
      if (!(PMAST.isText(child))) bug('expected text');
      try {
        const children: JS.Expression[] = [];
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
                    const id = declarator.id.name;
                    const init = evaluateExpression(declarator.init);
                    decls.push(JS.variableDeclaration('const', [
                      JS.variableDeclarator(JS.identifier(id), init)
                    ]));
                  }
                }
              }
              break;
            }

            default:
              throw new Error('unimplemented');
          }
        }
        return e(reactFragment, {}, ...children);
      } catch (e) {
        return JS.nullLiteral();
      }
    } else if (node.type === 'inlineCode') {
      if (!(node.children.length === 1)) bug('expected 1 child');
      const child = node.children[0];
      if (!(PMAST.isText(child))) bug('expected text');
      try {
        const ast = Parse.parseExpression(child.text);
        return evaluateExpression(ast);
      } catch (e) {
        return JS.nullLiteral();
      }

    } else {
      const children = node.children.map(child => renderNode(child, decls));
      return e(JS.stringLiteral(node.type), {}, ...children);
    }
  }
}

export function generatePm(content: model.PMContent) {
  const decls: JS.Statement[] = []
  const nodes = content.nodes.map(node => renderNode(node, decls));
  const declsText = babelGenerator(JS.program(decls)).code;
  const element = babelGenerator(e(reactFragment, {}, ...nodes)).code;

  // TODO(jaked) can we use symbols instead of __ids to avoid collisions?
  return `
import React from 'https://cdn.skypack.dev/pin/react@v17.0.1-yH0aYV1FOvoIPeKBbHxg/mode=imports/optimized/react.js';
import ReactDOM from 'https://cdn.skypack.dev/pin/react-dom@v17.0.1-N7YTiyGWtBI97HFLtv0f/mode=imports/optimized/react-dom.js';

const __e = (el, props, ...children) => React.createElement(el, props, ...children)

${declsText}
const __element = ${element};

ReactDOM.hydrate(__element, document.body);
`;
}