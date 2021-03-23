import * as Immer from 'immer';
import { bug } from '../../util/bug';
import Try from '../../util/Try';
import * as PMAST from '../../model/PMAST';
import * as ESTree from '../ESTree';
import Type from '../Type';
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

function genParam(
  param: ESTree.Pattern
): JS.Identifier | JS.Pattern {
  switch (param.type) {
    case 'Identifier':
      return JS.identifier(param.name);

    case 'ObjectPattern':
      return JS.objectPattern(param.properties.map(prop => {
        if (prop.key.type !== 'Identifier') bug(`expected Identifier`);
        return JS.objectProperty(JS.identifier(prop.key.name), genParam(prop.value));
      }));

    default: bug(`unimplemented ${(param as ESTree.Pattern).type}`);
  }
}

const STARTS_WITH_CAPITAL_LETTER = /^[A-Z]/

function genExpr(
  ast: ESTree.Expression,
  annots: (e: ESTree.Expression) => Type,
  env: Map<string, JS.Expression>,
): JS.Expression {
  const type = annots(ast);
  if (type.kind === 'Error')
    return JS.identifier('undefined');

    switch (ast.type) {
    case 'Identifier':
      return env.get(ast.name) ?? JS.identifier(ast.name);

    case 'Literal':
      switch (typeof ast.value) {
        case 'boolean': return JS.booleanLiteral(ast.value);
        case 'number':  return JS.numericLiteral(ast.value);
        case 'string':  return JS.stringLiteral(ast.value);
        default: bug(`unexpected literal type ${typeof ast.value}`);
      }

    case 'JSXExpressionContainer':
      return genExpr(ast.expression, annots, env);

    case 'JSXEmptyExpression':
      return JS.identifier('undefined');

    case 'JSXText': {
      // whitespace trimming is not specified in JSX
      // but it is necessary for components (e.g. Victory) that process their children
      // we follow Babel, see
      // https://github.com/calebmer/node_modules/tree/master/babel-plugin-transform-jsx#trimming
      // TODO(jaked) should do this in parsing insted of eval
      const value = ast.value.replace(/\n\s*/g, '')
      if (value === '') return JS.nullLiteral();
      else return JS.stringLiteral(value);
    }

    case 'JSXElement': {
      const attrObjs = ast.openingElement.attributes.map(({ name, value }) => {
        if (!value) return { [name.name]: true }
        else return { [name.name]: genExpr(value, annots, env) };
      });
      const attrs = Object.assign({}, ...attrObjs);

      const name = ast.openingElement.name.name;
      return e(
        STARTS_WITH_CAPITAL_LETTER.test(name) ?  JS.identifier(name) : JS.stringLiteral(name),
        attrs,
        ...ast.children.map(child => genExpr(child, annots, env))
      );
    }

    case 'JSXFragment':
      return e(
        reactFragment,
        {},
        ...ast.children.map(child => genExpr(child, annots, env))
      );

    case 'UnaryExpression': {
      const argType = annots(ast.argument);
      const v = genExpr(ast.argument, annots, env);
      switch (ast.operator) {
        case '+':
        case '-':
        case '!':
          return JS.unaryExpression(ast.operator, v);
        case 'typeof':
          if (argType.kind === 'Error')
            return JS.stringLiteral('error');
          else
            return JS.unaryExpression('typeof', v);
        default: bug(`unimplemented ${(ast as ESTree.UnaryExpression).operator}`);
      }
    }

    case 'LogicalExpression': {
      return JS.logicalExpression(
        ast.operator,
        genExpr(ast.left, annots, env),
        genExpr(ast.right, annots, env),
      );
    }

    case 'BinaryExpression': {
      const left = genExpr(ast.left, annots, env);
      const right = genExpr(ast.right, annots, env);
      const leftType = annots(ast.left);
      const rightType = annots(ast.right);

      switch (ast.operator) {
        case '+':
        case '-':
        case '*':
        case '/':
        case '%':
          if (leftType.kind === 'Error') return right;
          else if (rightType.kind === 'Error') return left;
          else return JS.binaryExpression(ast.operator, left, right);

        case '===':
          if (leftType.kind === 'Error' || rightType.kind === 'Error')
            return JS.booleanLiteral(false);
          else
            return JS.binaryExpression('===', left, right);

        case '!==':
          if (leftType.kind === 'Error' || rightType.kind === 'Error')
            return JS.booleanLiteral(true);
          else
            return JS.binaryExpression('!==', left, right);

        default:
          bug(`unimplemented ${ast.operator}`);
      }
    }

    case 'SequenceExpression':
      return JS.sequenceExpression(ast.expressions.map(expr => genExpr(expr, annots, env)));

    case 'MemberExpression': {
      let property;
      if (ast.computed) {
        property = genExpr(ast.property, annots, env);
      } else if (ast.property.type === 'Identifier') {
        property = JS.identifier(ast.property.name);
      } else {
        bug (`expected identifier ${JSON.stringify(ast.property)}`);
      }
      return JS.memberExpression(genExpr(ast.object, annots, env), property);
    }

    case 'CallExpression':
      return JS.callExpression(
        genExpr(ast.callee, annots, env),
        ast.arguments.map(arg => genExpr(arg, annots, env))
      );

    case 'ObjectExpression':
      return JS.objectExpression(ast.properties.map(prop => {
        let key;
        if (prop.computed) {
          key = genExpr(prop.key, annots, env);
        } else if (prop.key.type === 'Identifier') {
          key = JS.identifier(prop.key.name);
        } else {
          bug (`expected identifier ${JSON.stringify(prop.key)}`);
        }
        return JS.objectProperty(key, genExpr(prop.value, annots, env));
      }));

    case 'ArrayExpression':
      return JS.arrayExpression(ast.elements.map(e => genExpr(e, annots, env)));

    case 'ArrowFunctionExpression':
      return JS.arrowFunctionExpression(ast.params.map(genParam), genExpr(ast.body, annots, env));

    case 'ConditionalExpression':
      return JS.conditionalExpression(
        genExpr(ast.test, annots, env),
        genExpr(ast.consequent, annots, env),
        genExpr(ast.alternate, annots, env),
      );

    default:
      bug('unimplemented ${ast.type}');
  }
}

