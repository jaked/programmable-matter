import Recast from 'recast/main';

import * as Immutable from 'immutable';
import * as MDXHAST from './mdxhast';
import * as AcornJsxAst from './acornJsxAst';

import * as Type from './Type';

import * as String from '../util/String';

export type Env = Immutable.Map<string, Type.Type>;

function prettyPrint(type: Type.Type): string {
  // TODO(jaked) print prettily
  return JSON.stringify(type);
}

function location(ast: AcornJsxAst.Expression): string {
  // TODO(jaked) print location
  return Recast.print(ast).code;
}

function throwExpectedType(ast: AcornJsxAst.Expression, expected: Type.Type, actual?: Type.Type): never {
  let msg = 'expected ' + prettyPrint(expected);
  if (actual) msg += ', got ' + prettyPrint(actual);
  msg += ' at ' + location(ast);
  throw msg;
}

function throwUnknownField(ast: AcornJsxAst.Expression, field: string): never {
  throw new Error('unknown field \'' + field + '\' at ' + location(ast));
}

function throwMissingField(ast: AcornJsxAst.Expression, field: string): never {
  throw new Error('missing field \'' + field + '\' at ' + location(ast));
}

function throwExtraField(ast: AcornJsxAst.Expression, field: string): never {
  throw new Error('extra field \'' + field + '\' at ' + location(ast));
}

function checkSubtype(ast: AcornJsxAst.Expression, actual: Type.Type, expected: Type.Type) {
  if (!Type.isSubtype(actual, expected))
    throwExpectedType(ast, expected, actual)
}

function checkNever(ast: AcornJsxAst.Expression, env: Env, type: Type.NeverType) {
  throw new Error('unimplemented: checkNever');
}

function checkUnknown(ast: AcornJsxAst.Expression, env: Env, type: Type.UnknownType) {
  // always OK
}

function checkUndefined(ast: AcornJsxAst.Expression, env: Env, type: Type.UndefinedType) {
  throw new Error('unimplemented: undefined');
}

