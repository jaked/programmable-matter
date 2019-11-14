import * as Immutable from 'immutable';
import { bug } from '../../util/bug';
import Try from '../../util/Try';
import Type from '../Type';
import * as MDXHAST from '../mdxhast';
import * as ESTree from '../ESTree';
import { Env } from './env';
import * as Throw from './throw';
import { check } from './check';
import { narrowEnvironment } from './narrow';

function synthIdentifier(ast: ESTree.Identifier, env: Env): Type {
  const type = env.get(ast.name);
  if (type) return type;
  else return Throw.withLocation(ast, `unbound identifier ${ast.name}`);
}

function synthLiteral(ast: ESTree.Literal, env: Env): Type {
  return Type.singleton(ast.value);
}

function synthArrayExpression(ast: ESTree.ArrayExpression, env: Env): Type {
  const types = ast.elements.map(e => synth(e, env));
  const elem = Type.union(...types);
  return Type.array(elem);
}

function synthObjectExpression(ast: ESTree.ObjectExpression, env: Env): Type {
  const seen = new Set();
  const fields: Array<[string, Type]> =
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
  const fieldTypes = fields.map(([name, type]) => ({ [name]: type }));
  return Type.object(Object.assign({}, ...fieldTypes));
}

function synthUnaryExpression(ast: ESTree.UnaryExpression, env: Env): Type {
  const type = synth(ast.argument, env);

  if (type.kind === 'Singleton') {  // TODO(jaked) handle compound singletons
    switch (ast.operator) {
      case '!':
        return Type.singleton(!type.value);
      case 'typeof':
        return Type.singleton(typeof type.value);
      default:
        return bug(`unhandled ast ${ast.operator}`);
    }
  } else {
    switch (ast.operator) {
      case '!':
        return Type.boolean;
      case 'typeof':
        return Type.string; // TOOD(jaked) should be enumeration
      default:
        return bug(`unhandled ast ${ast.operator}`);
      }
  }
}

function synthLogicalExpression(ast: ESTree.LogicalExpression, env: Env): Type {
  switch (ast.operator) {
    case '&&': {
      const left = synth(ast.left, env);
      if (left.kind === 'Singleton') { // TODO(jaked) handle compound singletons
        const right = synth(ast.right, env); // synth even when !left.value
        return left.value ? right : left;
      } else {
        const rightEnv = narrowEnvironment(env, ast.left, true);
        const right = synth(ast.right, rightEnv);
        return Type.union(Type.intersection(left, Type.falsy), right);
      }
    }

    case '||': {
      const left = synth(ast.left, env);
      if (left.kind === 'Singleton') { // TODO(jaked) handle compound singletons
        const right = synth(ast.right, env); // synth even when left.value
        return left.value ? left : right;
      } else {
        const rightEnv = narrowEnvironment(env, ast.left, false);
        const right = synth(ast.right, rightEnv);
        // TODO(jaked) Type.union(Type.intersection(left, Type.notFalsy), right) ?
        return Type.union(left, right);
      }
    }

    default:
        return bug(`unexpected operator ${ast.operator}`);
  }
}

function synthBinaryExpression(ast: ESTree.BinaryExpression, env: Env): Type {
  let left = synth(ast.left, env);
  let right = synth(ast.right, env);

  // TODO(jaked) handle compound singletons
  if (left.kind === 'Singleton' && right.kind === 'Singleton') {
    // TODO(jaked) handle other operators
    switch (ast.operator) {
      case '===':
        return Type.singleton(left.value === right.value);
      case '!==':
        return Type.singleton(left.value !== right.value);

      case '+': {
        if (left.base.kind === 'number' && right.base.kind === 'number')
          return Type.singleton(left.value + right.value);
        else if (left.base.kind === 'string' && right.base.kind === 'string')
          return Type.singleton(left.value + right.value);
        else return Throw.withLocation(ast, 'incompatible operands to +');
      }

      default:
        return Throw.withLocation(ast, 'unimplemented');
    }
  } else {
    if (left.kind === 'Singleton') left = left.base;
    if (right.kind === 'Singleton') right = right.base;

    // TODO(jaked) handle other operators
    switch (ast.operator) {
      case '===':
      case '!==':
        return Type.boolean;

      case '+': {
        if (left.kind === 'number' && right.kind === 'number')
          return Type.number;
        else if (left.kind === 'string' && right.kind === 'string')
          return Type.string;
        else return Throw.withLocation(ast, 'incompatible operands to +');
      }

      default:
        return Throw.withLocation(ast, 'unimplemented');
    }
  }
}

