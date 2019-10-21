import Recast from 'recast/main';

import * as Immutable from 'immutable';
import * as MDXHAST from './mdxhast';
import * as AcornJsxAst from './acornJsxAst';

import * as Type from './Type';

// TODO(jaked)
// function and pattern environments don't need to track atomness
// - we join on all the args at a function call
// - patterns match over direct values
// but module environments need to track atomness
// should we split out the module environment to avoid a nuisance flag?
export type Env = Immutable.Map<string, [Type.Type, boolean]>;

function prettyPrint(type: Type.Type): string {
  // TODO(jaked) print prettily
  return JSON.stringify(type);
}

function location(ast: AcornJsxAst.Node): string {
  // TODO(jaked) print location
  return Recast.print(ast).code;
}

function throwWithLocation(ast, msg): never {
  msg += ' at ' + location(ast);
  throw new Error(msg);
}

function throwExpectedType(ast: AcornJsxAst.Expression, expected: string | Type.Type, actual?: string | Type.Type): never {
  if (typeof expected !== 'string')
    expected = prettyPrint(expected);
  if (actual && typeof actual !== 'string')
    actual = prettyPrint(actual);

  let msg = 'expected ' + expected;
  if (actual) msg += ', got ' + actual;
  return throwWithLocation(ast, msg);
}

function throwUnknownField(ast: AcornJsxAst.Expression, field: string): never {
  return throwWithLocation(ast, `unknown field '${field}'`);
}

function throwMissingField(ast: AcornJsxAst.Expression, field: string): never {
  return throwWithLocation(ast, `missing field '${field}'`);
}

function throwExtraField(ast: AcornJsxAst.Expression, field: string): never {
  return throwWithLocation(ast, `extra field ${field}`);
}

function throwWrongArgsLength(ast: AcornJsxAst.Expression, expected: number, actual: number) {
  return throwWithLocation(ast, `expected ${expected} args, function has ${actual} args`);
}

