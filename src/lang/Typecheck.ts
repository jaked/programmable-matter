import Recast from 'recast/main';

import * as Immutable from 'immutable';
import * as MDXHAST from './mdxhast';
import * as AcornJsxAst from './acornJsxAst';

import * as Type from './Type';

import * as String from '../util/String';

export type Env = Immutable.Map<string, [Type.Type, boolean]>;

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
  throw new Error(msg);
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

function throwWrongArgsLength(ast: AcornJsxAst.Expression, expected: number, actual: number) {
  throw new Error(`expected ${expected} args, function has ${actual} args at ${location(ast)}`);
}

function checkSubtype(ast: AcornJsxAst.Expression, env: Env, type: Type.Type): boolean {
  const [actual, atom] = synth(ast, env);
  if (!Type.isSubtype(actual, type))
    throwExpectedType(ast, type, actual);
  return atom;
}

function checkTuple(ast: AcornJsxAst.Expression, env: Env, type: Type.TupleType): boolean {
  switch (ast.type) {
    case 'ArrayExpression':
      if (ast.elements.length !== type.elems.length) {
        return throwExpectedType(ast, type);
      } else {
        return ast.elements.map((elem, i) =>
          check(elem, env, type.elems[i])
        ).some(x => x);
      }

    default:
      return checkSubtype(ast, env, type);
  }
}

function checkArray(ast: AcornJsxAst.Expression, env: Env, type: Type.ArrayType): boolean {
  switch (ast.type) {
    case 'ArrayExpression':
      return ast.elements.map(elem =>
        check(elem, env, type.elem)
      ).some(x => x);

    default:
      return checkSubtype(ast, env, type);
  }
}

function checkSet(ast: AcornJsxAst.Expression, env: Env, type: Type.SetType): boolean {
  switch (ast.type) {
    // TODO(jaked) Set literals?

    default:
      return checkSubtype(ast, env, type);
  }
}

function checkMap(ast: AcornJsxAst.Expression, env: Env, type: Type.MapType): boolean {
  switch (ast.type) {
    // TODO(jaked) Map literals?

    default:
      return checkSubtype(ast, env, type);
  }
}

function checkFunction(ast: AcornJsxAst.Expression, env: Env, type: Type.FunctionType): boolean {
  switch (ast.type) {
    case 'ArrowFunctionExpression':
      if (type.args.length != ast.params.length)
        throwWrongArgsLength(ast, type.args.length, ast.params.length);
      ast.params.forEach((id, i) => {
        env = env.set(id.name, [ type.args[i].type, false ]);
      });
      return check(ast.body, env, type.ret);

    default:
      return checkSubtype(ast, env, type);
  }
}

function checkUnion(ast: AcornJsxAst.Expression, env: Env, type: Type.UnionType): boolean {
  // we could independently check against each arm of the union
  // but it seems like that would not improve the error message
  // since we don't know which arm is intended
  return checkSubtype(ast, env, type);
}

function checkIntersection(ast: AcornJsxAst.Expression, env: Env, type: Type.IntersectionType): boolean {
  // TODO(jaked)
  // we check that the expression is an atom for each arm of the intersection
  // but it should not matter what type we check with
  // (really we are just piggybacking on the tree traversal here)
  // need to be careful once we have function types carrying an atom effect
  // e.g. a type (T =(true)> U & T =(false)> U) is well-formed
  // but we don't want to union / intersect atom effects
  return type.types.some(type => check(ast, env, type));
}

function checkSingleton(ast: AcornJsxAst.Expression, env: Env, type: Type.SingletonType): boolean {
  // we could decompose the singleton value along with the expression
  // to get more localized errors, but it doesn't seem very useful;
  // I bet compound singletons are rare.
  return checkSubtype(ast, env, type);
}

function checkObject(ast: AcornJsxAst.Expression, env: Env, type: Type.ObjectType): boolean {
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
      return ast.properties.map(prop => {
        let name: string;
        switch (prop.key.type) {
          case 'Identifier': name = prop.key.name; break;
          case 'Literal': name = prop.key.value; break;
          default: throw new Error('expected Identifier or Literal prop key name');
        }
        const type = fieldTypes.get(name);
        if (type) return check(prop.value, env, type);
        else return throwExtraField(ast, name);
      }).some(x => x);

    default:
      return checkSubtype(ast, env, type);
  }
}

export function check(ast: AcornJsxAst.Expression, env: Env, type: Type.Type): boolean {
  switch (type.kind) {
    case 'Tuple':         return checkTuple(ast, env, type);
    case 'Array':         return checkArray(ast, env, type);
    case 'Set':           return checkSet(ast, env, type);
    case 'Map':           return checkMap(ast, env, type);
    case 'Object':        return checkObject(ast, env, type);
    case 'Function':      return checkFunction(ast, env, type);
    case 'Union':         return checkUnion(ast, env, type);
    case 'Intersection':  return checkIntersection(ast, env, type);
    case 'Singleton':     return checkSingleton(ast, env, type);

    default:              return checkSubtype(ast, env, type);
  }
  ast.etype = type;
}