function checkBaseType(ast: AcornJsxAst.Expression, env: Env, type: Type.Type, jsType: string) {
  checkSubtype(ast, synth(ast, env), type);
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

function checkSet(ast: AcornJsxAst.Expression, env: Env, type: Type.SetType) {
  switch (ast.type) {
    // TODO(jaked) Set literals?

    default:
      checkSubtype(ast, synth(ast, env), type);
  }
}

function checkMap(ast: AcornJsxAst.Expression, env: Env, type: Type.MapType) {
  switch (ast.type) {
    // TODO(jaked) Map literals?

    default:
      checkSubtype(ast, synth(ast, env), type);
  }
}

function checkUnion(ast: AcornJsxAst.Expression, env: Env, type: Type.UnionType) {
  // we could independently check against each arm of the union
  // but it seems like that would not improve the error message
  // since we don't know which arm is intended
  checkSubtype(ast, synth(ast, env), type);
}

function checkIntersection(ast: AcornJsxAst.Expression, env: Env, type: Type.IntersectionType) {
  type.types.forEach(type => check(ast, env, type));
}

function checkSingleton(ast: AcornJsxAst.Expression, env: Env, type: Type.SingletonType) {
  // we could decompose the singleton value along with the expression
  // to get more localized errors, but it doesn't seem very useful;
  // I bet compound singletons are rare.
  checkSubtype(ast, synth(ast, env), type);
}

function checkObject(ast: AcornJsxAst.Expression, env: Env, type: Type.ObjectType) {
  switch (ast.type) {
    case 'ObjectExpression':
      const propNames = new Set(ast.properties.map(prop => {
        let name: string;
        switch (prop.key.type) {
          case 'Identifier': name = prop.key.name; break;
          case 'Literal': name = prop.key.value; break;
          default: throw new Error('expected Identifier or Literal prop key name');
        }
        return name;
      }));
      type.fields.forEach(({ field }) => {
        if (!propNames.has(field))
          return throwMissingField(ast, field);
      });
      const fieldTypes = new Map(type.fields.map(({ field, type }) => [field, type]));
      ast.properties.forEach(prop => {
        let name: string;
        switch (prop.key.type) {
          case 'Identifier': name = prop.key.name; break;
          case 'Literal': name = prop.key.value; break;
          default: throw new Error('expected Identifier or Literal prop key name');
        }
        const type = fieldTypes.get(name);
        if (type) return check(prop.value, env, type);
        else return throwExtraField(ast, name);
      });
      return; // OK

    default:
      checkSubtype(ast, synth(ast, env), type);
  }
}

export function check(ast: AcornJsxAst.Expression, env: Env, type: Type.Type) {
  switch (type.kind) {
    case 'never':         return checkNever(ast, env, type);
    case 'unknown':       return checkUnknown(ast, env, type);
    case 'undefined':     return checkUndefined(ast, env, type);
    case 'null':          return checkNull(ast, env, type);
    case 'boolean':       return checkBoolean(ast, env, type);
    case 'number':        return checkNumber(ast, env, type);
    case 'string':        return checkString(ast, env, type);
    case 'Tuple':         return checkTuple(ast, env, type);
    case 'Array':         return checkArray(ast, env, type);
    case 'Set':           return checkSet(ast, env, type);
    case 'Map':           return checkMap(ast, env, type);
    case 'Object':        return checkObject(ast, env, type);
    case 'Union':         return checkUnion(ast, env, type);
    case 'Intersection':  return checkIntersection(ast, env, type);
    case 'Singleton':     return checkSingleton(ast, env, type);
  }
}

function synthIdentifier(ast: AcornJsxAst.Identifier, env: Env): Type.Type {
  const value = env.get(ast.name);
  if (value) return value;
  else throw new Error('unbound identifier ' + ast.name);
}

function synthLiteral(ast: AcornJsxAst.Literal, env: Env): Type.Type {
  switch (typeof ast.value) {
    case 'boolean':   return Type.singleton(Type.boolean, ast.value);
    case 'number':    return Type.singleton(Type.number, ast.value);
    case 'string':    return Type.singleton(Type.string, ast.value);
    case 'undefined': return Type.undefined;
    case 'object':    return Type.null;
    default: throw new Error('bug');
  }
}

function synthArrayExpression(ast: AcornJsxAst.ArrayExpression, env: Env): Type.Type {
  const types = ast.elements.map(e => synth(e, env));
  const elem = Type.leastUpperBound(...types);
  return Type.array(elem);
}

function synthObjectExpression(ast: AcornJsxAst.ObjectExpression, env: Env): Type.Type {
  const fields =
    ast.properties.map(prop => {
      let name: string;
      switch (prop.key.type) {
        case 'Identifier': name = prop.key.name; break;
        case 'Literal': name = prop.key.value; break;
        default: throw new Error('expected Identifier or Literal prop key name');
      }
      return { [name]: synth(prop.value, env) };
    });
  return Type.object(Object.assign({}, ...fields));
}

function synthBinaryExpression(ast: AcornJsxAst.BinaryExpression, env: Env): Type.Type {
  let left = synth(ast.left, env);
  let right = synth(ast.right, env);

  if (left.kind === 'Singleton') left = left.base;
  if (right.kind === 'Singleton') right = right.base;

  // TODO(jaked) handle other operators
  if (left.kind === 'number' && right.kind === 'number') {
    return Type.number;
  } else if (left.kind === 'string' && right.kind === 'string') {
    return Type.string;
  } else {
    throw new Error('unimplemented: synthBinaryExpression');
  }
}

function synthMemberExpression(ast: AcornJsxAst.MemberExpression, env: Env): Type.Type {
  const object = synth(ast.object, env);
  if (ast.computed) {
    const property = synth(ast.property, env);
    switch (object.kind) {
      case 'Array':
        if (property.kind === 'number') return object.elem;
        else return throwExpectedType(ast, Type.number, property);
      default:
        throw new Error('unimplemented synthMemberExpression ' + object.kind);
    }
  } else {
    if (ast.property.type === 'Identifier') {
      const name = ast.property.name;
      switch (object.kind) {
        case 'Array':
          switch (name) {
            case 'length': return Type.number;
            default: return throwUnknownField(ast, name);
          }

        case 'Object': {
          const field = object.fields.find(ft => ft.field === name);
          if (field) return field.type;
          else return throwUnknownField(ast, name);
        }

        default:
          throw new Error('unimplemented synthMemberExpression ' + object.kind);
      }
    } else {
      throw new Error('expected identifier on non-computed property');
    }
  }
}

export function synth(ast: AcornJsxAst.Expression, env: Env): Type.Type {
  switch (ast.type) {
    case 'Identifier':        return synthIdentifier(ast, env);
    case 'Literal':           return synthLiteral(ast, env);
    case 'ArrayExpression':   return synthArrayExpression(ast, env);
    case 'ObjectExpression':  return synthObjectExpression(ast, env);
    case 'BinaryExpression':  return synthBinaryExpression(ast, env);
    case 'MemberExpression':  return synthMemberExpression(ast, env);

    default: throw new Error('unimplemented: synth ' + JSON.stringify(ast));
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
            throw new Error('unexpected AST ' + (value as any).type);
        }
      } else {
        // TODO(jaked) required/optional props
      }
    });
  } else {
    throw new Error('expected element type to be Object');
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

function checkMdxElements(ast: MDXHAST.Node, env: Env) {
  switch (ast.type) {
    case 'root':
    case 'element':
      return ast.children.forEach(child => checkMdxElements(child, env));

    case 'text':
      return;

    case 'jsx':
      if (ast.jsxElement) {
        return checkJsxElement(ast.jsxElement, env);
      } else {
        throw new Error('expected JSX node to be parsed');
      }

    case 'import':
    case 'export':
      return;

    default: throw new Error('unexpected AST ' + (ast as MDXHAST.Node).type);
  }
}

function synthMdxBindings(
  ast: MDXHAST.Node,
  env: Env,
  exportTypes: { [s: string]: Type.Type }
): Env {
  // TODO(jaked)
  // - topologically sort bindings
  // - check for cycles
  // - synthesize types bottom up

  switch (ast.type) {
    case 'root':
    case 'element':
      ast.children.forEach(child =>
        env = synthMdxBindings(child, env, exportTypes)
      );
      return env;

    case 'text':
    case 'jsx':
      return env;

    case 'import':
    case 'export': {
      if (!ast.declarations) throw new Error('expected import/export node to be parsed');
      ast.declarations.forEach(decl => {
        switch (decl.type) {
          case 'ImportDeclaration':
            const source = String.capitalize(<string>decl.source.value);
            decl.specifiers.forEach(spec => {
              switch (spec.type) {
                case 'ImportNamespaceSpecifier':
                  if (spec.local.name !== source) {
                    throw new Error('unimplemented: ImportNamespaceSpecifier');
                  }
                  else return; // namespace object is already in env
                case 'ImportDefaultSpecifier':
                  throw new Error('unimplemented: ImportDefaultSpecifier');
                case 'ImportSpecifier':
                  throw new Error('unimplemented: ImportSpecifier');
              }
            });
            break;

          case 'ExportNamedDeclaration':
            decl.declaration.declarations.forEach(declarator => {
              const type = synth(declarator.init, env);
              exportTypes[declarator.id.name] = type;
              env = env.set(declarator.id.name, type);
            });
            break;
        }
      });
      return env;
    }

    default: throw new Error('unexpected AST ' + (ast as MDXHAST.Node).type);
  }
}

export function checkMdx(
  ast: MDXHAST.Node,
  env: Env,
  exportTypes: { [s: string]: Type.Type }
) {
  const env2 = synthMdxBindings(ast, env, exportTypes);
  checkMdxElements(ast, env2);
}