function synthMemberExpression(
  ast: ESTree.MemberExpression,
  env: Env,
  objectType?: Type | undefined
): Type {
  objectType = objectType || synth(ast.object, env);

  if (objectType.kind === 'Union') {
    const types =
      objectType.types.map(type => synthMemberExpression(ast, env, type));
    return Type.union(...types);

  } else if (ast.computed) {
    switch (objectType.kind) {
      case 'Array':
        check(ast.property, env, Type.number);
        return objectType.elem;

      case 'Tuple': {
        // check against union of valid indexes
        const elems = objectType.elems;
        const validIndexes =
          elems.map((_, i) => Type.singleton(i));
        check(ast.property, env, Type.union(...validIndexes));

        // synth to find out which valid indexes are actually present
        const propertyType = synth(ast.property, env);
        const presentIndexes: Array<number> = [];
        if (propertyType.kind === 'Singleton') {
          presentIndexes.push(propertyType.value);
        } else if (propertyType.kind === 'Union') {
          propertyType.types.forEach(type => {
            if (type.kind === 'Singleton') presentIndexes.push(type.value);
            else bug('expected Singleton');
          });
        } else bug('expected Singleton or Union')

        // and return union of element types of present indexes
        const presentTypes =
          presentIndexes.map(i => elems[i]);
        return Type.union(...presentTypes);
      }

      case 'Object': {
        // check against union of valid indexes
        const fields = objectType.fields;
        const validIndexes =
          fields.map(({ field }) => Type.singleton(field));
        check(ast.property, env, Type.union(...validIndexes));

        // synth to find out which valid indexes are actually present
        const propertyType = synth(ast.property, env);
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
            const fieldType = fields.find(({ field }) => field === i);
            if (fieldType) return fieldType.type;
            else throw new Error('expected valid index');
          });
        return Type.union(...presentTypes);
      }

      // case 'Module':
      // no computed members on modules, different members may have different atomness
      // (for that matter, maybe we should not have computed members on tuples / objects)

      default:
        return bug('unimplemented synthMemberExpression ' + objectType.kind);
    }
  } else {
    if (ast.property.type === 'Identifier') {
      const name = ast.property.name;
      switch (objectType.kind) {
        case 'Array':
          switch (name) {
            case 'length': return Type.number;
            default: return Throw.unknownField(ast, name);
          }

        case 'Object': {
          const field = objectType.fields.find(ft => ft.field === name);
          if (field) return field.type;
          else return Throw.unknownField(ast, name);
        }

        case 'Module': {
          const field = objectType.fields.find(ft => ft.field === name);
          if (field) return field.type;
          else return Throw.unknownField(ast, name);
        }

        default:
          // TODO(jaked) Typescript gives a separate error for null / undefined
          return Throw.unknownField(ast, name);
      }
    } else {
      return bug('expected identifier on non-computed property');
    }
  }
}

