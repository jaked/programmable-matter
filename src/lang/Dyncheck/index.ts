import * as Immutable from 'immutable';
import { bug } from '../../util/bug';
import * as ESTree from '../ESTree';
import Typecheck from '../Typecheck';
import { DynamicMap, TypeMap } from '../../model';

export type Env = Immutable.Map<string, boolean>;

function identifier(
  ast: ESTree.Identifier,
  typeMap: TypeMap,
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
  typeMap: TypeMap,
  env: Env,
  dynamicMap: DynamicMap,
): boolean {
  return false;
}

function array(
  ast: ESTree.ArrayExpression,
  typeMap: TypeMap,
  env: Env,
  dynamicMap: DynamicMap,
): boolean {
  return ast.elements.map(ast => expression(ast, typeMap, env, dynamicMap)).some(dynamic => dynamic);
}

function object(
  ast: ESTree.ObjectExpression,
  typeMap: TypeMap,
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
      return expression(prop.value, typeMap, env, dynamicMap);
    }
  }).some(dynamic => dynamic);
}

function arrowFunction(
  ast: ESTree.ArrowFunctionExpression,
  typeMap: TypeMap,
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
          return expression(stmt.expression, typeMap, env, dynamicMap)
      }
    }).some(dynamic => dynamic);
  } else {
    return expression(ast.body, typeMap, env, dynamicMap);
  }
}

function unary(
  ast: ESTree.UnaryExpression,
  typeMap: TypeMap,
  env: Env,
  dynamicMap: DynamicMap,
): boolean {
  return expression(ast.argument, typeMap, env, dynamicMap);
}

function logical(
  ast: ESTree.LogicalExpression,
  typeMap: TypeMap,
  env: Env,
  dynamicMap: DynamicMap,
): boolean {
  const left = expression(ast.left, typeMap, env, dynamicMap);
  const right = expression(ast.right, typeMap, env, dynamicMap);
  return left || right;
}

function binary(
  ast: ESTree.BinaryExpression,
  typeMap: TypeMap,
  env: Env,
  dynamicMap: DynamicMap,
): boolean {
  const left = expression(ast.left, typeMap, env, dynamicMap);
  const right = expression(ast.right, typeMap, env, dynamicMap);
  return left || right;
}

function sequence(
  ast: ESTree.SequenceExpression,
  typeMap: TypeMap,
  env: Env,
  dynamicMap: DynamicMap,
): boolean {
  return ast.expressions.map(ast => expression(ast, typeMap, env, dynamicMap)).some(dynamic => dynamic);
}

function member(
  ast: ESTree.MemberExpression,
  typeMap: TypeMap,
  env: Env,
  dynamicMap: DynamicMap,
): boolean {
  const object = expression(ast.object, typeMap, env, dynamicMap);
  if (ast.computed) {
    const property = expression(ast.property, typeMap, env, dynamicMap);
    return object || property;
  } else {
    return object;
  }
}

function call(
  ast: ESTree.CallExpression,
  typeMap: TypeMap,
  env: Env,
  dynamicMap: DynamicMap,
): boolean {
  const callee = expression(ast.callee, typeMap, env, dynamicMap);
  const args = ast.arguments.map(ast => expression(ast, typeMap, env, dynamicMap)).some(dynamic => dynamic);
  return callee || args;
}

function conditional(
  ast: ESTree.ConditionalExpression,
  typeMap: TypeMap,
  env: Env,
  dynamicMap: DynamicMap,
): boolean {
  const test = expression(ast.test, typeMap, env, dynamicMap);
  const consequent = expression(ast.consequent, typeMap, env, dynamicMap);
  const alternate = expression(ast.alternate, typeMap, env, dynamicMap);
  return test || consequent || alternate;
}

function templateLiteral(
  ast: ESTree.TemplateLiteral,
  typeMap: TypeMap,
  env: Env,
  dynamicMap: DynamicMap,
): boolean {
  // TODO(jaked) handle interpolations
  return false;
}

function jSXIdentifier(
  ast: ESTree.JSXIdentifier,
  typeMap: TypeMap,
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
  typeMap: TypeMap,
  env: Env,
  dynamicMap: DynamicMap,
): boolean {
  const elem = expression(ast.openingElement.name, typeMap, env, dynamicMap);
  const attrs = ast.openingElement.attributes.map(attr => {
    if (attr.value)
      return expression(attr.value, typeMap, env, dynamicMap);
    else
      return false;
  }).some(dynamic => dynamic);
  const children = ast.children.map(child =>
    expression(child, typeMap, env, dynamicMap)
  ).some(dynamic => dynamic);
  return elem || attrs || children;
}

function jSXFragment(
  ast: ESTree.JSXFragment,
  typeMap: TypeMap,
  env: Env,
  dynamicMap: DynamicMap,
): boolean {
  return ast.children.map(child => expression(child, typeMap, env, dynamicMap)).some(dynamic => dynamic);
}

function jSXExpressionContainer(
  ast: ESTree.JSXExpressionContainer,
  typeMap: TypeMap,
  env: Env,
  dynamicMap: DynamicMap,
): boolean {
  return expression(ast.expression, typeMap, env, dynamicMap);
}

function jSXText(
  ast: ESTree.JSXText,
  typeMap: TypeMap,
  env: Env,
  dynamicMap: DynamicMap,
): boolean {
  return false;
}

function jSXEmpty(
  ast: ESTree.JSXEmptyExpression,
  typeMap: TypeMap,
  env: Env,
  dynamicMap: DynamicMap,
): boolean {
  return false;
}

