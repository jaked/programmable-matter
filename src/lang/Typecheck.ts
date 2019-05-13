import * as Immutable from 'immutable';
import * as MDXHAST from './mdxhast';
import * as AcornJsxAst from './acornJsxAst';

import * as Type from './Type';

export type Env = Immutable.Map<string, Type.Type>;

function prettyPrint(type: Type.Type): string {
  // TODO(jaked) print prettily
  return type.toString();
}

function location(ast: AcornJsxAst.Expression): string {
  // TODO(jaked) print location
  return ast.toString();
}

function throwExpectedType(ast: AcornJsxAst.Expression, expected: Type.Type, actual?: Type.Type) {
  let msg = 'expected ' + prettyPrint(expected);
  if (actual) msg += ', got ' + prettyPrint(actual);
  msg += ' at ' + location(ast);
  throw msg;
}

function throwMissingField(ast: AcornJsxAst.Expression, field: string) {
  throw 'missing field \'' + field + '\' at ' + location(ast);
}

function throwExtraField(ast: AcornJsxAst.Expression, field: string) {
  throw 'extra field \'' + field + '\' at ' + location(ast);
}

function checkSubtype(ast: AcornJsxAst.Expression, actual: Type.Type, expected: Type.Type) {
  if (!Type.isSubtype(actual, expected))
    throwExpectedType(ast, expected, actual)
}

function checkNever(ast: AcornJsxAst.Expression, env: Env, type: Type.NeverType) {
  throw 'unimplemented: checkNever'
}

function checkUnknown(ast: AcornJsxAst.Expression, env: Env, type: Type.UnknownType) {
  // always OK
}

function checkUndefined(ast: AcornJsxAst.Expression, env: Env, type: Type.UndefinedType) {
  throw 'unimplemented: undefined';
}

function checkBaseType(ast: AcornJsxAst.Expression, env: Env, type: Type.Type, jsType: string) {
  switch (ast.type) {
    case 'Literal':
      if (typeof ast.value !== jsType)
        return throwExpectedType(ast, type);
      else
        return; // OK

    default:
      checkSubtype(ast, synth(ast, env), type);
  }
}

function checkNull(ast: AcornJsxAst.Expression, env: Env, type: Type.NullType) {
  return checkBaseType(ast, env, type, 'object');
}

function checkBoolean(ast: AcornJsxAst.Expression, env: Env, type: Type.BooleanType) {
  return checkBaseType(ast, env, type, 'boolean');
}

function checkNumber(ast: AcornJsxAst.Expression, env: Env, type: Type.NumberType) {
  return checkBaseType(ast, env, type, 'number');
}

function checkString(ast: AcornJsxAst.Expression, env: Env, type: Type.StringType) {
  return checkBaseType(ast, env, type, 'string');
}

function checkTuple(ast: AcornJsxAst.Expression, env: Env, type: Type.TupleType) {
  switch (ast.type) {
    case 'ArrayExpression':
      if (ast.elements.length !== type.elems.length) {
        return throwExpectedType(ast, type);
      } else {
        ast.elements.forEach((elem, i) =>
          check(elem, env, type.elems[i])
        );
        return; // OK
      }

    default:
      checkSubtype(ast, synth(ast, env), type);
  }
}

function checkArray(ast: AcornJsxAst.Expression, env: Env, type: Type.ArrayType) {
  switch (ast.type) {
    case 'ArrayExpression':
      ast.elements.forEach(elem =>
        check(elem, env, type.elem)
      );
      return; // OK

    default:
      checkSubtype(ast, synth(ast, env), type);
  }
}

function checkObject(ast: AcornJsxAst.Expression, env: Env, type: Type.ObjectType) {
  switch (ast.type) {
    case 'ObjectExpression':
      const propNames = new Set(ast.properties.map(prop => prop.key.name));
      type.fields.forEach(({ field }) => {
        if (!propNames.has(field))
          return throwMissingField(ast, field);
      });
      const fieldTypes = new Map(type.fields.map(({ field, type }) => [field, type]));
      ast.properties.forEach(prop => {
        const field = prop.key.name;
        const type = fieldTypes.get(field);
        if (type) return check(prop.value, env, type);
        // TODO(jaked) excess property error
        else return throwExtraField(ast, field);
      });
      return; // OK

    default:
      checkSubtype(ast, synth(ast, env), type);
  }
}