function genExprSignal(
  ast: ESTree.Expression,
  annots: (e: ESTree.Expression) => Type,
  env: Map<string, JS.Expression>,
): JS.Expression {
  const idents = ESTree.freeIdentifiers(ast);
  console.log(idents);
  const signals = idents.map(ident => env.get(ident) ?? JS.identifier(ident));
  // shadow the bindings of things in the global environment
  const env2 = Immer.produce(env, env => {
    idents.forEach(ident => {
      (env as Map<string, JS.Expression>).set(ident, JS.identifier(ident));
    });
  });
  const expr = genExpr(ast, annots, env2);

  switch (idents.length) {
    case 0:
      // Signal.ok(${expr})
      return (
        JS.callExpression(
          JS.memberExpression(JS.identifier('Signal'), JS.identifier('ok')),
          [ expr ]
        )
      );

    case 1:
      // ${signal}.map({$ident} => expr)
      return (
        JS.callExpression(
          JS.memberExpression(signals[0], JS.identifier('map')),
          [
            JS.arrowFunctionExpression(
              [ JS.identifier(idents[0]) ],
              expr
            )
          ]
        )
      );

    default:
      // Signal.join(...${signals}).map(([...${idents}]) => ${expr})
      return (
        JS.callExpression(
          JS.memberExpression(
            JS.callExpression(
              JS.memberExpression(JS.identifier('Signal'), JS.identifier('join')),
              signals
            ),
            JS.identifier('map'),
          ),
          [
            JS.arrowFunctionExpression(
              [ JS.arrayPattern(idents.map(ident => JS.identifier(ident))) ],
              expr,
            )
          ]
        )
      );
  }
}

