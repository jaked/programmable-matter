import { bug } from '../../util/bug';
import * as PMAST from '../../model/PMAST';
import * as ESTree from '../ESTree';
import Type from '../Type';
import * as Parse from '../Parse';
import * as JS from '@babel/types';
import babelGenerator from '@babel/generator';

type InterfaceMap = (e: ESTree.Expression) => Type;
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
  interfaceMap: InterfaceMap,
  dynamicMap: DynamicMap,
  env: Env,
  fn: (exprs: JS.Expression[]) => JS.Expression
): JS.Expression {
  const jsExprs = exprs.map(expr => expression(expr, interfaceMap, dynamicMap, env));
  const dynamics = exprs.map(expr => dynamicMap(expr));
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
  dynamicMap: DynamicMap,
  env: Env,
): JS.Expression {
  return env.get(ast.name) ?? JS.identifier(ast.name);
}

function jSXIdentifier(
  ast: ESTree.JSXIdentifier,
  interfaceMap: InterfaceMap,
  dynamicMap: DynamicMap,
  env: Env,
): JS.Expression {
  return env.get(ast.name) ?? JS.identifier(ast.name);
}

function literal(
  ast: ESTree.Literal,
  interfaceMap: InterfaceMap,
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
  interfaceMap: InterfaceMap,
  dynamicMap: DynamicMap,
  env: Env,
): JS.Expression {
  return expression(ast.expression, interfaceMap, dynamicMap, env);
}

function jSXEmpty(
  ast: ESTree.JSXEmptyExpression,
  interfaceMap: InterfaceMap,
  dynamicMap: DynamicMap,
  env: Env,
): JS.Expression {
  return JS.identifier('undefined');
}

function jSXText(
  ast: ESTree.JSXText,
  interfaceMap: InterfaceMap,
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
  interfaceMap: InterfaceMap,
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
    interfaceMap,
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
  interfaceMap: InterfaceMap,
  dynamicMap: DynamicMap,
  env: Env,
): JS.Expression {
  return joinDynamicExpressions(
    ast.children,
    interfaceMap,
    dynamicMap,
    env,
    jsExprs => e(reactFragment, {}, ...jsExprs)
  );
}

