import { bug } from '../../util/bug';
import * as PMAST from '../../model/PMAST';
import * as ESTree from '../ESTree';
import Type from '../Type';
import * as Parse from '../Parse';
import * as JS from '@babel/types';
import babelGenerator from '@babel/generator';

type TypeMap = (e: ESTree.Expression) => Type;
type DynamicMap = (e: ESTree.Expression) => boolean;
type Env = Map<string, JS.Expression>;

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

const maybeSignal = (test: boolean, expr: JS.Expression) =>
  test ?
    JS.callExpression(JS.memberExpression(JS.identifier('Signal'), JS.identifier('ok')), [expr]) :
    expr;

function joinDynamicExpressions(
  exprs: ESTree.Expression[],
  typeMap: TypeMap,
  dynamicMap: DynamicMap,
  env: Env,
  fn: (exprs: JS.Expression[]) => JS.Expression
): JS.Expression {
  const jsExprs = exprs.map(expr => expression(expr, typeMap, dynamicMap, env));
  const dynamics = exprs.map(expr => dynamicMap(expr));
  const signals = jsExprs.filter((value, i) => dynamics[i]);
  const vIdent = JS.identifier('__v');
  switch (signals.length) {
    case 0:
      return fn(jsExprs);

    case 1: {
      // signal.map(__v =>
      //   fn([jsExprs[0], __v, jsExprs[2], jsExprs[3]]); // depending on dynamics
      // );
      return JS.callExpression(
        JS.memberExpression(signals[0], JS.identifier('map')),
        [JS.arrowFunctionExpression(
          [vIdent],
          fn(dynamics.map((dynamic, i) =>
            dynamic ? vIdent : jsExprs[i]
          ))
        )]
      );
    }

    default: {
      let signalIndex = 0;
      // Signal.join(signals).map(__v =>
      //   fn([jsExprs[0], __v[0], jsExprs[2], jsExprs[3], __v[1]]); // depending on dynamics
      // );
      return JS.callExpression(
        JS.memberExpression(
          JS.callExpression(
            JS.memberExpression(JS.identifier('Signal'), JS.identifier('join')),
            signals
          ),
          JS.identifier('map')
        ),
        [JS.arrowFunctionExpression(
          [vIdent],
          fn(dynamics.map((dynamic, i) => {
            if (dynamic) {
              return JS.memberExpression(
                vIdent,
                JS.numericLiteral(signalIndex++),
                true // computed
              );
            } else {
              return jsExprs[i];
            }
          }))
        )]
      );
    }
  }
}

function identifier(
  ast: ESTree.Identifier,
  typeMap: TypeMap,
  dynamicMap: DynamicMap,
  env: Env,
): JS.Expression {
  return env.get(ast.name) ?? JS.identifier(ast.name);
}

function jSXIdentifier(
  ast: ESTree.JSXIdentifier,
  typeMap: TypeMap,
  dynamicMap: DynamicMap,
  env: Env,
): JS.Expression {
  return env.get(ast.name) ?? JS.identifier(ast.name);
}

function literal(
  ast: ESTree.Literal,
  typeMap: TypeMap,
  dynamicMap: DynamicMap,
  env: Env,
): JS.Expression {
  switch (typeof ast.value) {
    case 'boolean': return JS.booleanLiteral(ast.value);
    case 'number':  return JS.numericLiteral(ast.value);
    case 'string':  return JS.stringLiteral(ast.value);
    default: bug(`unexpected literal type ${typeof ast.value}`);
  }
}

function jSXExpressionContainer(
  ast: ESTree.JSXExpressionContainer,
  typeMap: TypeMap,
  dynamicMap: DynamicMap,
  env: Env,
): JS.Expression {
  return expression(ast.expression, typeMap, dynamicMap, env);
}

function jSXEmpty(
  ast: ESTree.JSXEmptyExpression,
  typeMap: TypeMap,
  dynamicMap: DynamicMap,
  env: Env,
): JS.Expression {
  return JS.identifier('undefined');
}

