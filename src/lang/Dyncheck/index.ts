import * as Immutable from 'immutable';
import { bug } from '../../util/bug';
import * as ESTree from '../ESTree';
import Typecheck from '../Typecheck';
import { DynamicMap, InterfaceMap } from '../../model';

export type Env = Immutable.Map<string, boolean>;

function identifier(
  ast: ESTree.Identifier,
  interfaceMap: InterfaceMap,
  env: Env,
  dynamicMap: DynamicMap,
): boolean {
  const dynamic = env.get(ast.name);
  if (dynamic !== undefined) return dynamic;
  else if (ast.name === 'undefined') return false;
  else bug(`unbound identifier`);
}

function literal(
  ast: ESTree.Literal,
  interfaceMap: InterfaceMap,
  env: Env,
  dynamicMap: DynamicMap,
): boolean {
  return false;
}

function array(
  ast: ESTree.ArrayExpression,
  interfaceMap: InterfaceMap,
  env: Env,
  dynamicMap: DynamicMap,
): boolean {
  return ast.elements.map(ast => expression(ast, interfaceMap, env, dynamicMap)).some(dynamic => dynamic);
}

function object(
  ast: ESTree.ObjectExpression,
  interfaceMap: InterfaceMap,
  env: Env,
  dynamicMap: DynamicMap,
): boolean {
  const seen = new Set();
  return ast.properties.map(prop => {
    let name: string;
    switch (prop.key.type) {
      case 'Identifier': name = prop.key.name; break;
      case 'Literal': name = prop.key.value; break;
      default: bug('expected Identifier or Literal property name');
    }
    if (seen.has(name)) return false;
    else {
      seen.add(name);
      return expression(prop.value, interfaceMap, env, dynamicMap);
    }
  }).some(dynamic => dynamic);
}

function arrowFunction(
  ast: ESTree.ArrowFunctionExpression,
  interfaceMap: InterfaceMap,
  env: Env,
  dynamicMap: DynamicMap,
): boolean {
  env = env.withMutations(env => {
    ast.params.forEach(pat => {
      switch (pat.type) {
        case 'Identifier':
          env.set(pat.name, false);
          break;

        case 'ObjectPattern':
          pat.properties.forEach(pat => {
            if (pat.key.type !== 'Identifier') bug('expected Identifier');
            env.set(pat.key.name, false);
          });
          break;

        default: bug(`unimplemented ${(pat as ESTree.Pattern).type}`);
      }
    });
  });

  if (ast.body.type === 'BlockStatement') {
    return ast.body.body.map(stmt => {
      switch (stmt.type) {
        case 'ExpressionStatement':
          return expression(stmt.expression, interfaceMap, env, dynamicMap)
      }
    }).some(dynamic => dynamic);
  } else {
    return expression(ast.body, interfaceMap, env, dynamicMap);
  }
}

function unary(
  ast: ESTree.UnaryExpression,
  interfaceMap: InterfaceMap,
  env: Env,
  dynamicMap: DynamicMap,
): boolean {
  return expression(ast.argument, interfaceMap, env, dynamicMap);
}

function logical(
  ast: ESTree.LogicalExpression,
  interfaceMap: InterfaceMap,
  env: Env,
  dynamicMap: DynamicMap,
): boolean {
  const left = expression(ast.left, interfaceMap, env, dynamicMap);
  const right = expression(ast.right, interfaceMap, env, dynamicMap);
  return left || right;
}

function binary(
  ast: ESTree.BinaryExpression,
  interfaceMap: InterfaceMap,
  env: Env,
  dynamicMap: DynamicMap,
): boolean {
  const left = expression(ast.left, interfaceMap, env, dynamicMap);
  const right = expression(ast.right, interfaceMap, env, dynamicMap);
  return left || right;
}

function sequence(
  ast: ESTree.SequenceExpression,
  interfaceMap: InterfaceMap,
  env: Env,
  dynamicMap: DynamicMap,
): boolean {
  return ast.expressions.map(ast => expression(ast, interfaceMap, env, dynamicMap)).some(dynamic => dynamic);
}

function member(
  ast: ESTree.MemberExpression,
  interfaceMap: InterfaceMap,
  env: Env,
  dynamicMap: DynamicMap,
): boolean {
  const object = expression(ast.object, interfaceMap, env, dynamicMap);
  if (ast.computed) {
    const property = expression(ast.property, interfaceMap, env, dynamicMap);
    return object || property;
  } else {
    return object;
  }
}

function call(
  ast: ESTree.CallExpression,
  interfaceMap: InterfaceMap,
  env: Env,
  dynamicMap: DynamicMap,
): boolean {
  const callee = expression(ast.callee, interfaceMap, env, dynamicMap);
  const args = ast.arguments.map(ast => expression(ast, interfaceMap, env, dynamicMap)).some(dynamic => dynamic);
  return callee || args;
}

function conditional(
  ast: ESTree.ConditionalExpression,
  interfaceMap: InterfaceMap,
  env: Env,
  dynamicMap: DynamicMap,
): boolean {
  const test = expression(ast.test, interfaceMap, env, dynamicMap);
  const consequent = expression(ast.consequent, interfaceMap, env, dynamicMap);
  const alternate = expression(ast.alternate, interfaceMap, env, dynamicMap);
  return test || consequent || alternate;
}