function synthIdentifier(ast: AcornJsxAst.Identifier, env: Env): [Type.Type, boolean] {
  const typeAtom = env.get(ast.name);
  if (typeAtom) return typeAtom;
  else throw new Error('unbound identifier ' + ast.name);
}

function synthLiteralHelper(ast: AcornJsxAst.Literal, env: Env): Type.Type {
  switch (typeof ast.value) {
    case 'boolean':   return Type.singleton(Type.boolean, ast.value);
    case 'number':    return Type.singleton(Type.number, ast.value);
    case 'string':    return Type.singleton(Type.string, ast.value);
    case 'undefined': return Type.undefined;
    case 'object':    return Type.null;
    default: throw new Error('bug');
  }
}

function synthLiteral(ast: AcornJsxAst.Literal, env: Env): [Type.Type, boolean] {
  const type = synthLiteralHelper(ast, env);
  return [type, false];
}

function synthArrayExpression(ast: AcornJsxAst.ArrayExpression, env: Env): [Type.Type, boolean] {
  const typesAtoms = ast.elements.map(e => synth(e, env));
  const types = typesAtoms.map(([type, _]) => type);
  const atom = typesAtoms.some(([_, atom]) => atom);
  const elem = Type.leastUpperBound(...types);
  return [Type.array(elem), atom];
}

function synthObjectExpression(ast: AcornJsxAst.ObjectExpression, env: Env): [Type.Type, boolean] {
  const seen = new Set();
  const fields: Array<[string, [Type.Type, boolean]]> =
    ast.properties.map(prop => {
      let name: string;
      switch (prop.key.type) {
        case 'Identifier': name = prop.key.name; break;
        case 'Literal': name = prop.key.value; break;
        default: throw new Error('expected Identifier or Literal prop key name');
      }
      if (seen.has(name)) throw new Error('duplicate field name ' + name);
      else seen.add(name);
      return [ name, synth(prop.value, env) ];
    });
  const fieldTypes = fields.map(([name, [type, _]]) => ({ [name]: type }));
  const atom = fields.some(([_, [__, atom]]) => atom);
  const type = Type.object(Object.assign({}, ...fieldTypes));
  return [type, atom];
}

function synthBinaryExpression(ast: AcornJsxAst.BinaryExpression, env: Env): [Type.Type, boolean] {
  let [left, leftAtom] = synth(ast.left, env);
  let [right, rightAtom] = synth(ast.right, env);
  const atom = leftAtom || rightAtom;

  if (left.kind === 'Singleton') left = left.base;
  if (right.kind === 'Singleton') right = right.base;

  // TODO(jaked) handle other operators
  let type: Type.Type;

  if (left.kind === 'number' && right.kind === 'number')      type = Type.number;
  else if (left.kind === 'string' && right.kind === 'string') type = Type.string;
  else if (left.kind === 'string' && right.kind === 'number') type = Type.string;
  else if (left.kind === 'number' && right.kind === 'string') type = Type.string;
  else throw new Error('unimplemented: synthBinaryExpression');

  return [type, atom];
}