function jSXText(
  ast: ESTree.JSXText,
  typeMap: TypeMap,
  dynamicMap: DynamicMap,
  env: Env,
): JS.Expression {
  // whitespace trimming is not specified in JSX
  // but it is necessary for components (e.g. Victory) that process their children
  // we follow Babel, see
  // https://github.com/calebmer/node_modules/tree/master/babel-plugin-transform-jsx#trimming
  // TODO(jaked) should do this in parsing insted of eval
  const value = ast.value.replace(/\n\s*/g, '')
  if (value === '') return JS.nullLiteral();
  else return JS.stringLiteral(value);
}

function jSXElement(
  ast: ESTree.JSXElement,
  typeMap: TypeMap,
  dynamicMap: DynamicMap,
  env: Env,
): JS.Expression {
  const exprs: ESTree.Expression[] = [];
  ast.openingElement.attributes.forEach(({ value }) => { if (value) exprs.push(value) });
  if (STARTS_WITH_CAPITAL_LETTER.test(ast.openingElement.name.name))
    exprs.push(ast.openingElement.name);
  exprs.push(...ast.children);

  return joinDynamicExpressions(
    exprs,
    typeMap,
    dynamicMap,
    env,
    jsExprs => {
      const attrObjs = ast.openingElement.attributes.map(({ name, value }) => {
        if (!value) return { [name.name]: true }
        else return { [name.name]: jsExprs.shift() ?? bug(`expected jsExpr`) };
      });
      const attrs = Object.assign({}, ...attrObjs);

      const elemName = ast.openingElement.name.name;
      const elem = STARTS_WITH_CAPITAL_LETTER.test(elemName) ?
        jsExprs.shift() ?? bug(`expected jsExpr`) :
        JS.stringLiteral(elemName)

      const children = ast.children.map(child => jsExprs.shift() ?? bug(`expected jsExpr`));

      return e(elem, attrs, ...children);
    }
  );
}

function jSXFragment(
  ast: ESTree.JSXFragment,
  typeMap: TypeMap,
  dynamicMap: DynamicMap,
  env: Env,
): JS.Expression {
  return joinDynamicExpressions(
    ast.children,
    typeMap,
    dynamicMap,
    env,
    jsExprs => e(reactFragment, {}, ...jsExprs)
  );
}