function unary(
  ast: ESTree.UnaryExpression,
  interfaceMap: InterfaceMap,
  dynamicMap: DynamicMap,
  env: Env,
): JS.Expression {
  return joinDynamicExpressions(
    [ast.argument],
    interfaceMap,
    dynamicMap,
    env,
    ([v]) => {
      const argType = interfaceMap(ast.argument);
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
  interfaceMap: InterfaceMap,
  dynamicMap: DynamicMap,
  env: Env,
): JS.Expression {
  // when either left or right is dynamic the whole expression is dynamic
  // but only evaluate right if needed
  const leftExpr = expression(ast.left, interfaceMap, dynamicMap, env);
  const rightExpr = expression(ast.right, interfaceMap, dynamicMap, env);
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
  interfaceMap: InterfaceMap,
  dynamicMap: DynamicMap,
  env: Env,
): JS.Expression {
  return joinDynamicExpressions(
    [ast.left, ast.right],
    interfaceMap,
    dynamicMap,
    env,
    ([left, right]) => {
      const leftType = interfaceMap(ast.left);
      const rightType = interfaceMap(ast.right);

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
  interfaceMap: InterfaceMap,
  dynamicMap: DynamicMap,
  env: Env,
): JS.Expression {
  return joinDynamicExpressions(
    ast.expressions,
    interfaceMap,
    dynamicMap,
    env,
    jsExprs => JS.sequenceExpression(jsExprs)
  );
}

function member(
  ast: ESTree.MemberExpression,
  interfaceMap: InterfaceMap,
  dynamicMap: DynamicMap,
  env: Env,
): JS.Expression {
  if (ast.computed) {
    return joinDynamicExpressions(
      [ast.object, ast.property],
      interfaceMap,
      dynamicMap,
      env,
      ([object, property]) => JS.memberExpression(object, property, /* computed */ true)
    );
  } else {
    if (ast.property.type !== 'Identifier') bug(`expected Identifier`);
    const name = ast.property.name;
    return joinDynamicExpressions(
      [ast.object],
      interfaceMap,
      dynamicMap,
      env,
      ([object]) => JS.memberExpression(object, JS.identifier(name))
    );
  }
}

function call(
  ast: ESTree.CallExpression,
  interfaceMap: InterfaceMap,
  dynamicMap: DynamicMap,
  env: Env,
): JS.Expression {
  return joinDynamicExpressions(
    [ast.callee, ...ast.arguments],
    interfaceMap,
    dynamicMap,
    env,
    ([callee, ...args]) => JS.callExpression(callee, args)
  );
}

function object(
  ast: ESTree.ObjectExpression,
  interfaceMap: InterfaceMap,
  dynamicMap: DynamicMap,
  env: Env,
): JS.Expression {
  return joinDynamicExpressions(
    ast.properties.map(prop => prop.value),
    interfaceMap,
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
  interfaceMap: InterfaceMap,
  dynamicMap: DynamicMap,
  env: Env,
): JS.Expression {
  return joinDynamicExpressions(
    ast.elements,
    interfaceMap,
    dynamicMap,
    env,
    jsExprs => JS.arrayExpression(jsExprs)
  );
}

function arrowFunction(
  ast: ESTree.ArrowFunctionExpression,
  interfaceMap: InterfaceMap,
  dynamicMap: DynamicMap,
  env: Env,
): JS.Expression {
  let jsBody;
  const body = ast.body;
  if (body.type === 'BlockStatement') {
    jsBody = JS.blockStatement(body.body.map((stmt, i) => {
      switch (stmt.type) {
        case 'ExpressionStatement':
          const jsExpr = expression(stmt.expression, interfaceMap, dynamicMap, env);
          if (i === body.body.length - 1)
            return JS.returnStatement(jsExpr);
          else
            return JS.expressionStatement(jsExpr);
        default:
          bug(`unimplemented ${stmt.type}`);
      }
    }));
  } else {
    jsBody = expression(body, interfaceMap, dynamicMap, env);
  }

  // if the function depends on dynamic values return a dynamic function value
  // the function itself doesn't change, but a fresh instance is created
  // in order to cause React reconciliation etc.
  // inside the function, we get() the function value
  // to cause Signal reconciliation and produce a non-Signal value
  // TODO(jaked)
  // do we actually need to join on dynamic deps?
  // or just let them be reconciled when the function runs
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
      expression(ident, interfaceMap, dynamicMap, env)
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
  dynamicMap: DynamicMap,
  env: Env,
): JS.Expression {
  const testExpr = expression(ast.test, interfaceMap, dynamicMap, env);
  const consequentExpr = expression(ast.consequent, interfaceMap, dynamicMap, env);
  const alternateExpr = expression(ast.alternate, interfaceMap, dynamicMap, env);
  const testDynamic = dynamicMap(ast.test);
  const consequentDynamic = dynamicMap(ast.consequent);
  const alternateDynamic = dynamicMap(ast.alternate);
  const fn = (testExpr: JS.Expression) =>
    JS.conditionalExpression(
      testExpr,
      maybeSignal(alternateDynamic && !consequentDynamic, consequentExpr),
      maybeSignal(consequentDynamic && !alternateDynamic, alternateExpr)
    );
  const vIdent = JS.identifier('__v');
  if (testDynamic && (consequentDynamic || alternateDynamic)) {
    return JS.callExpression(
      JS.memberExpression(testExpr, JS.identifier('flatMap')),
      [JS.arrowFunctionExpression([vIdent], fn(vIdent))]
    );
  } else if (testDynamic) {
    return JS.callExpression(
      JS.memberExpression(testExpr, JS.identifier('map')),
      [JS.arrowFunctionExpression([vIdent], fn(vIdent))]
    );
  } else {
    return fn(testExpr);
  }
}

function templateLiteral(
  ast: ESTree.TemplateLiteral,
  interfaceMap: InterfaceMap,
  dynamicMap: DynamicMap,
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
  dynamicMap: DynamicMap,
  env: Env,
): JS.Expression {
  const leftType = interfaceMap(ast.left);
  const rightType = interfaceMap(ast.right);
  if (leftType.kind === 'Error' || rightType.kind === 'Error') {
    // TODO(jaked) we should return rhs when it's OK I think
    return JS.identifier('undefined');
  } else {
    const props: (JS.Expression | null)[] = [];
    const exprs: ESTree.Expression[] = [ast.right];
    let object = ast.left;
    while (object.type === 'MemberExpression') {
      if (object.computed) {
        props.unshift(null);
        exprs.unshift(object.property);
      } else {
        if (object.property.type !== 'Identifier') bug(`expected Identifier`);
        props.unshift(JS.identifier(object.property.name));
      }
      object = object.object;
    }
    exprs.unshift(object);
    return joinDynamicExpressions(
      exprs,
      interfaceMap,
      dynamicMap,
      env,
      jsExprs => {
        const object = jsExprs.shift() ?? bug(`expected jsExpr`);
        const right = jsExprs.pop() ?? bug(`expected jsExpr`);
        if (props.length === 0) {
          return JS.sequenceExpression([
            JS.callExpression(
              JS.memberExpression(object, JS.identifier('setOk')),
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
              JS.memberExpression(object, JS.identifier('produce')),
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

function expression(
  ast: ESTree.Expression,
  interfaceMap: InterfaceMap,
  dynamicMap: DynamicMap,
  env: Env,
): JS.Expression {
  const type = interfaceMap(ast);
  if (type.kind === 'Error')
    return JS.identifier('undefined');

  switch (ast.type) {
    case 'Identifier':              return identifier(ast, interfaceMap, dynamicMap, env);
    case 'JSXIdentifier':           return jSXIdentifier(ast, interfaceMap, dynamicMap, env);
    case 'Literal':                 return literal(ast, interfaceMap, dynamicMap, env);
    case 'JSXExpressionContainer':  return jSXExpressionContainer(ast, interfaceMap, dynamicMap, env);
    case 'JSXEmptyExpression':      return jSXEmpty(ast, interfaceMap, dynamicMap, env);
    case 'JSXText':                 return jSXText(ast, interfaceMap, dynamicMap, env);
    case 'JSXElement':              return jSXElement(ast, interfaceMap, dynamicMap, env);
    case 'JSXFragment':             return jSXFragment(ast, interfaceMap, dynamicMap, env);
    case 'UnaryExpression':         return unary(ast, interfaceMap, dynamicMap, env);
    case 'LogicalExpression':       return logical(ast, interfaceMap, dynamicMap, env);
    case 'BinaryExpression':        return binary(ast, interfaceMap, dynamicMap, env);
    case 'SequenceExpression':      return sequence(ast, interfaceMap, dynamicMap, env);
    case 'MemberExpression':        return member(ast, interfaceMap, dynamicMap, env);
    case 'CallExpression':          return call(ast, interfaceMap, dynamicMap, env);
    case 'ObjectExpression':        return object(ast, interfaceMap, dynamicMap, env);
    case 'ArrayExpression':         return array(ast, interfaceMap, dynamicMap, env);
    case 'ArrowFunctionExpression': return arrowFunction(ast, interfaceMap, dynamicMap, env);
    case 'ConditionalExpression':   return conditional(ast, interfaceMap, dynamicMap, env);
    case 'TemplateLiteral':         return templateLiteral(ast, interfaceMap, dynamicMap, env);
    case 'AssignmentExpression':    return assignment(ast, interfaceMap, dynamicMap, env);

    default:                         bug(`unimplemented ${ast.type}`);
  }
}

function variableDecl(
  ast: ESTree.VariableDeclaration,
  interfaceMap: InterfaceMap,
  dynamicMap: DynamicMap,
  env: Env,
  decls: JS.Statement[],
) {
  switch (ast.kind) {
    case 'const': {
      for (const declarator of ast.declarations) {
        if (!declarator.init) return;
        const name = declarator.id.name;
        const init = expression(declarator.init, interfaceMap, dynamicMap, env);
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
          [expression(declarator.init, interfaceMap, dynamicMap, env)]
        );

        decls.push(JS.variableDeclaration('let', [
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
  dynamicMap: DynamicMap,
  env: Env,
  decls: JS.Statement[],
) {
  switch (ast.declaration.kind) {
    case 'const': {
      for (const declarator of ast.declaration.declarations) {
        if (!declarator.init) return;
        const name = declarator.id.name;
        const init = expression(declarator.init, interfaceMap, dynamicMap, env);
        decls.push(JS.exportNamedDeclaration(JS.variableDeclaration('const', [
          JS.variableDeclarator(JS.identifier(name), init)
        ])));
      }
    }
  }
}

function genNode(
  node: PMAST.Node,
  interfaceMap: InterfaceMap,
  dynamicMap: DynamicMap,
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
              [ expression(e, interfaceMap, dynamicMap, env) ]
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
            const type = interfaceMap(node.expression);
            const dynamic = dynamicMap(node.expression);
            if (type.kind !== 'Error' && dynamic) {
              hydrate(node.expression);
            }
          }
          break;

          // TODO(jaked) do this as a separate pass maybe
          case 'VariableDeclaration':
            variableDecl(
              node,
              interfaceMap,
              dynamicMap,
              env,
              decls
            );
            break;

          case 'ExportNamedDeclaration':
            exportNamedDecl(
              node,
              interfaceMap,
              dynamicMap,
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

  } else if (PMAST.isInlineCode(node)) {
    const ast = Parse.parseInlineCodeNode(node);
    if (ast.type === 'ok') {
      const expr = ast.ok as ESTree.Expression;
      const type = interfaceMap(expr);
      const dynamic = dynamicMap(expr);
      if (type.kind !== 'Error' && dynamic) {
        hydrate(expr);
      }
    }

  } else if (PMAST.isElement(node)) {
    node.children.forEach(child => genNode(child, interfaceMap, dynamicMap, env, decls, hydrates));
  }
}

export function generatePm(
  nodes: PMAST.Node[],
  interfaceMap: InterfaceMap,
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
  nodes.forEach(node => genNode(node, interfaceMap, dynamicMap, valueEnv, decls, hydrates));

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