function templateLiteral(
  ast: ESTree.TemplateLiteral,
  interfaceMap: InterfaceMap,
  env: Env,
  dynamicMap: DynamicMap,
): boolean {
  // TODO(jaked) handle interpolations
  return false;
}

function jSXIdentifier(
  ast: ESTree.JSXIdentifier,
  interfaceMap: InterfaceMap,
  env: Env,
  dynamicMap: DynamicMap,
): boolean {
  const dynamic = env.get(ast.name);
  if (dynamic !== undefined) return dynamic;
  else if (ast.name === 'undefined') return false;
  else bug(`unbound identifier ${ast.name}`);
}

function jSXElement(
  ast: ESTree.JSXElement,
  interfaceMap: InterfaceMap,
  env: Env,
  dynamicMap: DynamicMap,
): boolean {
  const elem = expression(ast.openingElement.name, interfaceMap, env, dynamicMap);
  const attrs = ast.openingElement.attributes.map(attr => {
    if (attr.value)
      return expression(attr.value, interfaceMap, env, dynamicMap);
    else
      return false;
  }).some(dynamic => dynamic);
  const children = ast.children.map(child =>
    expression(child, interfaceMap, env, dynamicMap)
  ).some(dynamic => dynamic);
  return elem || attrs || children;
}

function jSXFragment(
  ast: ESTree.JSXFragment,
  interfaceMap: InterfaceMap,
  env: Env,
  dynamicMap: DynamicMap,
): boolean {
  return ast.children.map(child => expression(child, interfaceMap, env, dynamicMap)).some(dynamic => dynamic);
}

function jSXExpressionContainer(
  ast: ESTree.JSXExpressionContainer,
  interfaceMap: InterfaceMap,
  env: Env,
  dynamicMap: DynamicMap,
): boolean {
  return expression(ast.expression, interfaceMap, env, dynamicMap);
}

function jSXText(
  ast: ESTree.JSXText,
  interfaceMap: InterfaceMap,
  env: Env,
  dynamicMap: DynamicMap,
): boolean {
  return false;
}

function jSXEmpty(
  ast: ESTree.JSXEmptyExpression,
  interfaceMap: InterfaceMap,
  env: Env,
  dynamicMap: DynamicMap,
): boolean {
  return false;
}

function assignment(
  ast: ESTree.AssignmentExpression,
  interfaceMap: InterfaceMap,
  env: Env,
  dynamicMap: DynamicMap,
): boolean {
  let dynamic = false;
  let object = ast.left;
  while (object.type === 'MemberExpression') {
    dynamicMap.set(object, false);
    if (object.computed)
      dynamic = dynamic || expression(object.property, interfaceMap, env, dynamicMap);
    object = object.object;
  }
  dynamicMap.set(object, false);
  dynamic = dynamic || expression(ast.right, interfaceMap, env, dynamicMap);
  return dynamic;
}

function tSAs(
  ast: ESTree.TSAsExpression,
  interfaceMap: InterfaceMap,
  env: Env,
  dynamicMap: DynamicMap,
): boolean {
  return expression(ast.expression, interfaceMap, env, dynamicMap);
}

function expressionHelper(
  ast: ESTree.Expression,
  interfaceMap: InterfaceMap,
  env: Env,
  dynamicMap: DynamicMap,
): boolean {
  const intf = interfaceMap.get(ast);
  if (intf && intf.type.kind === 'Error') return false;

  switch (ast.type) {
    case 'Identifier':              return identifier(ast, interfaceMap, env, dynamicMap);
    case 'Literal':                 return literal(ast, interfaceMap, env, dynamicMap);
    case 'ArrayExpression':         return array(ast, interfaceMap, env, dynamicMap);
    case 'ObjectExpression':        return object(ast, interfaceMap, env, dynamicMap);
    case 'ArrowFunctionExpression': return arrowFunction(ast, interfaceMap, env, dynamicMap);
    case 'UnaryExpression':         return unary(ast, interfaceMap, env, dynamicMap);
    case 'LogicalExpression':       return logical(ast, interfaceMap, env, dynamicMap);
    case 'BinaryExpression':        return binary(ast, interfaceMap, env, dynamicMap);
    case 'SequenceExpression':      return sequence(ast, interfaceMap, env, dynamicMap);
    case 'MemberExpression':        return member(ast, interfaceMap, env, dynamicMap);
    case 'CallExpression':          return call(ast, interfaceMap, env, dynamicMap);
    case 'ConditionalExpression':   return conditional(ast, interfaceMap, env, dynamicMap);
    case 'TemplateLiteral':         return templateLiteral(ast, interfaceMap, env, dynamicMap);
    case 'JSXIdentifier':           return jSXIdentifier(ast, interfaceMap, env, dynamicMap);
    case 'JSXElement':              return jSXElement(ast, interfaceMap, env, dynamicMap);
    case 'JSXFragment':             return jSXFragment(ast, interfaceMap, env, dynamicMap);
    case 'JSXExpressionContainer':  return jSXExpressionContainer(ast, interfaceMap, env, dynamicMap);
    case 'JSXText':                 return jSXText(ast, interfaceMap, env, dynamicMap);
    case 'JSXEmptyExpression':      return jSXEmpty(ast, interfaceMap, env, dynamicMap);
    case 'AssignmentExpression':    return assignment(ast, interfaceMap, env, dynamicMap);
    case 'TSAsExpression':          return tSAs(ast, interfaceMap, env, dynamicMap);

    default:
      return bug(`unimplemented AST ${ast.type}`);
  }
}