function synthCallExpression(
  ast: ESTree.CallExpression,
  env:Env,
  calleeType?: Type | undefined
): Type {
  calleeType = calleeType || synth(ast.callee, env);

  if (calleeType.kind === 'Intersection') {
    const callTypes =
      calleeType.types
        .filter(type => type.kind === 'Function')
        .map(type => Try.apply(() => synthCallExpression(ast, env, type)));
    if (callTypes.some(tryType => tryType.type === 'ok')) {
      const retTypes =
        callTypes.filter(tryType => tryType.type === 'ok')
          .map(tryType => tryType.get());
      return Type.intersection(...retTypes);
    } else {
      // TODO(jaked) better error message
      return Throw.withLocation(ast, 'no matching function type');
    }
  } else if (calleeType.kind === 'Function') {
    if (calleeType.args.length !== ast.arguments.length)
      // TODO(jaked) support short arg lists if arg type contains undefined
      // TODO(jaked) check how this works in Typescript
      Throw.expectedType(ast, `${calleeType.args.length} args`, `${ast.arguments.length}`);
    calleeType.args.forEach((type, i) => check(ast.arguments[i], env, type));
    return calleeType.ret;
  } else {
    return Throw.expectedType(ast.callee, 'function', calleeType)
  }
}

function patTypeEnvIdentifier(ast: ESTree.Identifier, type: Type, env: Env): Env {
  if (ast.type !== 'Identifier')
    return Throw.withLocation(ast, `incompatible pattern for type ${Type.toString(type)}`);
  if (env.has(ast.name))
    return Throw.withLocation(ast, `identifier ${ast.name} already bound in pattern`);
  return env.set(ast.name, type);
}

function patTypeEnvObjectPattern(ast: ESTree.ObjectPattern, t: Type.ObjectType, env: Env): Env {
  ast.properties.forEach(prop => {
    const key = prop.key;
    const field = t.fields.find(field => field.field === key.name)
    if (!field)
      return Throw.unknownField(key, key.name);
    env = patTypeEnv(prop.value, field.type, env);
  });
  return env;
}

function patTypeEnv(ast: ESTree.Pattern, t: Type, env: Env): Env {
  if (ast.type === 'ObjectPattern' && t.kind === 'Object')
    return patTypeEnvObjectPattern(ast, t, env);
  else if (ast.type === 'Identifier')
    return patTypeEnvIdentifier(ast, t, env);
  else
    return Throw.withLocation(ast, `incompatible pattern for type ${Type.toString(t)}`);
}

function typeOfTypeAnnotation(ann: ESTree.TypeAnnotation): Type {
  switch (ann.type) {
    case 'TSBooleanKeyword': return Type.boolean;
    case 'TSNumberKeyword': return Type.number;
    case 'TSStringKeyword': return Type.string;
    case 'TSNullKeyword': return Type.nullType;
    case 'TSUndefinedKeyword': return Type.undefined;
    case 'TSArrayType':
      return Type.array(typeOfTypeAnnotation(ann.elementType));
    case 'TSTupleType':
      return Type.tuple(...ann.elementTypes.map(typeOfTypeAnnotation));
    case 'TSTypeLiteral':
      // TODO(jaked) handle optional members
      const members =
        ann.members.map(mem => ({ [mem.key.name]: typeOfTypeAnnotation(mem.typeAnnotation.typeAnnotation) }));
      return Type.object(Object.assign({}, ...members));
    case 'TSLiteralType':
      return Type.singleton(ann.literal.value);
    case 'TSUnionType':
      return Type.union(...ann.types.map(typeOfTypeAnnotation));
    case 'TSIntersectionType':
      return Type.intersection(...ann.types.map(typeOfTypeAnnotation));
    case 'TSTypeReference':
      if (ann.typeName.type === 'TSQualifiedName' &&
          ann.typeName.left.type === 'Identifier' && ann.typeName.left.name === 'React' &&
          ann.typeName.right.type === 'Identifier' && ann.typeName.right.name === 'ReactNode')
            return Type.reactNodeType;
      else throw new Error(`unimplemented TSTypeReference`);

    default: throw new Error(`unknown AST ${(ann as ESTree.TypeAnnotation).type}`);
  }
}