function unary(
  ast: ESTree.UnaryExpression,
  typeMap: TypeMap,
  dynamicMap: DynamicMap,
  env: Env,
): JS.Expression {
  return joinDynamicExpressions(
    [ast.argument],
    typeMap,
    dynamicMap,
    env,
    ([v]) => {
      const argType = typeMap(ast.argument);
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
  );
}

function logical(
  ast: ESTree.LogicalExpression,
  typeMap: TypeMap,
  dynamicMap: DynamicMap,
  env: Env,
): JS.Expression {
  // when either left or right is dynamic the whole expression is dynamic
  // but only evaluate right if needed
  const leftExpr = expression(ast.left, typeMap, dynamicMap, env);
  const rightExpr = expression(ast.right, typeMap, dynamicMap, env);
  const leftDynamic = dynamicMap(ast.left);
  const rightDynamic = dynamicMap(ast.right);
  const fn = (leftExpr: JS.Expression) =>
    JS.conditionalExpression(
      (
        ast.operator === '||' ? leftExpr :
        ast.operator === '&&' ? JS.unaryExpression('!', leftExpr) :
        bug(`unimplemented ${(ast as any).operator}`)
      ),
      maybeSignal(rightDynamic, leftExpr),
      rightExpr
    );
  const leftIdent = JS.identifier('__left');
  if (leftDynamic && rightDynamic) {
    return JS.callExpression(
      JS.memberExpression(leftExpr, JS.identifier('flatMap')),
      [JS.arrowFunctionExpression([leftIdent], fn(leftIdent))]
    );
  } else if (leftDynamic) {
    return JS.callExpression(
      JS.memberExpression(leftExpr, JS.identifier('map')),
      [JS.arrowFunctionExpression([leftIdent], fn(leftIdent))]
    );
  } else {
    return fn(leftExpr);
  }
}

function binary(
  ast: ESTree.BinaryExpression,
  typeMap: TypeMap,
  dynamicMap: DynamicMap,
  env: Env,
): JS.Expression {
  return joinDynamicExpressions(
    [ast.left, ast.right],
    typeMap,
    dynamicMap,
    env,
    ([left, right]) => {
      const leftType = typeMap(ast.left);
      const rightType = typeMap(ast.right);

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
  );
}

function sequence(
  ast: ESTree.SequenceExpression,
  typeMap: TypeMap,
  dynamicMap: DynamicMap,
  env: Env,
): JS.Expression {
  return joinDynamicExpressions(
    ast.expressions,
    typeMap,
    dynamicMap,
    env,
    jsExprs => JS.sequenceExpression(jsExprs)
  );
}

function member(
  ast: ESTree.MemberExpression,
  typeMap: TypeMap,
  dynamicMap: DynamicMap,
  env: Env,
): JS.Expression {
  if (ast.computed) {
    return joinDynamicExpressions(
      [ast.object, ast.property],
      typeMap,
      dynamicMap,
      env,
      ([object, property]) => JS.memberExpression(object, property)
    );
  } else {
    if (ast.property.type !== 'Identifier') bug(`expected Identifier`);
    const name = ast.property.name;
    return joinDynamicExpressions(
      [ast.object],
      typeMap,
      dynamicMap,
      env,
      ([object]) => JS.memberExpression(object, JS.identifier(name))
    );
  }
}

function call(
  ast: ESTree.CallExpression,
  typeMap: TypeMap,
  dynamicMap: DynamicMap,
  env: Env,
): JS.Expression {
  return joinDynamicExpressions(
    [ast.callee, ...ast.arguments],
    typeMap,
    dynamicMap,
    env,
    ([callee, ...args]) => JS.callExpression(callee, args)
  );
}

function object(
  ast: ESTree.ObjectExpression,
  typeMap: TypeMap,
  dynamicMap: DynamicMap,
  env: Env,
): JS.Expression {
  return joinDynamicExpressions(
    ast.properties.map(prop => prop.value),
    typeMap,
    dynamicMap,
    env,
    jsExprs => JS.objectExpression(ast.properties.map((prop, i) => {
      let name: JS.Identifier | JS.StringLiteral;
      switch (prop.key.type) {
        case 'Identifier': name = JS.identifier(prop.key.name); break;
        case 'Literal': name = JS.stringLiteral(prop.key.value); break;
        default: bug(`expected Identifier or Literal`);
      }
      return JS.objectProperty(name, jsExprs[i]);
    }))
  );
}

function array(
  ast: ESTree.ArrayExpression,
  typeMap: TypeMap,
  dynamicMap: DynamicMap,
  env: Env,
): JS.Expression {
  return joinDynamicExpressions(
    ast.elements,
    typeMap,
    dynamicMap,
    env,
    jsExprs => JS.arrayExpression(jsExprs)
  );
}

function arrowFunction(
  ast: ESTree.ArrowFunctionExpression,
  typeMap: TypeMap,
  dynamicMap: DynamicMap,
  env: Env,
): JS.Expression {
  let jsBody;
  const body = ast.body;
  if (body.type === 'BlockStatement') {
    jsBody = JS.blockStatement(body.body.map((stmt, i) => {
      switch (stmt.type) {
        case 'ExpressionStatement':
          const jsExpr = expression(stmt.expression, typeMap, dynamicMap, env);
          if (i === body.body.length - 1)
            return JS.returnStatement(jsExpr);
          else
            return JS.expressionStatement(jsExpr);
        default:
          bug(`unimplemented ${stmt.type}`);
      }
    }));
  } else {
    jsBody = expression(body, typeMap, dynamicMap, env);
  }

  // if the function depends on dynamic values return a dynamic function value
  // the function itself doesn't change, but a fresh instance is created
  // in order to cause React reconciliation etc.
  // inside the function, we get() the function value
  // to cause Signal reconciliation and produce a non-Signal value
  const dynamic = dynamicMap(ast);
  if (dynamic) {
    const idents = ESTree.freeIdentifiers(ast).filter(ident => {
      // happens when an unbound identifier is used
      try { dynamicMap(ident) } catch (e) { return false; }
      // happens when an identifier is used in its own definition
      if (!env.has(ident.name)) return false;
      // TODO(jaked) check for these cases explicitly
      // so we don't hit them for an actual bug
      return dynamicMap(ident);
    });
    const signals = idents.map(ident =>
      expression(ident, typeMap, dynamicMap, env)
    );
    return JS.callExpression(
      JS.memberExpression(
        JS.callExpression(
          JS.memberExpression(JS.identifier(`Signal`), JS.identifier('join')),
          signals
        ),
        JS.identifier('map')
      ),
      [
        JS.arrowFunctionExpression(
          ast.params.map(genParam),
          // TODO(jaked) fix for BlockStatement body
          JS.callExpression(
            JS.memberExpression(jsBody, JS.identifier('get')),
            []
          )
        )
      ]
    );
  } else {
    return JS.arrowFunctionExpression(ast.params.map(genParam), jsBody);
  }
}

function conditional(
  ast: ESTree.ConditionalExpression,
  typeMap: TypeMap,
  dynamicMap: DynamicMap,
  env: Env,
): JS.Expression {
  const testExpr = expression(ast.test, typeMap, dynamicMap, env);
  const consequentExpr = expression(ast.consequent, typeMap, dynamicMap, env);
  const alternateExpr = expression(ast.alternate, typeMap, dynamicMap, env);
  const testDynamic = dynamicMap(ast.test);
  const consequentDynamic = dynamicMap(ast.consequent);
  const alternateDynamic = dynamicMap(ast.alternate);
  const fn = (testExpr: JS.Expression) =>
    JS.conditionalExpression(
      testExpr,
      maybeSignal(alternateDynamic && !consequentDynamic, consequentExpr),
      maybeSignal(consequentDynamic && !alternateDynamic, alternateExpr)
    );
  const testIdent = JS.identifier('__test');
  if (testDynamic && (consequentDynamic || alternateDynamic)) {
    return JS.callExpression(
      JS.memberExpression(testExpr, JS.identifier('flatMap')),
      [JS.arrowFunctionExpression([testIdent], fn(testIdent))]
    );
  } else if (testDynamic) {
    return JS.callExpression(
      JS.memberExpression(testExpr, JS.identifier('map')),
      [JS.arrowFunctionExpression([testIdent], fn(testIdent))]
    );
  } else {
    return fn(testExpr);
  }
}

function expression(
  ast: ESTree.Expression,
  typeMap: TypeMap,
  dynamicMap: DynamicMap,
  env: Env,
): JS.Expression {
  const type = typeMap(ast);
  if (type.kind === 'Error')
    return JS.identifier('undefined');

  switch (ast.type) {
    case 'Identifier':              return identifier(ast, typeMap, dynamicMap, env);
    case 'JSXIdentifier':           return jSXIdentifier(ast, typeMap, dynamicMap, env);
    case 'Literal':                 return literal(ast, typeMap, dynamicMap, env);
    case 'JSXExpressionContainer':  return jSXExpressionContainer(ast, typeMap, dynamicMap, env);
    case 'JSXEmptyExpression':      return jSXEmpty(ast, typeMap, dynamicMap, env);
    case 'JSXText':                 return jSXText(ast, typeMap, dynamicMap, env);
    case 'JSXElement':              return jSXElement(ast, typeMap, dynamicMap, env);
    case 'JSXFragment':             return jSXFragment(ast, typeMap, dynamicMap, env);
    case 'UnaryExpression':         return unary(ast, typeMap, dynamicMap, env);
    case 'LogicalExpression':       return logical(ast, typeMap, dynamicMap, env);
    case 'BinaryExpression':        return binary(ast, typeMap, dynamicMap, env);
    case 'SequenceExpression':      return sequence(ast, typeMap, dynamicMap, env);
    case 'MemberExpression':        return member(ast, typeMap, dynamicMap, env);
    case 'CallExpression':          return call(ast, typeMap, dynamicMap, env);
    case 'ObjectExpression':        return object(ast, typeMap, dynamicMap, env);
    case 'ArrayExpression':         return array(ast, typeMap, dynamicMap, env);
    case 'ArrowFunctionExpression': return arrowFunction(ast, typeMap, dynamicMap, env);
    case 'ConditionalExpression':   return conditional(ast, typeMap, dynamicMap, env);

    default:                         bug(`unimplemented ${ast.type}`);
  }
}

function genNode(
  node: PMAST.Node,
  typeMap: TypeMap,
  dynamicMap: DynamicMap,
  valueEnv: Env,
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
              [ expression(e, typeMap, dynamicMap, valueEnv) ]
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
    const ast = Parse.parseCodeNode(node);
    if (ast.type === 'ok') {
      for (const node of ast.ok.body) {
        switch (node.type) {
          case 'ExpressionStatement': {
            const type = typeMap(node.expression);
            const dynamic = dynamicMap(node.expression);
            if (type.kind !== 'Error' && dynamic) {
              hydrate(node.expression);
            }
          }
          break;

          // TODO(jaked) do this as a separate pass maybe
          case 'VariableDeclaration': {
            switch (node.kind) {
              case 'const': {
                for (const declarator of node.declarations) {
                  if (!declarator.init) return;
                  const name = declarator.id.name;
                  const init = expression(declarator.init, typeMap, dynamicMap, valueEnv);
                  decls.push(JS.variableDeclaration('const', [
                    JS.variableDeclarator(JS.identifier(name), init)
                  ]));
                }
              }
            }
          }
          break;

          case 'ExportNamedDeclaration': {
            switch (node.declaration.kind) {
              case 'const': {
                for (const declarator of node.declaration.declarations) {
                  if (!declarator.init) return;
                  const name = declarator.id.name;
                  const init = expression(declarator.init, typeMap, dynamicMap, valueEnv);
                  decls.push(JS.exportNamedDeclaration(JS.variableDeclaration('const', [
                    JS.variableDeclarator(JS.identifier(name), init)
                  ])));
                }
              }
            }
          }
          break;

          case 'ImportDeclaration':
            // TODO(jaked)
            break;

          default:
            bug(`unimplemented ${node.type}`);
        }
      }
    }

  } else if (PMAST.isInlineCode(node)) {
    const ast = Parse.parseInlineCodeNode(node);
    if (ast.type === 'ok') {
      const expr = ast.ok as ESTree.Expression;
      const type = typeMap(expr);
      const dynamic = dynamicMap(expr);
      if (type.kind !== 'Error' && dynamic) {
        hydrate(expr);
      }
    }

  } else if (PMAST.isElement(node)) {
    node.children.forEach(child => genNode(child, typeMap, dynamicMap, valueEnv, decls, hydrates));
  }
}

export function generatePm(
  nodes: PMAST.Node[],
  typeMap: TypeMap,
  dynamicMap: DynamicMap,
  header: boolean = true,
) {
  const decls: JS.Statement[] = [];
  const hydrates: JS.Statement[] = [];
  const valueEnv: Env = new Map<string, JS.Expression>([
    ['now', JS.memberExpression(JS.identifier('Runtime'), JS.identifier('now'))],
    ['mouse', JS.memberExpression(JS.identifier('Runtime'), JS.identifier('mouse'))],
    ['window', JS.memberExpression(JS.identifier('Runtime'), JS.identifier('window'))],
    ['Math', JS.identifier('Math')]
  ]);
  nodes.forEach(node => genNode(node, typeMap, dynamicMap, valueEnv, decls, hydrates));

  const hasHydrates = hydrates.length > 0;
  const hasExports = decls.some(decl =>
    decl.type === 'ExportNamedDeclaration' || decl.type === 'ExportDefaultDeclaration'
  );

  // TODO(jaked)
  // don't generate imports / bindings
  // unless they are referenced via a dynamic element or an export
  if (!hasHydrates && !hasExports)
    return '';

  const declsText = babelGenerator(JS.program(decls)).code;
  const hydratesText = babelGenerator(JS.program(hydrates)).code;

  // TODO(jaked) can we use symbols instead of __ids to avoid collisions?
  if (header) return `
import React from 'https://cdn.skypack.dev/pin/react@v17.0.1-yH0aYV1FOvoIPeKBbHxg/mode=imports/optimized/react.js';
import ReactDOM from 'https://cdn.skypack.dev/pin/react-dom@v17.0.1-N7YTiyGWtBI97HFLtv0f/mode=imports/optimized/react-dom.js';
import Signal from '/__runtime/Signal.js';
import * as Runtime from '/__runtime/Runtime.js';

const __e = (el, props, ...children) => React.createElement(el, props, ...children)

${declsText}
${hydratesText}
`
  else return `
  ${declsText}
  ${hydratesText}
`
}