export function expression(
  ast: ESTree.Expression,
  interfaceMap: InterfaceMap,
  dynamicEnv: Env,
  dynamicMap: DynamicMap,
): boolean {
  const dynamic = expressionHelper(ast, interfaceMap, dynamicEnv, dynamicMap);
  dynamicMap.set(ast, dynamic);
  return dynamic;
}

function variableDecl(
  decl: ESTree.VariableDeclaration,
  typeEnv: Typecheck.Env,
  interfaceMap: InterfaceMap,
  dynamicEnv: Env,
  dynamicMap: DynamicMap,
): Env {
  decl.declarations.forEach(declarator => {
    let dynamic: boolean;
    const intf = typeEnv.get(declarator.id.name) ?? bug(`expected type`);
    if (intf.type.kind === 'Error') {
      dynamic = false;

    } else if (decl.kind === 'let') {

      if (intf.type.kind !== 'Abstract') bug(`expected Abstract`);

/*
      if (type.label === 'Code')
        dynamic = false;

      else if (type.label === 'Session')
        dynamic = true;
      else bug(`expected Code or Session`);
*/
      // TODO(jaked)
      // code cells are not actually dynamic
      // and we don't want to generate dynamic JS for them
      // but they are Signals
      // so must be marked dynamic so evaluation dereferences them
      // maybe we need another state to indicate that they are dynamic at edit time?
      dynamic = true;

      // let initializers are always static but we need to fill in dynamicMap
      if (!declarator.init) bug(`expected initializer`);
      expression(declarator.init, interfaceMap, dynamicEnv, dynamicMap);
    } else {
      if (!declarator.init) bug(`expected initializer`);
      dynamic = expression(declarator.init, interfaceMap, dynamicEnv, dynamicMap);
    }
    dynamicEnv = dynamicEnv.set(declarator.id.name, dynamic);
  });
  return dynamicEnv;
}

function importDecl(
  decl: ESTree.ImportDeclaration,
  interfaceMap: InterfaceMap,
  moduleEnv: Map<string, Map<string, boolean>>,
  dynamicEnv: Env,
): Env {
  const intf = interfaceMap.get(decl.source);
  if (intf && intf.type.kind === 'Error') {
    decl.specifiers.forEach(spec => {
      dynamicEnv = dynamicEnv.set(spec.local.name, false);
    });
  } else {
    const module = moduleEnv.get(decl.source.value) ?? bug(`expected module`);
    decl.specifiers.forEach(spec => {
      switch (spec.type) {
        case 'ImportNamespaceSpecifier': {
          // if any field is dynamic the whole module is dynamic
          // TODO(jaked) make this more fine-grained, see comment in compileFilePm
          const dynamic = [...module.values()].some(dynamic => dynamic);
          dynamicEnv = dynamicEnv.set(spec.local.name, dynamic);
        }
        break;

        case 'ImportDefaultSpecifier': {
          const dynamic = module.get('default') ?? false;
          dynamicEnv = dynamicEnv.set(spec.local.name, dynamic);
        }
        break;

        case 'ImportSpecifier': {
          const dynamic = module.get(spec.imported.name) ?? false;
          dynamicEnv = dynamicEnv.set(spec.local.name, dynamic);
        }
      }
    });
  }
  return dynamicEnv;
}

export function program(
  moduleEnv: Map<string, Map<string, boolean>>,
  program: ESTree.Program,
  typeEnv: Typecheck.Env,
  interfaceMap: InterfaceMap,
  dynamicEnv: Env,
  dynamicMap: DynamicMap,
): Env {
  program.body.forEach(node => {
    switch (node.type) {
      case 'ExportDefaultDeclaration':
        dynamicEnv = dynamicEnv.set('default', expression(node.declaration, interfaceMap, dynamicEnv, dynamicMap));
        break;

      case 'ExportNamedDeclaration':
        dynamicEnv = variableDecl(node.declaration, typeEnv, interfaceMap, dynamicEnv, dynamicMap);
        break;

      case 'ImportDeclaration':
        dynamicEnv = importDecl(node, interfaceMap, moduleEnv, dynamicEnv);
        break;

      case 'VariableDeclaration':
        dynamicEnv = variableDecl(node, typeEnv, interfaceMap, dynamicEnv, dynamicMap);
        break;

      case 'ExpressionStatement':
        expression(node.expression, interfaceMap, dynamicEnv, dynamicMap);
        break;
    }
  });
  return dynamicEnv;
}