export function check(ast: AcornJsxAst.Expression, env: Env, type: Type.Type) {
  switch (type.kind) {
    case 'never':     return checkNever(ast, env, type);
    case 'unknown':   return checkUnknown(ast, env, type);
    case 'undefined': return checkUndefined(ast, env, type);
    case 'null':      return checkNull(ast, env, type);
    case 'boolean':   return checkBoolean(ast, env, type);
    case 'number':    return checkNumber(ast, env, type);
    case 'string':    return checkString(ast, env, type);
    case 'Tuple':     return checkTuple(ast, env, type);
    case 'Array':     return checkArray(ast, env, type);
    case 'Object':    return checkObject(ast, env, type);
  }
}

function synthIdentifier(ast: AcornJsxAst.Identifier, env: Env): Type.Type {
  const value = env.get(ast.name);
  if (value) return value;
  else throw 'unbound identifier ' + ast.name;
}

function synthLiteral(ast: AcornJsxAst.Literal, env: Env): Type.Type {
  switch (typeof ast.value) {
    case 'boolean': return Type.boolean;
    case 'number':  return Type.number;
    case 'string':  return Type.string;
    case 'object':  return Type.null;
    default: throw 'bug';
  }
}

function synthArrayExpression(ast: AcornJsxAst.ArrayExpression, env: Env): Type.Type {
  const types = ast.elements.map(e => synth(e, env));
  const elem = Type.union(...types);
  return Type.array(elem);
}

function synthObjectExpression(ast: AcornJsxAst.ObjectExpression, env: Env): Type.Type {
  const fields =
    ast.properties.map(prop => ({ [prop.key.name]: synth(prop.value, env) }));
  return Type.object(Object.assign({}, ...fields));
}

export function synth(ast: AcornJsxAst.Expression, env: Env): Type.Type {
  switch (ast.type) {
    case 'Identifier':        return synthIdentifier(ast, env);
    case 'Literal':           return synthLiteral(ast, env);
    case 'ArrayExpression':   return synthArrayExpression(ast, env);
    case 'ObjectExpression':  return synthObjectExpression(ast, env);

    default: throw 'unimplemented: synth ' + ast.toString();
  }
}

// TODO(jaked) what's actually acceptable here?
const embeddedExpressionType =
  Type.union(Type.boolean, Type.number, Type.string);

function checkJsxElement(ast: AcornJsxAst.JSXElement, env: Env) {
  const type = env.get(ast.openingElement.name.name, Type.object({}));
  if (type.kind === 'Object') {
    const fieldTypes = new Map(type.fields.map(({ field, type }) => [field, type]));
    ast.openingElement.attributes.forEach(({ name, value }) => {
      const type = fieldTypes.get(name.name);
      if (type) {
        switch (value.type) {
          case 'JSXExpressionContainer':
            return check(value.expression, env, type);
          case 'Literal':
            return check(value, env, type);
          default:
            throw 'unexpected AST ' + (value as any).type;
        }
      } else {
        // TODO(jaked) required/optional props
      }
    });
  } else {
    throw 'expected element type to be Object';
  }

  ast.children.forEach(child => {
    switch (child.type) {
      case 'JSXElement':
        return checkJsxElement(child, env);
      case 'JSXText':
        return;
      case 'JSXExpressionContainer':
        return check(child.expression, env, embeddedExpressionType);
    }
  });
}

export function checkAst(ast: MDXHAST.Node, env: Env) {
  switch (ast.type) {
    case 'root':
    case 'element':
      return ast.children.forEach(child => checkAst(child, env));

    case 'text':
      return;

    case 'jsx':
      if (ast.jsxElement) {
        return checkJsxElement(ast.jsxElement, env);
      } else {
        throw 'expected JSX node to be parsed';
      }
  }
}
