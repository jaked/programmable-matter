import { bug } from '../../util/bug';
import { Interface } from '../../model';
import * as PMAST from '../../pmast';
import * as ESTree from '../../estree';
import * as Parse from '../../parse';
import Type from '../../type';
import * as JS from '@babel/types';
import babelGenerator from '@babel/generator';

const intfDynamic = (intf: Interface) =>
  intf.type === 'ok' ? intf.ok.dynamic : false;

const intfType = (intf: Interface) =>
  intf.type === 'ok' ? intf.ok.type : Type.error(intf.err);

function bind(
  lhs: JS.Expression,
  binder: null | string,
  body: (arg: JS.Expression) => JS.Expression
): JS.Expression {
  if (binder === null)
    return body(lhs);
  else {
    const ident = JS.identifier('__v');
    return JS.callExpression(
      JS.memberExpression(lhs, JS.identifier(binder)),
      [JS.arrowFunctionExpression([ident], body(ident))]
    );
  }
}

type InterfaceMap = (e: ESTree.Expression) => Interface;
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
  interfaceMap: InterfaceMap,
  env: Env,
  fn: (exprs: JS.Expression[]) => JS.Expression
): JS.Expression {
  const jsExprs = exprs.map(expr => expression(expr, interfaceMap, env));
  const dynamics = exprs.map(expr => intfDynamic(interfaceMap(expr)));
  const signals = jsExprs.filter((value, i) => dynamics[i]);
  const vIdent = JS.identifier('__v');
  switch (signals.length) {
    case 0:
      return fn(jsExprs);

    case 1: {
      let signal = signals[0];
      let arg: JS.Expression = vIdent;
      // collapse adjacent maps
      if (
        signal.type === 'CallExpression' &&
        signal.callee.type === 'MemberExpression' &&
        signal.callee.property.type === 'Identifier' &&
        signal.callee.property.name === 'map' &&
        signal.arguments[0].type === 'ArrowFunctionExpression' &&
        signal.arguments[0].body.type !== 'BlockStatement'
      ) {
        arg = signal.arguments[0].body;
        signal = signal.callee.object;
      }
      // signal.map(__v =>
      //   fn([jsExprs[0], __v, jsExprs[2], jsExprs[3]]); // depending on dynamics
      // );
      return JS.callExpression(
        JS.memberExpression(signal, JS.identifier('map')),
        [JS.arrowFunctionExpression(
          [vIdent],
          fn(dynamics.map((dynamic, i) =>
            dynamic ? arg : jsExprs[i]
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
  interfaceMap: InterfaceMap,
  env: Env,
): JS.Expression {
  const intf = interfaceMap(ast);
  if (intf.type === 'err') bug(`expected ok`);
  const expr = env.get(ast.name) ?? JS.identifier(ast.name);
  if (!intf.ok.dynamic && intf.ok.mutable)
    return JS.callExpression(JS.memberExpression(expr, JS.identifier('get')), []);
  else
    return expr;
}

function jSXIdentifier(
  ast: ESTree.JSXIdentifier,
  interfaceMap: InterfaceMap,
  env: Env,
): JS.Expression {
  const intf = interfaceMap(ast);
  if (intf.type === 'err') bug(`expected ok`);
  const expr = env.get(ast.name) ?? JS.identifier(ast.name);
  if (!intf.ok.dynamic && intf.ok.mutable)
    return JS.callExpression(JS.memberExpression(expr, JS.identifier('get')), []);
  else
    return expr;
}

function literal(
  ast: ESTree.Literal,
  interfaceMap: InterfaceMap,
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
  interfaceMap: InterfaceMap,
  env: Env,
): JS.Expression {
  return expression(ast.expression, interfaceMap, env);
}

function jSXEmpty(
  ast: ESTree.JSXEmptyExpression,
  interfaceMap: InterfaceMap,
  env: Env,
): JS.Expression {
  return JS.identifier('undefined');
}

function jSXText(
  ast: ESTree.JSXText,
  interfaceMap: InterfaceMap,
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
  interfaceMap: InterfaceMap,
  env: Env,
): JS.Expression {
  const exprs: ESTree.Expression[] = [];
  ast.openingElement.attributes.forEach(({ value }) => { if (value) exprs.push(value) });
  if (STARTS_WITH_CAPITAL_LETTER.test(ast.openingElement.name.name))
    exprs.push(ast.openingElement.name);
  exprs.push(...ast.children);

  return joinDynamicExpressions(
    exprs,
    interfaceMap,
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
  interfaceMap: InterfaceMap,
  env: Env,
): JS.Expression {
  return joinDynamicExpressions(
    ast.children,
    interfaceMap,
    env,
    jsExprs => e(reactFragment, {}, ...jsExprs)
  );
}

function unary(
  ast: ESTree.UnaryExpression,
  interfaceMap: InterfaceMap,
  env: Env,
): JS.Expression {
  return joinDynamicExpressions(
    [ast.argument],
    interfaceMap,
    env,
    ([v]) => {
      const argIntf = interfaceMap(ast.argument);
      switch (ast.operator) {
        case '+':
        case '-':
        case '!':
          return JS.unaryExpression(ast.operator, v);
        case 'typeof':
          if (argIntf.type === 'err')
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
  interfaceMap: InterfaceMap,
  env: Env,
): JS.Expression {
  // when either left or right is dynamic the whole expression is dynamic
  // but only evaluate right if needed
  const leftExpr = expression(ast.left, interfaceMap, env);
  const rightExpr = expression(ast.right, interfaceMap, env);
  const leftDynamic = intfDynamic(interfaceMap(ast.left));
  const rightDynamic = intfDynamic(interfaceMap(ast.right));
  const body = (leftExpr: JS.Expression) =>
    JS.conditionalExpression(
      (
        ast.operator === '||' ? leftExpr :
        ast.operator === '&&' ? JS.unaryExpression('!', leftExpr) :
        ast.operator === '??' ? JS.binaryExpression('!==', leftExpr, JS.identifier('undefined')) :
        bug(`unimplemented ${(ast as any).operator}`)
      ),
      maybeSignal(rightDynamic, leftExpr),
      rightExpr
    );
  const binder =
    leftDynamic ?
      (rightDynamic ? 'flatMap' : 'map') :
      null;
  return bind(leftExpr, binder, body);
}

function binary(
  ast: ESTree.BinaryExpression,
  interfaceMap: InterfaceMap,
  env: Env,
): JS.Expression {
  return joinDynamicExpressions(
    [ast.left, ast.right],
    interfaceMap,
    env,
    ([left, right]) => {
      const leftIntf = interfaceMap(ast.left);
      const rightIntf = interfaceMap(ast.right);

      switch (ast.operator) {
        case '+':
        case '-':
        case '*':
        case '/':
        case '%':
        case '|':
        case '&':
        case '^':
        case '<<':
        case '>>':
        case '>>>':
          if (leftIntf.type === 'err') return right;
          else if (rightIntf.type === 'err') return left;
          else return JS.binaryExpression(ast.operator, left, right);

        case '===':
          if (leftIntf.type === 'err' || rightIntf.type === 'err')
            return JS.booleanLiteral(false);
          else
            return JS.binaryExpression('===', left, right);

        case '!==':
          if (leftIntf.type === 'err' || rightIntf.type === 'err')
            return JS.booleanLiteral(true);
          else
            return JS.binaryExpression('!==', left, right);

        case '<':
        case '<=':
        case '>':
        case '>=':
          return JS.binaryExpression(ast.operator, left, right)

        default:
          bug(`unimplemented ${ast.operator}`);
      }
    }
  );
}

function sequence(
  ast: ESTree.SequenceExpression,
  interfaceMap: InterfaceMap,
  env: Env,
): JS.Expression {
  return joinDynamicExpressions(
    ast.expressions,
    interfaceMap,
    env,
    jsExprs => JS.sequenceExpression(jsExprs)
  );
}

function member(
  ast: ESTree.MemberExpression,
  interfaceMap: InterfaceMap,
  env: Env,
): JS.Expression {
  let expr;
  if (ast.computed) {
    expr = joinDynamicExpressions(
      [ast.object, ast.property],
      interfaceMap,
      env,
      ([object, property]) => JS.memberExpression(object, property, /* computed */ true)
    );
  } else {
    if (ast.property.type !== 'Identifier') bug(`expected Identifier`);
    const name = ast.property.name;
    expr = joinDynamicExpressions(
      [ast.object],
      interfaceMap,
      env,
      ([object]) => JS.memberExpression(object, JS.identifier(name))
    );
  }
  const intf = interfaceMap(ast);
  if (intf.type === 'err') bug(`expected ok`);
  if (!intf.ok.dynamic && intf.ok.mutable)
    return JS.callExpression(JS.memberExpression(expr, JS.identifier('get')), []);
  else
    return expr;
}

function call(
  ast: ESTree.CallExpression,
  interfaceMap: InterfaceMap,
  env: Env,
): JS.Expression {
  return joinDynamicExpressions(
    [ast.callee, ...ast.arguments],
    interfaceMap,
    env,
    ([callee, ...args]) => JS.callExpression(callee, args)
  );
}

function object(
  ast: ESTree.ObjectExpression,
  interfaceMap: InterfaceMap,
  env: Env,
): JS.Expression {
  return joinDynamicExpressions(
    ast.properties.map(prop => prop.value),
    interfaceMap,
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
  interfaceMap: InterfaceMap,
  env: Env,
): JS.Expression {
  return joinDynamicExpressions(
    ast.elements,
    interfaceMap,
    env,
    jsExprs => JS.arrayExpression(jsExprs)
  );
}

function arrowFunction(
  ast: ESTree.ArrowFunctionExpression,
  interfaceMap: InterfaceMap,
  env: Env,
): JS.Expression {
  let jsBody;
  const body = ast.body;
  if (body.type === 'BlockStatement') {
    jsBody = JS.blockStatement(body.body.map((stmt, i) => {
      switch (stmt.type) {
        case 'ExpressionStatement':
          const jsExpr = expression(stmt.expression, interfaceMap, env);
          if (i === body.body.length - 1)
            return JS.returnStatement(jsExpr);
          else
            return JS.expressionStatement(jsExpr);
        default:
          bug(`unimplemented ${stmt.type}`);
      }
    }));
  } else {
    jsBody = expression(body, interfaceMap, env);
  }

  // if the function depends on dynamic values return a dynamic function value
  // the function itself doesn't change, but a fresh instance is created
  // in order to cause React reconciliation etc.
  // inside the function, we get() the function value
  // to cause Signal reconciliation and produce a non-Signal value
  // TODO(jaked)
  // do we actually need to join on dynamic deps?
  // or just let them be reconciled when the function runs
  const dynamic = intfDynamic(interfaceMap(ast));
  if (dynamic) {
    const idents = ESTree.freeIdentifiers(ast).filter(ident =>
      intfDynamic(interfaceMap(ident))
    );
    const signals = idents.map(ident =>
      expression(ident, interfaceMap, env)
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
          [],
          JS.arrowFunctionExpression(
            ast.params.map(genParam),
            // TODO(jaked) fix for BlockStatement body
            JS.callExpression(
              JS.memberExpression(jsBody, JS.identifier('get')),
              []
            )
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
  interfaceMap: InterfaceMap,
  env: Env,
): JS.Expression {
  const consequentExpr = expression(ast.consequent, interfaceMap, env);
  const alternateExpr = expression(ast.alternate, interfaceMap, env);
  const testIntf = interfaceMap(ast.test);
  const testType = intfType(testIntf);
  const consequentDynamic = intfDynamic(interfaceMap(ast.consequent));
  const alternateDynamic = intfDynamic(interfaceMap(ast.alternate));

  const body =
    Type.isTruthy(testType) ?
      (testExpr: JS.Expression) => JS.sequenceExpression([testExpr, consequentExpr]) :
    Type.isFalsy(testType) ?
      (testExpr: JS.Expression) => JS.sequenceExpression([testExpr, alternateExpr]) :
    (testExpr: JS.Expression) =>
      JS.conditionalExpression(
        testExpr,
        maybeSignal(alternateDynamic && !consequentDynamic, consequentExpr),
        maybeSignal(consequentDynamic && !alternateDynamic, alternateExpr)
      );

  const binder =
    intfDynamic(testIntf) ? (
      Type.isTruthy(testType) ? (consequentDynamic ? 'flatMap' : 'map') :
      Type.isFalsy(testType) ? (alternateDynamic ? 'flatMap' : 'map') :
      (consequentDynamic || alternateDynamic) ? 'flatMap' : 'map'
    ) : null

  return bind(expression(ast.test, interfaceMap, env), binder, body);
}

function templateLiteral(
  ast: ESTree.TemplateLiteral,
  interfaceMap: InterfaceMap,
  env: Env,
): JS.Expression {
  // TODO(jaked) handle interpolations
  return JS.stringLiteral(
    ast.quasis.map(elem => elem.value.raw).join('')
  );
}

function assignment(
  ast: ESTree.AssignmentExpression,
  interfaceMap: InterfaceMap,
  env: Env,
): JS.Expression {
  const leftIntf = interfaceMap(ast.left);
  const rightIntf = interfaceMap(ast.right);
  if (leftIntf.type === 'err' || rightIntf.type === 'err') {
    // TODO(jaked) we should return rhs when it's OK I think
    return JS.identifier('undefined');
  } else {
    const props: (JS.Expression | null)[] = [];
    const exprs: ESTree.Expression[] = [ast.right];
    let object = ast.left;
    let objectIntf = interfaceMap(object);
    while (objectIntf.type === 'ok' && objectIntf.ok.mutable === undefined && object.type === 'MemberExpression') {
      if (object.computed) {
        props.unshift(null);
        exprs.unshift(object.property);
      } else {
        if (object.property.type !== 'Identifier') bug(`expected Identifier`);
        props.unshift(JS.identifier(object.property.name));
      }
      object = object.object;
      objectIntf = interfaceMap(object);
    }
    let objectSignal;
    switch (object.type) {
      case 'Identifier':
        objectSignal = JS.identifier(object.name);
        break;
      case 'MemberExpression':
        const objectValue = expression(object.object, interfaceMap, env) as object;
        if (object.property.type !== 'Identifier') bug(`expected Identifier`);
        objectSignal = objectValue[object.property.name];
        break;
      default:
        bug(`unexpected ast ${object.type}`);
    }
    return joinDynamicExpressions(
      exprs,
      interfaceMap,
      env,
      jsExprs => {
        const right = jsExprs.pop() ?? bug(`expected jsExpr`);
        if (props.length === 0) {
          return JS.sequenceExpression([
            JS.callExpression(
              JS.memberExpression(objectSignal, JS.identifier('setOk')),
              [right]
            ),
            right,
          ]);
        } else {
          const __object = JS.identifier('__object');
          let left: JS.Expression = __object;
          while (props.length > 0) {
            const prop = props.shift();
            if (prop) {
              left = JS.memberExpression(left, prop);
            } else {
              const jsExpr = jsExprs.shift() ?? bug(`expected jsExpr`);
              left = JS.memberExpression(left, jsExpr, /* computed */ true);
            }
          }
          return JS.sequenceExpression([
            JS.callExpression(
              JS.memberExpression(objectSignal, JS.identifier('produce')),
              [JS.arrowFunctionExpression(
                [__object],
                JS.blockStatement([
                  JS.expressionStatement(JS.assignmentExpression('=', left, right))
                ])
              )]
            ),
            right
          ]);
        }
      }
    )
  }
}

function tSAs(
  ast: ESTree.TSAsExpression,
  interfaceMap: InterfaceMap,
  env: Env
): JS.Expression {
  return expression(ast.expression, interfaceMap, env);
}

export function expression(
  ast: ESTree.Expression,
  interfaceMap: InterfaceMap,
  env: Env,
): JS.Expression {
  const intf = interfaceMap(ast);
  if (intf.type === 'err')
    return JS.identifier('undefined');

  switch (ast.type) {
    case 'Identifier':              return identifier(ast, interfaceMap, env);
    case 'JSXIdentifier':           return jSXIdentifier(ast, interfaceMap, env);
    case 'Literal':                 return literal(ast, interfaceMap, env);
    case 'JSXExpressionContainer':  return jSXExpressionContainer(ast, interfaceMap, env);
    case 'JSXEmptyExpression':      return jSXEmpty(ast, interfaceMap, env);
    case 'JSXText':                 return jSXText(ast, interfaceMap, env);
    case 'JSXElement':              return jSXElement(ast, interfaceMap, env);
    case 'JSXFragment':             return jSXFragment(ast, interfaceMap, env);
    case 'UnaryExpression':         return unary(ast, interfaceMap, env);
    case 'LogicalExpression':       return logical(ast, interfaceMap, env);
    case 'BinaryExpression':        return binary(ast, interfaceMap, env);
    case 'SequenceExpression':      return sequence(ast, interfaceMap, env);
    case 'MemberExpression':        return member(ast, interfaceMap, env);
    case 'CallExpression':          return call(ast, interfaceMap, env);
    case 'ObjectExpression':        return object(ast, interfaceMap, env);
    case 'ArrayExpression':         return array(ast, interfaceMap, env);
    case 'ArrowFunctionExpression': return arrowFunction(ast, interfaceMap, env);
    case 'ConditionalExpression':   return conditional(ast, interfaceMap, env);
    case 'TemplateLiteral':         return templateLiteral(ast, interfaceMap, env);
    case 'AssignmentExpression':    return assignment(ast, interfaceMap, env);
    case 'TSAsExpression':          return tSAs(ast, interfaceMap, env);

    default:                         bug(`unimplemented ${ast.type}`);
  }
}

function variableDecl(
  ast: ESTree.VariableDeclaration,
  interfaceMap: InterfaceMap,
  env: Env,
  decls: JS.Statement[],
) {
  switch (ast.kind) {
    case 'const': {
      for (const declarator of ast.declarations) {
        if (!declarator.init) return;
        const name = declarator.id.name;
        const init = expression(declarator.init, interfaceMap, env);
        decls.push(JS.variableDeclaration('const', [
          JS.variableDeclarator(JS.identifier(name), init)
        ]));
      }
    }
    break;

    case 'let': {
      for (const declarator of ast.declarations) {
        if (!declarator.init) return;
        const name = declarator.id.name;
        const init = JS.callExpression(
          JS.memberExpression(JS.identifier('Signal'), JS.identifier('cellOk')),
          [expression(declarator.init, interfaceMap, env)]
        );

        decls.push(JS.variableDeclaration('const', [
          JS.variableDeclarator(JS.identifier(name), init)
        ]));
      }
    }
    break;
  }
}

function exportNamedDecl(
  ast: ESTree.ExportNamedDeclaration,
  interfaceMap: InterfaceMap,
  env: Env,
  decls: JS.Statement[],
) {
  switch (ast.declaration.kind) {
    case 'const': {
      for (const declarator of ast.declaration.declarations) {
        if (!declarator.init) return;
        const name = declarator.id.name;
        const init = expression(declarator.init, interfaceMap, env);
        decls.push(JS.exportNamedDeclaration(JS.variableDeclaration('const', [
          JS.variableDeclarator(JS.identifier(name), init)
        ])));
      }
    }
    break;

    case 'let': {
      for (const declarator of ast.declaration.declarations) {
        if (!declarator.init) return;
        const name = declarator.id.name;
        const init = JS.callExpression(
          JS.memberExpression(JS.identifier('Signal'), JS.identifier('cellOk')),
          [expression(declarator.init, interfaceMap, env)]
        );

        decls.push(JS.exportNamedDeclaration(JS.variableDeclaration('const', [
          JS.variableDeclarator(JS.identifier(name), init)
        ])));
      }
    }
    break;
  }
}

function genNode(
  node: PMAST.Node,
  interfaceMap: InterfaceMap,
  env: Env,
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
              [ expression(e, interfaceMap, env) ]
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

  if (PMAST.isLiveCode(node)) {
    const ast = Parse.parseLiveCodeNode(node);
    if (ast.type === 'ok') {
      for (const node of ast.ok.body) {
        switch (node.type) {
          case 'ExpressionStatement': {
            const dynamic = intfDynamic(interfaceMap(node.expression));
            if (dynamic) {
              hydrate(node.expression);
            }
          }
          break;

          // TODO(jaked) do this as a separate pass maybe
          case 'VariableDeclaration':
            variableDecl(
              node,
              interfaceMap,
              env,
              decls
            );
            break;

          case 'ExportNamedDeclaration':
            exportNamedDecl(
              node,
              interfaceMap,
              env,
              decls
            );
            break;

          case 'ImportDeclaration':
            // TODO(jaked)
            break;

          default:
            bug(`unimplemented ${node.type}`);
        }
      }
    }

  } else if (PMAST.isInlineLiveCode(node)) {
    const ast = Parse.parseInlineLiveCodeNode(node);
    if (ast.type === 'ok') {
      const expr = ast.ok as ESTree.Expression;
      const dynamic = intfDynamic(interfaceMap(expr));
      if (dynamic) {
        hydrate(expr);
      }
    }

  } else if (PMAST.isElement(node)) {
    node.children.forEach(child => genNode(child, interfaceMap, env, decls, hydrates));
  }
}

export function generatePm(
  nodes: PMAST.Node[],
  interfaceMap: InterfaceMap,
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
  nodes.forEach(node => genNode(node, interfaceMap, valueEnv, decls, hydrates));

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