function checkSubtype(ast: AcornJsxAst.Expression, env: Env, type: Type.Type): boolean {
  switch (ast.type) {
    case 'JSXExpressionContainer':
      return check(ast.expression, env, type);

    default:
      const [actual, atom] = synth(ast, env);
      if (!Type.isSubtype(actual, type))
        throwExpectedType(ast, type, actual);
      return atom;
  }
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
    // never called since we check against `reactNodeType`, see comment on checkUnion
    case 'JSXFragment':
      return ast.children.map(child =>
        check(child, env, type)
      ).some(x => x);

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
      ast.params.forEach((pat, i) => {
        switch (pat.type) {
          case 'Identifier':
            env = env.set(pat.name, [ type.args[i], false ]);
            break;

          default: throw new Error('unexpected AST type ' + (pat as AcornJsxAst.Pattern).type);
        }
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
  // TODO(jaked)
  // for JSXFragment we check against `reactNodeType`,
  // which contains simple types (which JSXFragment cannot satisfy)
  // and an array type (which JSXFragment can satisfy)
  // if we check against the array we could produce a better error.
  // somehow we'd like to break down the type / expression together
  // where possible instead of synth / isSubtype
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

function checkHelper(ast: AcornJsxAst.Expression, env: Env, type: Type.Type): boolean {
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
}

export function check(ast: AcornJsxAst.Expression, env: Env, type: Type.Type): boolean {
  const atom = checkHelper(ast, env, type);
  ast.etype = type;
  ast.atom = atom;
  return atom;
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

function synthCallExpression(
  ast: AcornJsxAst.CallExpression,
  env:Env
): [Type.Type, boolean] {
  const [calleeType, calleeAtom] = synth(ast.callee, env);
  if (calleeType.kind !== 'Function')
    return throwExpectedType(ast.callee, 'function', calleeType)
  if (calleeType.args.length !== ast.arguments.length)
    // TODO(jaked) support short arg lists if arg type contains undefined
    // TODO(jaked) check how this works in Typescript
    throwExpectedType(ast, `${calleeType.args.length} args`, `${ast.arguments.length}`);

  let atom = calleeAtom;
  calleeType.args.every((type, i) => {
    const [argType, argAtom] = synth(ast.arguments[i], env);
    if (!Type.isSubtype(argType, type))
      throwExpectedType(ast.arguments[i], type, argType);
    atom = atom || argAtom;
  });
  return [calleeType.ret, atom];
}

function patTypeEnvIdentifier(ast: AcornJsxAst.Identifier, t: Type.Type, env: Env): Env {
  if (ast.type !== 'Identifier')
    return throwWithLocation(ast, `incompatible pattern for type ${prettyPrint(t)}`);
  if (env.has(ast.name))
    return throwWithLocation(ast, `identifier ${ast.name} already bound in pattern`);
  return env.set(ast.name, [t, false]);
}

function patTypeEnvObjectPattern(ast: AcornJsxAst.ObjectPattern, t: Type.ObjectType, env: Env): Env {
  ast.properties.forEach(prop => {
    const key = prop.key;
    const field = t.fields.find(field => field.field === prop.key.name)
    if (!field)
      return throwUnknownField(prop.key, prop.key.name);
    env = patTypeEnv(prop.value, field.type, env);
  });
  return env;
}

function patTypeEnv(ast: AcornJsxAst.Pattern, t: Type.Type, env: Env): Env {
  if (ast.type === 'ObjectPattern' && t.kind === 'Object')
    return patTypeEnvObjectPattern(ast, t, env);
  else if (ast.type === 'Identifier')
    return patTypeEnvIdentifier(ast, t, env);
  else
    return throwWithLocation(ast, `incompatible pattern for type ${prettyPrint(t)}`);
}

function typeOfTypeAnnotation(ann: AcornJsxAst.TypeAnnotation): Type.Type {
  switch (ann.type) {
    case 'TSBooleanKeyword': return Type.boolean;
    case 'TSNumberKeyword': return Type.number;
    case 'TSStringKeyword': return Type.string;
    case 'TSArrayType':
      return Type.array(typeOfTypeAnnotation(ann.elementType));
    case 'TSTupleType':
      return Type.tuple(...ann.elementTypes.map(typeOfTypeAnnotation));
    case 'TSTypeLiteral':
      const members =
        ann.members.map(mem => ({ [mem.key.name]: typeOfTypeAnnotation(mem.typeAnnotation.typeAnnotation) }));
      return Type.object(Object.assign({}, ...members));
    case 'TSLiteralType':
      // TODO(jaked) move this dispatch to Type
      const value = ann.literal.value;
      switch (typeof value) {
        case 'boolean': return Type.singleton(Type.boolean, value);
        case 'number': return Type.singleton(Type.number, value);
        case 'string': return Type.singleton(Type.string, value);
        case 'object': return Type.singleton(Type.null, value);
        default: throw new Error(`unexpected literal type ${ann.literal.value}`);
      }
  }
}

function synthArrowFunctionExpression(
  ast: AcornJsxAst.ArrowFunctionExpression,
  env: Env
): [Type.Type, boolean] {
  let patEnv: Env = Immutable.Map();
  const paramTypes = ast.params.map(param => {
    if (!param.typeAnnotation)
      return throwWithLocation(param, `function parameter must have a type`);
    const t = typeOfTypeAnnotation(param.typeAnnotation.typeAnnotation);
    patEnv = patTypeEnv(param, t, patEnv);
    return t;
  });
  env = env.concat(patEnv);
  // TODO(jaked) carry body atomness as effect on Type.function
  const [type, atom] = synth(ast.body, env);
  const funcType = Type.function(paramTypes, type);
  return [funcType, false];
}

// TODO(jaked) for HTML types, temporarily
const defaultElementType = Type.abstract('React.Component', Type.object({}));

function synthJSXElement(ast: AcornJsxAst.JSXElement, env: Env): [Type.Type, boolean] {
  const name = ast.openingElement.name.name;
  const [type, _] = env.get(name, [defaultElementType, false]);
  let propsType: Type.ObjectType;
  if (type.kind === 'Function' && type.args.length < 2) {
    if (type.args.length === 0) {
      propsType = Type.object({});
    } else {
      if (type.args[0].kind !== 'Object')
        throw new Error('expected object arg');
      propsType = type.args[0];
    }
    // TODO(jaked) check return type against reactNodeType
  } else if (type.kind === 'Abstract' && type.label === 'React.Component' && type.params.length === 1) {
    const param = type.params[0];
    if (param.kind !== 'Object')
      throw new Error('expected object arg');
    propsType = param;
  } else throw new Error('expected component type');
  // TODO(jaked) add `children: Type.array(reactNodeType)` to `propsType`

  const fieldTypes = new Map(propsType.fields.map(({ field, type }) => [field, type]));
  const attrsAtom = ast.openingElement.attributes.map(({ name, value }) => {
    const type = fieldTypes.get(name.name) || Type.unknown; // TODO(jaked) required/optional props
    return check(value, env, type);
  }).some(x => x);
  let childrenAtom =
    ast.children.map(child =>
      check(child, env, reactNodeType)
    ).some(x => x);

  return [reactElementType, attrsAtom || childrenAtom];
}

function synthJSXFragment(ast: AcornJsxAst.JSXFragment, env: Env): [Type.Type, boolean] {
  const typesAtoms = ast.children.map(e => synth(e, env));
  const types = typesAtoms.map(([type, _]) => type);
  const atom = typesAtoms.some(([_, atom]) => atom);
  const elem = Type.leastUpperBound(...types);
  return [Type.array(elem), atom];
  // TODO(jaked) we know children should satisfy `reactNodeType`
  // we could check that explicitly (as above in synthJSXElement)
  // see also comments on checkArray and checkUnion
}

function synthJSXExpressionContainer(
  ast: AcornJsxAst.JSXExpressionContainer,
  env: Env
): [Type.Type, boolean] {
  return synth(ast.expression, env);
}

function synthJSXText(ast: AcornJsxAst.JSXText, env: Env): [Type.Type, boolean] {
  return [Type.string, false];
}

function synthHelper(ast: AcornJsxAst.Expression, env: Env): [Type.Type, boolean] {
  switch (ast.type) {
    case 'Identifier':        return synthIdentifier(ast, env);
    case 'Literal':           return synthLiteral(ast, env);
    case 'ArrayExpression':   return synthArrayExpression(ast, env);
    case 'ObjectExpression':  return synthObjectExpression(ast, env);
    case 'ArrowFunctionExpression':
                              return synthArrowFunctionExpression(ast, env);
    case 'BinaryExpression':  return synthBinaryExpression(ast, env);
    case 'MemberExpression':  return synthMemberExpression(ast, env);
    case 'CallExpression':    return synthCallExpression(ast, env);
    case 'JSXElement':        return synthJSXElement(ast, env);
    case 'JSXFragment':       return synthJSXFragment(ast, env);
    case 'JSXExpressionContainer':
                              return synthJSXExpressionContainer(ast, env);
    case 'JSXText':           return synthJSXText(ast, env);

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

const reactElementType = Type.abstract('React.Element');
// TODO(jaked)
// fragments are also permitted here (see ReactNode in React typing)
// but we need recursive types to express it (ReactFragment = Array<ReactNode>)
// in the meantime we'll permit top-level fragments only
const reactNodeType_ =
  Type.union(reactElementType, Type.boolean, Type.number, Type.string, Type.null, Type.undefined);
// TODO(jaked) this probably belongs on Type
  export const reactNodeType =
  Type.union(reactNodeType_, Type.array(reactNodeType_));

function extendEnvWithImport(
  decl: AcornJsxAst.ImportDeclaration,
  moduleEnv: Immutable.Map<string, Type.ModuleType>,
  env: Env
): Env {
  const module = moduleEnv.get(decl.source.value);
  if (!module)
    throw new Error(`no module '${decl.source.value}' at ${location(decl)}`);
  decl.specifiers.forEach(spec => {
    switch (spec.type) {
      case 'ImportNamespaceSpecifier':
        env = env.set(spec.local.name, [module, false]);
        break;
      case 'ImportDefaultSpecifier':
        const defaultField = module.fields.find(ft => ft.field === 'default');
        if (!defaultField)
          throw new Error(`no default export on '${decl.source.value}' at ${location(decl)}`);
        env = env.set(spec.local.name, [defaultField.type, defaultField.atom]);
        break;
      case 'ImportSpecifier':
        const importedField = module.fields.find(ft => ft.field === spec.imported.name)
        if (!importedField)
          throw new Error(`no exported member '${spec.imported.name}' on '${decl.source.value}' at ${location(decl)}`);
        env = env.set(spec.local.name, [importedField.type, importedField.atom]);
        break;
    }
  });
  return env;
}

function extendEnvWithNamedExport(
  decl: AcornJsxAst.ExportNamedDeclaration,
  exportTypes: { [s: string]: [Type.Type, boolean] },
  env: Env
): Env {
  const declAtom = decl.declaration.kind === 'let';
  decl.declaration.declarations.forEach(declarator => {
    const [type, atom] = synth(declarator.init, env);
    // a let binding is always an atom (its initializer is a non-atom)
    // a const binding is an atom if its initializer is an atom
    // TODO(jaked)
    // let bindings of type T should also have type T => void
    // so they can be set in event handlers
    // TODO(jaked) temporarily ignore atomness of initializer
    const typeAtom: [Type.Type, boolean] = [type, /* atom || */ declAtom];
    exportTypes[declarator.id.name] = typeAtom;
    env = env.set(declarator.id.name, typeAtom);
  });
  return env;
}

function extendEnvWithDefaultExport(
  decl: AcornJsxAst.ExportDefaultDeclaration,
  exportTypes: { [s: string]: [Type.Type, boolean] },
  env: Env
): Env {
  exportTypes['default'] = synth(decl.declaration, env);
  return env;
}

// TODO(jaked) this interface is a little weird
export function synthMdx(
  ast: MDXHAST.Node,
  moduleEnv: Immutable.Map<string, Type.ModuleType>,
  env: Env,
  exportTypes: { [s: string]: [Type.Type, boolean] }
): Env {
  switch (ast.type) {
    case 'root':
    case 'element':
      ast.children.forEach(child =>
        env = synthMdx(child, moduleEnv, env, exportTypes)
      );
      return env;

    case 'text':
      return env;

    case 'jsx':
      if (!ast.jsxElement) throw new Error('expected JSX node to be parsed');
      ast.jsxElement.forEach(elem => check(elem, env, reactNodeType));
      return env;

    case 'import':
    case 'export': {
      if (!ast.declarations) throw new Error('expected import/export node to be parsed');
      ast.declarations.forEach(decls => decls.forEach(decl => {
        switch (decl.type) {
          case 'ImportDeclaration':
            env = extendEnvWithImport(decl, moduleEnv, env);
            break;

          case 'ExportNamedDeclaration':
            env = extendEnvWithNamedExport(decl, exportTypes, env);
            break;

          case 'ExportDefaultDeclaration':
            env = extendEnvWithDefaultExport(decl, exportTypes, env);
            break;
        }
      }));
      return env;
    }

    default: throw new Error('unexpected AST ' + (ast as MDXHAST.Node).type);
  }
}

// TODO(jaked) this interface is a little weird
export function synthProgram(
  ast: AcornJsxAst.Node,
  moduleEnv: Immutable.Map<string, Type.ModuleType>,
  env: Env,
  exportTypes: { [s: string]: [Type.Type, boolean] }
): Env {
  switch (ast.type) {
    case 'Program':
      ast.body.forEach(child =>
        env = synthProgram(child, moduleEnv, env, exportTypes)
      );
      return env;

    case 'ImportDeclaration':
      return extendEnvWithImport(ast, moduleEnv, env);

    case 'ExportNamedDeclaration':
      return extendEnvWithNamedExport(ast, exportTypes, env);

    case 'ExportDefaultDeclaration':
      return extendEnvWithDefaultExport(ast, exportTypes, env);

    default: throw new Error('unexpected AST ' + (ast as AcornJsxAst.Node).type);
  }
}