function genNode(
  node: PMAST.Node,
  parsedCode: (code: PMAST.Node) => Try<ESTree.Node>,
  annots: (e: ESTree.Expression) => Type,
  env: Map<string, JS.Expression>,
  decls: JS.Statement[],
  hydrates: JS.Statement[],
): void {
  const hydrate = (e: ESTree.Expression) => {
    // ReactDOM.hydrate(Signal.node(expr), document.getElementById(id))
    hydrates.push(
      JS.expressionStatement(
        JS.callExpression(
          JS.memberExpression(JS.identifier('ReactDOM'), JS.identifier('hydrate')),
          [
            JS.callExpression(
              JS.memberExpression(JS.identifier('Signal'), JS.identifier('node')),
              [ genExprSignal(e, annots, env) ]
            ),
            JS.callExpression(
              JS.memberExpression(JS.identifier('document'), JS.identifier('getElementById')),
              [ JS.stringLiteral(`__root${hydrates.length}`) ]
            )
          ]
        )
      )
    );
  }

  if (PMAST.isCode(node)) {
    const ast = parsedCode(node);
    if (ast.type === 'ok') {
      for (const node of (ast.ok as ESTree.Program).body) {
        switch (node.type) {
          case 'ExpressionStatement':
            hydrate(node.expression);
            break;

          // TODO(jaked) do this as a separate pass maybe
          case 'VariableDeclaration': {
            switch (node.kind) {
              case 'const': {
                for (const declarator of node.declarations) {
                  const id = declarator.id.name;
                  const init = genExprSignal(declarator.init, annots, env);
                  decls.push(JS.variableDeclaration('const', [
                    JS.variableDeclarator(JS.identifier(id), init)
                  ]));
                }
              }
            }
            break;
          }

          default:
            bug(`unimplemented ${ast.type}`);
        }
      }
    }

  } else if (PMAST.isInlineCode(node)) {
    const ast = parsedCode(node);
    if (ast.type === 'ok') {
      hydrate(ast.ok as ESTree.Expression);
    }

  } else if (PMAST.isElement(node)) {
    node.children.forEach(child => genNode(child, parsedCode, annots, env, decls, hydrates));
  }
}

export function generatePm(
  nodes: PMAST.Node[],
  parsedCode: (code: PMAST.Node) => Try<ESTree.Node>,
  annots: (e: ESTree.Expression) => Type
) {
  const decls: JS.Statement[] = [];
  const hydrates: JS.Statement[] = [];
  const env = new Map<string, JS.Expression>([
    ['now', JS.memberExpression(JS.identifier('Runtime'), JS.identifier('now'))],
    ['mouse', JS.memberExpression(JS.identifier('Runtime'), JS.identifier('mouse'))],
    ['Math', JS.callExpression(
      JS.memberExpression(JS.identifier('Signal'), JS.identifier('ok')),
      [ JS.identifier('Math') ]
    )],
  ]);
  nodes.forEach(node => genNode(node, parsedCode, annots, env, decls, hydrates));
  const declsText = babelGenerator(JS.program(decls)).code;
  const hydratesText = babelGenerator(JS.program(hydrates)).code;

  // TODO(jaked) can we use symbols instead of __ids to avoid collisions?
  return `
import React from 'https://cdn.skypack.dev/pin/react@v17.0.1-yH0aYV1FOvoIPeKBbHxg/mode=imports/optimized/react.js';
import ReactDOM from 'https://cdn.skypack.dev/pin/react-dom@v17.0.1-N7YTiyGWtBI97HFLtv0f/mode=imports/optimized/react-dom.js';
import Signal from './__runtime/Signal.js';
import * as Runtime from './__runtime/Runtime.js';

const __e = (el, props, ...children) => React.createElement(el, props, ...children)

${declsText}
${hydratesText}
`;
}