function synthArrowFunctionExpression(
  ast: ESTree.ArrowFunctionExpression,
  env: Env
): Type {
  let patEnv: Env = Immutable.Map();
  const paramTypes = ast.params.map(param => {
    if (!param.typeAnnotation)
      return Throw.withLocation(param, `function parameter must have a type`);
    const t = typeOfTypeAnnotation(param.typeAnnotation.typeAnnotation);
    patEnv = patTypeEnv(param, t, patEnv);
    return t;
  });
  env = env.concat(patEnv);
  const type = synth(ast.body, env);
  return Type.functionType(paramTypes, type);
}

function synthConditionalExpression(
  ast: ESTree.ConditionalExpression,
  env: Env
): Type {
  const testType = synth(ast.test, env);

  if (testType.kind === 'Singleton') { // TODO(jaked) handle compound singletons
    if (testType.value) {
      const envConsequent = narrowEnvironment(env, ast.test, true);
      return synth(ast.consequent, envConsequent);
    } else {
      const envAlternate = narrowEnvironment(env, ast.test, false);
      return synth(ast.alternate, envAlternate);
    }
  } else {
    const envConsequent = narrowEnvironment(env, ast.test, true);
    const envAlternate = narrowEnvironment(env, ast.test, false);
    const consequent = synth(ast.consequent, envConsequent);
    const alternate = synth(ast.alternate, envAlternate);
    return Type.union(consequent, alternate);
  }
}

function synthJSXIdentifier(ast: ESTree.JSXIdentifier, env: Env): Type {
  const type = env.get(ast.name);
  if (type) return type;
  else throw new Error('unbound identifier ' + ast.name);
}

function synthJSXElement(ast: ESTree.JSXElement, env: Env): Type {
  const type = synth(ast.openingElement.name, env);

  let propsType: Type.ObjectType;
  let retType: Type;
  if (type.kind === 'Function') {
    retType = type.ret;
    if (type.args.length === 0) {
      propsType = Type.object({});
    } else if (type.args.length === 1) {
      if (type.args[0].kind !== 'Object')
        throw new Error('expected object arg');
      propsType = type.args[0];
      const childrenField = propsType.fields.find(field => field.field === 'children');
      if (childrenField) {
        if (!Type.isSubtype(Type.array(Type.reactNodeType), childrenField.type))
          throw new Error('expected children type');
      }
    } else throw new Error('expected 0- or 1-arg function');
  } else if (type.kind === 'Abstract' && type.label === 'React.Component' && type.params.length === 1) {
    if (type.params[0].kind !== 'Object')
      throw new Error('expected object arg');
    retType = Type.reactElementType;
    propsType = type.params[0];
  } else throw new Error('expected component type');

  const attrNames =
    new Set(ast.openingElement.attributes.map(({ name }) => name.name ));
  propsType.fields.forEach(({ field, type }) => {
    if (field !== 'children' &&
        !attrNames.has(field) &&
        !Type.isSubtype(Type.undefined, type))
      Throw.missingField(ast, field);
  });

  const propTypes = new Map(propsType.fields.map(({ field, type }) => [field, type]));
  ast.openingElement.attributes.forEach(attr => {
    const type = propTypes.get(attr.name.name);
    if (type) return check(attr.value, env, type);
    else return Throw.extraField(attr, attr.name.name);
  });

  ast.children.map(child =>
    // TODO(jaked) see comment about recursive types on Type.reactNodeType
    check(child, env, Type.union(Type.reactNodeType, Type.array(Type.reactNodeType)))
  );

  return retType;
}

function synthJSXFragment(ast: ESTree.JSXFragment, env: Env): Type {
  const types = ast.children.map(e => synth(e, env));
  const elem = Type.union(...types);
  return Type.array(elem);
  // TODO(jaked) we know children should satisfy `reactNodeType`
  // we could check that explicitly (as above in synthJSXElement)
  // see also comments on checkArray and checkUnion
}

function synthJSXExpressionContainer(
  ast: ESTree.JSXExpressionContainer,
  env: Env
): Type {
  return synth(ast.expression, env);
}