function assignment(
  ast: ESTree.AssignmentExpression,
  typeMap: TypeMap,
  env: Env,
  dynamicMap: DynamicMap,
): boolean {
  let dynamic = false;
  let object = ast.left;
  while (object.type === 'MemberExpression') {
    dynamicMap.set(object, false);
    if (object.computed)
      dynamic = dynamic || expression(object.property, typeMap, env, dynamicMap);
    object = object.object;
  }
  dynamicMap.set(object, false);
  dynamic = dynamic || expression(ast.right, typeMap, env, dynamicMap);
  return dynamic;
}

function tSAs(
  ast: ESTree.TSAsExpression,
  typeMap: TypeMap,
  env: Env,
  dynamicMap: DynamicMap,
): boolean {
  return expression(ast.expression, typeMap, env, dynamicMap);
}

function expressionHelper(
  ast: ESTree.Expression,
  typeMap: TypeMap,
  env: Env,
  dynamicMap: DynamicMap,
): boolean {
  const type = typeMap.get(ast);
  if (type && type.kind === 'Error') return false;

  switch (ast.type) {
    case 'Identifier':              return identifier(ast, typeMap, env, dynamicMap);
    case 'Literal':                 return literal(ast, typeMap, env, dynamicMap);
    case 'ArrayExpression':         return array(ast, typeMap, env, dynamicMap);
    case 'ObjectExpression':        return object(ast, typeMap, env, dynamicMap);
    case 'ArrowFunctionExpression': return arrowFunction(ast, typeMap, env, dynamicMap);
    case 'UnaryExpression':         return unary(ast, typeMap, env, dynamicMap);
    case 'LogicalExpression':       return logical(ast, typeMap, env, dynamicMap);
    case 'BinaryExpression':        return binary(ast, typeMap, env, dynamicMap);
    case 'SequenceExpression':      return sequence(ast, typeMap, env, dynamicMap);
    case 'MemberExpression':        return member(ast, typeMap, env, dynamicMap);
    case 'CallExpression':          return call(ast, typeMap, env, dynamicMap);
    case 'ConditionalExpression':   return conditional(ast, typeMap, env, dynamicMap);
    case 'TemplateLiteral':         return templateLiteral(ast, typeMap, env, dynamicMap);
    case 'JSXIdentifier':           return jSXIdentifier(ast, typeMap, env, dynamicMap);
    case 'JSXElement':              return jSXElement(ast, typeMap, env, dynamicMap);
    case 'JSXFragment':             return jSXFragment(ast, typeMap, env, dynamicMap);
    case 'JSXExpressionContainer':  return jSXExpressionContainer(ast, typeMap, env, dynamicMap);
    case 'JSXText':                 return jSXText(ast, typeMap, env, dynamicMap);
    case 'JSXEmptyExpression':      return jSXEmpty(ast, typeMap, env, dynamicMap);
    case 'AssignmentExpression':    return assignment(ast, typeMap, env, dynamicMap);
    case 'TSAsExpression':          return tSAs(ast, typeMap, env, dynamicMap);

    default:
      return bug(`unimplemented AST ${ast.type}`);
  }
}

export function expression(
  ast: ESTree.Expression,
  typeMap: TypeMap,
  dynamicEnv: Env,
  dynamicMap: DynamicMap,
): boolean {
  const dynamic = expressionHelper(ast, typeMap, dynamicEnv, dynamicMap);
  dynamicMap.set(ast, dynamic);
  return dynamic;
}

function variableDecl(
  decl: ESTree.VariableDeclaration,
  typeEnv: Typecheck.Env,
  typeMap: TypeMap,
  dynamicEnv: Env,
  dynamicMap: DynamicMap,
): Env {
  decl.declarations.forEach(declarator => {
    let dynamic: boolean;
    const type = typeEnv.get(declarator.id.name) ?? bug(`expected type`);
    if (type.kind === 'Error') {
      dynamic = false;

    } else if (decl.kind === 'let') {

      if (type.kind !== 'Abstract') bug(`expected Abstract`);

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
      expression(declarator.init, typeMap, dynamicEnv, dynamicMap);
    } else {
      if (!declarator.init) bug(`expected initializer`);
      dynamic = expression(declarator.init, typeMap, dynamicEnv, dynamicMap);
    }
    dynamicEnv = dynamicEnv.set(declarator.id.name, dynamic);
  });
  return dynamicEnv;
}

function importDecl(
  decl: ESTree.ImportDeclaration,
  typeMap: TypeMap,
  moduleEnv: Map<string, Map<string, boolean>>,
  dynamicEnv: Env,
): Env {
  const type = typeMap.get(decl.source);
  if (type && type.kind === 'Error') {
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
  typeMap: TypeMap,
  dynamicEnv: Env,
  dynamicMap: DynamicMap,
): Env {
  program.body.forEach(node => {
    switch (node.type) {
      case 'ExportDefaultDeclaration':
        dynamicEnv = dynamicEnv.set('default', expression(node.declaration, typeMap, dynamicEnv, dynamicMap));
        break;

      case 'ExportNamedDeclaration':
        dynamicEnv = variableDecl(node.declaration, typeEnv, typeMap, dynamicEnv, dynamicMap);
        break;

      case 'ImportDeclaration':
        dynamicEnv = importDecl(node, typeMap, moduleEnv, dynamicEnv);
        break;

      case 'VariableDeclaration':
        dynamicEnv = variableDecl(node, typeEnv, typeMap, dynamicEnv, dynamicMap);
        break;

      case 'ExpressionStatement':
        expression(node.expression, typeMap, dynamicEnv, dynamicMap);
        break;
    }
  });
  return dynamicEnv;
}