function synthMemberExpression(ast: AcornJsxAst.MemberExpression, env: Env): [Type.Type, boolean] {
  const [object, objAtom] = synth(ast.object, env);
  if (ast.computed) {
    switch (object.kind) {
      case 'Array':
        const propAtom = check(ast.property, env, Type.number);
        return [object.elem, objAtom || propAtom];

      case 'Tuple': {
        // check against union of valid indexes
        let validIndexes =
          object.elems.map((_, i) => Type.singleton(Type.number, i));
        check(ast.property, env, Type.union(...validIndexes));

        // synth to find out which valid indexes are actually present
        const [propertyType, propAtom] = synth(ast.property, env);
        const presentIndexes: Array<number> = [];
        if (propertyType.kind === 'Singleton') {
          presentIndexes.push(propertyType.value);
        } else if (propertyType.kind === 'Union') {
          propertyType.types.forEach(type => {
            if (type.kind === 'Singleton') presentIndexes.push(type.value);
            else throw new Error('expected Singleton');
          });
        } else throw new Error('expected Singleton or Union')

        // and return union of element types of present indexes
        const presentTypes =
          presentIndexes.map(i => object.elems[i]);
        return [Type.union(...presentTypes), objAtom || propAtom];
      }

      case 'Object': {
        // check against union of valid indexes
        let validIndexes =
          object.fields.map(({ field }) => Type.singleton(Type.string, field));
        check(ast.property, env, Type.union(...validIndexes));

        // synth to find out which valid indexes are actually present
        const [propertyType, propAtom] = synth(ast.property, env);
        const presentIndexes: Array<string> = [];
        if (propertyType.kind === 'Singleton') {
          presentIndexes.push(propertyType.value);
        } else if (propertyType.kind === 'Union') {
          propertyType.types.forEach(type => {
            if (type.kind === 'Singleton') presentIndexes.push(type.value);
            else throw new Error('expected Singleton');
          });
        } else throw new Error('expected Singleton or Union')

        // and return union of element types of present indexes
        const presentTypes =
          presentIndexes.map(i => {
            const fieldType = object.fields.find(({ field }) => field === i);
            if (fieldType) return fieldType.type;
            else throw new Error('expected valid index');
          });
        return [Type.union(...presentTypes), objAtom || propAtom];
      }

      // case 'Module':
      // no computed members on modules, different members may have different atomness
      // (for that matter, maybe we should not have computed members on tuples / objects)

      default:
        throw new Error('unimplemented synthMemberExpression ' + object.kind);
    }
  } else {
    if (ast.property.type === 'Identifier') {
      const name = ast.property.name;
      switch (object.kind) {
        case 'Array':
          switch (name) {
            case 'length': return [Type.number, objAtom];
            default: return throwUnknownField(ast, name);
          }

        case 'Object': {
          const field = object.fields.find(ft => ft.field === name);
          if (field) return [field.type, objAtom];
          else return throwUnknownField(ast, name);
        }

        case 'Module': {
          const field = object.fields.find(ft => ft.field === name);
          if (field) return [field.type, objAtom || field.atom];
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

function synthHelper(ast: AcornJsxAst.Expression, env: Env): [Type.Type, boolean] {
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

export function synth(ast: AcornJsxAst.Expression, env: Env): [Type.Type, boolean] {
  const typeAtom = synthHelper(ast, env);
  const [type, atom] = typeAtom;  // TODO(jaked) is there @ / as binding
  ast.etype = type;
  ast.atom = atom;
  return typeAtom;
}

// TODO(jaked) what's actually acceptable here?
const embeddedExpressionType =
  Type.union(Type.boolean, Type.number, Type.string);

function checkJsxElement(
  ast: AcornJsxAst.JSXElement | AcornJsxAst.JSXFragment,
  env: Env
): boolean {
  let attrsAtom: boolean;
  if (ast.type === 'JSXElement') {
    const [type, _] = env.get(ast.openingElement.name.name, [Type.object({}), false]);
    if (type.kind === 'Object') {
      const fieldTypes = new Map(type.fields.map(({ field, type }) => [field, type]));
      attrsAtom = ast.openingElement.attributes.map(({ name, value }) => {
        const type = fieldTypes.get(name.name) || Type.unknown; // TODO(jaked) required/optional props
        switch (value.type) {
          case 'JSXExpressionContainer':
            return check(value.expression, env, type);
          case 'Literal':
            return check(value, env, type);
          default:
            throw new Error('unexpected AST ' + (value as any).type);
        }
      }).some(x => x);
    } else {
      throw new Error('expected element type to be Object');
    }

  // unassigned variable error on attrsAtom if we check ast.type
  // even though the cases are exhaustive
  } else { // if (ast.type === 'JSXFragment') {
    attrsAtom = false;
  }

  let childrenAtom =
    ast.children.map(child => {
      switch (child.type) {
        case 'JSXElement':
          return checkJsxElement(child, env);
        case 'JSXText':
          return false;
        case 'JSXExpressionContainer':
          return check(child.expression, env, embeddedExpressionType);
      }
    }).some(x => x);

  return attrsAtom || childrenAtom;
}

function checkMdxElements(ast: MDXHAST.Node, env: Env) {
  switch (ast.type) {
    case 'root':
    case 'element':
      return ast.children.forEach(child => checkMdxElements(child, env));

    case 'text':
      return;

    case 'jsx':
      if (!ast.jsxElement) throw new Error('expected JSX node to be parsed');
      return ast.jsxElement.forEach(elem => checkJsxElement(elem, env));

    case 'import':
    case 'export':
      return;

    default: throw new Error('unexpected AST ' + (ast as MDXHAST.Node).type);
  }
}

function synthMdxBindings(
  ast: MDXHAST.Node,
  env: Env,
  exportTypes: { [s: string]: [Type.Type, boolean] }
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
      ast.declarations.forEach(decls => decls.forEach(decl => {
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
            const declAtom = decl.declaration.kind === 'let';
            decl.declaration.declarations.forEach(declarator => {
              const [type, atom] = synth(declarator.init, env);
              // a let binding is always an atom (its initializer is a non-atom)
              // a const binding is an atom if its initializer is an atom
              // TODO(jaked)
              // let bindings of type T should also have type T => void
              // so they can be set in event handlers
              const typeAtom: [Type.Type, boolean] = [type, atom || declAtom];
              exportTypes[declarator.id.name] = typeAtom;
              env = env.set(declarator.id.name, typeAtom);
            });
            break;
        }
      }));
      return env;
    }

    default: throw new Error('unexpected AST ' + (ast as MDXHAST.Node).type);
  }
}

export function checkMdx(
  ast: MDXHAST.Node,
  env: Env,
  exportTypes: { [s: string]: [Type.Type, boolean] }
) {
  const env2 = synthMdxBindings(ast, env, exportTypes);
  checkMdxElements(ast, env2);
}