function synthJSXText(ast: ESTree.JSXText, env: Env): Type {
  return Type.string;
}

function synthHelper(ast: ESTree.Expression, env: Env): Type {
  switch (ast.type) {
    case 'Identifier':              return synthIdentifier(ast, env);
    case 'Literal':                 return synthLiteral(ast, env);
    case 'ArrayExpression':         return synthArrayExpression(ast, env);
    case 'ObjectExpression':        return synthObjectExpression(ast, env);
    case 'ArrowFunctionExpression': return synthArrowFunctionExpression(ast, env);
    case 'UnaryExpression':         return synthUnaryExpression(ast, env);
    case 'LogicalExpression':       return synthLogicalExpression(ast, env);
    case 'BinaryExpression':        return synthBinaryExpression(ast, env);
    case 'MemberExpression':        return synthMemberExpression(ast, env);
    case 'CallExpression':          return synthCallExpression(ast, env);
    case 'ConditionalExpression':   return synthConditionalExpression(ast, env);
    case 'JSXIdentifier':           return synthJSXIdentifier(ast, env);
    case 'JSXElement':              return synthJSXElement(ast, env);
    case 'JSXFragment':             return synthJSXFragment(ast, env);
    case 'JSXExpressionContainer':  return synthJSXExpressionContainer(ast, env);
    case 'JSXText':                 return synthJSXText(ast, env);

    default:
      return bug(`unimplemented AST ${ast.type}`);
  }
}

export function synth(ast: ESTree.Expression, env: Env): Type {
  try {
    const type = synthHelper(ast, env);
    ast.etype = Try.ok(type);
    return type;
  } catch (e) {
    ast.etype = Try.err(e);
    throw e;
  }
}

function extendEnvWithImport(
  decl: ESTree.ImportDeclaration,
  moduleEnv: Immutable.Map<string, Type.ModuleType>,
  env: Env
): Env {
  const module = moduleEnv.get(decl.source.value);
  if (!module)
    return Throw.withLocation(decl, `no module '${decl.source.value}'`);
  decl.specifiers.forEach(spec => {
    switch (spec.type) {
      case 'ImportNamespaceSpecifier':
        env = env.set(spec.local.name, module);
        break;
      case 'ImportDefaultSpecifier':
        const defaultField = module.fields.find(ft => ft.field === 'default');
        if (!defaultField)
          return Throw.withLocation(decl, `no default export on '${decl.source.value}'`);
        env = env.set(spec.local.name, defaultField.type);
        break;
      case 'ImportSpecifier':
        const importedField = module.fields.find(ft => ft.field === spec.imported.name)
        if (!importedField)
          return Throw.withLocation(decl, `no exported member '${spec.imported.name}' on '${decl.source.value}'`);
        env = env.set(spec.local.name, importedField.type);
        break;
    }
  });
  return env;
}

function extendEnvWithNamedExport(
  decl: ESTree.ExportNamedDeclaration,
  exportTypes: { [s: string]: Type },
  env: Env
): Env {
  decl.declaration.declarations.forEach(declarator => {
    const type = synth(declarator.init, env);
    // a let binding is always an atom (its initializer is a non-atom)
    // a const binding is an atom if its initializer is an atom
    // TODO(jaked)
    // let bindings of type T should also have type T => void
    // so they can be set in event handlers
    exportTypes[declarator.id.name] = type;
    env = env.set(declarator.id.name, type);
  });
  return env;
}

function extendEnvWithDefaultExport(
  decl: ESTree.ExportDefaultDeclaration,
  exportTypes: { [s: string]: Type },
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
  exportTypes: { [s: string]: Type }
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
      ast.jsxElement.forEach(elem => check(elem, env, Type.reactNodeType));
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
  ast: ESTree.Node,
  moduleEnv: Immutable.Map<string, Type.ModuleType>,
  env: Env,
  exportTypes: { [s: string]: Type }
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

    default: throw new Error('unexpected AST ' + (ast as ESTree.Node).type);
  }
}
