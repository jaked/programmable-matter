import * as Immutable from 'immutable';
import * as Name from '../../util/Name';
import { bug } from '../../util/bug';
import Type from '../Type';
import * as ESTree from '../ESTree';
import { TypesMap } from '../../model';
import { Env } from './env';
import * as Error from './error';
import { check } from './check';
import { narrowType, narrowEnvironment } from './narrow';

function synthIdentifier(
  ast: ESTree.Identifier,
  env: Env,
  typesMap: TypesMap,
): Type {
  const type = env.get(ast.name);
  if (type) return type;
  else if (ast.name === 'undefined') return Type.undefined;
  else return Error.withLocation(ast, `unbound identifier '${ast.name}'`, typesMap);
}

function synthLiteral(
  ast: ESTree.Literal,
  env: Env,
  typesMap: TypesMap,
): Type {
  return Type.singleton(ast.value);
}

function synthArray(
  ast: ESTree.ArrayExpression,
  env: Env,
  typesMap: TypesMap,
): Type {
  const types = ast.elements.map(e => synth(e, env, typesMap));
  const elem = Type.union(...types);
  return Type.array(elem);
}

function synthObject(
  ast: ESTree.ObjectExpression,
  env: Env,
  typesMap: TypesMap,
): Type {
  const seen = new Set();
  const fieldTypes = ast.properties.map(prop => {
    let name: string;
    switch (prop.key.type) {
      case 'Identifier': name = prop.key.name; break;
      case 'Literal': name = prop.key.value; break;
      default: bug('expected Identifier or Literal property name');
    }
    if (seen.has(name)) {
      synth(prop.value, env, typesMap);
      // TODO(jaked) this highlights the error but we also need to skip evaluation
      Error.withLocation(prop.key, `duplicate property name '${name}'`, typesMap);
      return undefined;
    } else {
      seen.add(name);
      return { name, type: synth(prop.value, env, typesMap) };
    }
  });

  const fieldTypesObj = fieldTypes.reduce<{ [n: string]: Type }>(
    (obj, nameType) => {
      if (!nameType) return obj;
      const { name, type } = nameType;
      return { ...obj, [name]: type };
    },
    {}
  );
  return Type.object(fieldTypesObj);
}

const typeofType =
  Type.enumerate('undefined', 'boolean', 'number', 'string', 'function', 'object', 'error')

function synthUnary(
  ast: ESTree.UnaryExpression,
  env: Env,
  typesMap: TypesMap,
): Type {
  return synthAndThen(ast.argument, env, typesMap, (type, typesMap) => {
    if (type.kind === 'Error') switch (ast.operator) {
      // TODO(jaked) does this make sense?
      case '+':      return Type.singleton(0);
      case '-':      return Type.singleton(0);
      case '!':      return Type.singleton(true);
      case 'typeof': return Type.singleton('error');
    }
    if (type.kind === 'Singleton') {
      const value = type.value;
      switch (ast.operator) {
        case '!':      return Type.singleton(!value);
        case 'typeof': return Type.singleton(typeof value);
        default:
          if (type.base.kind === 'number') switch (ast.operator) {
            case '+': return Type.singleton(value);
            case '-': return Type.singleton(-value);
          }
      }
    }
    switch (ast.operator) {
      case '!':      return Type.boolean;
      case 'typeof': return typeofType;
      default:
        if (type.kind === 'number') switch (ast.operator) {
          case '+': return Type.number;
          case '-': return Type.number;
        }
    }
    return Error.withLocation(ast, 'incompatible operand to ${ast.operator}', typesMap);
  });
}

function synthLogical(
  ast: ESTree.LogicalExpression,
  env: Env,
  typesMap: TypesMap,
): Type {
  const rightEnv = narrowEnvironment(env, ast.left, ast.operator === '&&', typesMap);
  return synthAndThen(ast.left, env, typesMap, (left, typesMap) => {
    return synthAndThen(ast.right, rightEnv, typesMap, (right, typesMap) => {
      switch (ast.operator) {
        case '&&': {
          switch (left.kind) {
            case 'Error':     return left;
            case 'Singleton': return left.value ? right : left;
            default:          return Type.union(narrowType(left, Type.falsy), right);
          }
        }

        case '||': {
          switch (left.kind) {
            case 'Error':     return right;
            case 'Singleton': return left.value ? left : right;

            // TODO(jaked) Type.union(Type.intersection(left, Type.notFalsy), right) ?
            default:          return Type.union(left, right);
          }
        }

        default:
          bug(`unexpected operator ${ast.operator}`);
      }
    })
  });
}

function synthBinary(
  ast: ESTree.BinaryExpression,
  env: Env,
  typesMap: TypesMap,
): Type {
  // TODO(jaked) handle other operators

  return synthAndThen(ast.left, env, typesMap, (left, typesMap) => {
    return synthAndThen(ast.right, env, typesMap, (right, typesMap) => {

      if (left.kind === 'Error') switch (ast.operator) {
        case '===': return Type.singleton(false);
        case '!==': return Type.singleton(true);
        default:    return right;
      }
      if (right.kind === 'Error') switch (ast.operator) {
        case '===': return Type.singleton(false);
        case '!==': return Type.singleton(true);
        default:    return left;
      }
      if (left.kind === 'Singleton' && right.kind === 'Singleton') {
        const lvalue = left.value;
        const rvalue = right.value;
        switch (ast.operator) {
          case '===': return Type.singleton(lvalue === right.value);
          case '!==': return Type.singleton(lvalue !== right.value);
          default:
            if (left.base.kind === 'number' && right.base.kind === 'number') switch (ast.operator) {
              case '-': return Type.singleton(lvalue - rvalue);
              case '*': return Type.singleton(lvalue * rvalue);
              case '+': return Type.singleton(lvalue + rvalue);
              case '/': return Type.singleton(lvalue / rvalue);
              case '%': return Type.singleton(lvalue % rvalue);
            }
            if (left.base.kind === 'string' && right.base.kind === 'string') switch (ast.operator) {
              case '+': return Type.singleton(lvalue + rvalue);
            }
        }
      }
      if ((left.kind === 'number' || (left.kind === 'Singleton' && left.base.kind === 'number')) &&
          (right.kind === 'number' || (right.kind === 'Singleton' && right.base.kind === 'number'))) {
        switch (ast.operator) {
          case '+':
          case '-':
          case '*':
          case '/':
          case '%':
            return Type.number;
        }
      }
      if ((left.kind === 'string' || (left.kind === 'Singleton' && left.base.kind === 'string')) &&
          (right.kind === 'string' || (right.kind === 'Singleton' && right.base.kind === 'string'))) {
        switch (ast.operator) {
          case '+':
            return Type.string;
        }
      }
      switch (ast.operator) {
        case '===':
        case '!==':
          return Type.boolean;
      }
      return Error.withLocation(ast, `incompatible operands to ${ast.operator}`, typesMap);
    });
  });
}

function synthSequence(
  ast: ESTree.SequenceExpression,
  env: Env,
  typesMap: TypesMap,
): Type {
  const types = ast.expressions.map(e => synth(e, env, typesMap));
  return types[types.length - 1];
}

function synthMember(
  ast: ESTree.MemberExpression,
  env: Env,
  typesMap: TypesMap,
): Type {
  return synthAndThen(ast.object, env, typesMap, (objType, typesMap) => {
    if (objType.kind === 'Error') return objType;

    if (ast.computed)
      return synthAndThen(ast.property, env, typesMap, (prop, typesMap) => {

        switch (objType.kind) {
          case 'Array':
            if (prop.kind === 'Error') return Type.undefined;
            if (prop.kind === 'number' ||
                (prop.kind === 'Singleton' && prop.base.kind === 'number')) {
              return Type.undefinedOr(objType.elem);
            }
            return Error.expectedType(ast, Type.number, prop, typesMap);

          case 'Tuple':
            if (prop.kind === 'Error') return prop;
            if (prop.kind === 'Singleton' && prop.base.kind === 'number') {
              if (prop.value < objType.elems.size)
                return objType.elems.get(prop.value) ?? bug(`expected elem`);
              return Error.noElementAtIndex(ast, prop.value, typesMap);
            }
            return Error.expectedType(ast, Type.number, prop, typesMap);

          case 'Object':
            if (prop.kind === 'Error') return prop;
            if (prop.kind === 'Singleton' && prop.base.kind === 'string') {
              const type = objType.getFieldType(prop.value);
              if (type) return type;
              else return Error.unknownField(ast, prop.value, typesMap);
            }
            return Error.expectedType(ast, Type.string, prop, typesMap);

          default:
            return Error.expectedType(ast, 'Array or Tuple', objType, typesMap);
        }
      });

    else {
      if (ast.property.type !== 'Identifier')
        bug(`expected identifier on non-computed property`);

      const name = ast.property.name;
      switch (objType.kind) {
        case 'string':
          switch (name) {
            case 'startsWith':
              return Type.functionType([Type.string], Type.boolean);
          }
          break;

        case 'number':
          switch (name) {
            case 'toString':
              return Type.functionType([], Type.string);
          }
          break;

        case 'Array':
          switch (name) {
            case 'size': return Type.number;

            case 'some':
            case 'every':
              return Type.functionType(
                [ Type.functionType([ objType.elem, Type.number, objType ], Type.boolean) ],
                Type.boolean,
              );

            case 'filter':
              return Type.functionType(
                [ Type.functionType([ objType.elem, Type.number, objType ], Type.boolean) ],
                objType,
              );

            case 'forEach':
              return Type.functionType(
                [ Type.functionType([ objType.elem, Type.number, objType ], Type.undefined) ],
                Type.undefined,
              );

            case 'map':
              return Type.functionType(
                [ Type.functionType([ objType.elem, Type.number, objType ], Type.reactNodeType) ], // TODO(jaked) temporary
                Type.array(Type.reactNodeType),
              );
          }
          break;

        case 'Map':
          switch (name) {
            case 'size': return Type.number;

            case 'set':
              return Type.functionType([ objType.key, objType.value ], objType);

            case 'delete':
              return Type.functionType([ objType.key ], objType,);

            case 'clear':
              return Type.functionType([], objType);

            case 'filter':
              return Type.functionType(
                [ Type.functionType([ objType.value, objType.key, objType ], Type.boolean) ],
                objType,
              );

            case 'toList':
              return Type.functionType([], Type.array(objType.value));

            case 'update':
              return Type.functionType(
                [ objType.key, Type.functionType([ objType.value ], objType.value) ],
                objType
              )

            case 'get':
              return Type.functionType(
                [ objType.key ],
                Type.undefinedOr(objType.value),
              );
          }
          break;

        case 'Object': {
          const type = objType.getFieldType(name);
          if (type) return type;
          break;
        }

        case 'Module': {
          const type = objType.getFieldType(name);
          if (type) return type;
          break;
        }
      }
      return Error.unknownField(ast.property, name, typesMap);
    }
  });
}

function synthCall(
  ast: ESTree.CallExpression,
  env:Env,
  typesMap: TypesMap,
): Type {
  return synthAndThen(ast.callee, env, typesMap, (callee, typesMap) => {
    if (callee.kind !== 'Function')
      return Error.expectedType(ast.callee, 'function', callee, typesMap);

    // TODO(jaked) tolerate extra arguments
    else if (ast.arguments.length > callee.args.size)
      return Error.wrongArgsLength(ast, callee.args.size, ast.arguments.length, typesMap);
    else {
      const types = callee.args.map((expectedType, i) => {
        if (i < ast.arguments.length) {
          const type = check(ast.arguments[i], env, expectedType, typesMap);
          // it's OK for an argument to be Error if the function accepts undefined
          if (type.kind === 'Error' && Type.isSubtype(Type.undefined, expectedType))
            return Type.undefined;
          else
            return type;
        } else if (Type.isSubtype(Type.undefined, expectedType)) {
          // it's OK for an argument to be missing if the function accepts undefined
          return Type.undefined;
        } else
          return Error.wrongArgsLength(ast, callee.args.size, ast.arguments.length, typesMap);
      });
      // if there aren't enough arguments or a required argument is Error then the call is Error
      return types.find(type => type.kind === 'Error') ?? callee.ret;
    }
  });
}

function patTypeEnvIdentifier(
  ast: ESTree.Identifier,
  type: Type,
  env: Env,
  typesMap: TypesMap,
): Env {
  if (env.has(ast.name)) {
    Error.withLocation(ast, `identifier ${ast.name} already bound in pattern`, typesMap);
    return env;
  } else {
    return env.set(ast.name, type);
  }
}

function patTypeEnvObjectPattern(
  ast: ESTree.ObjectPattern,
  t: Type.ObjectType,
  env: Env,
  typesMap: TypesMap,
): Env {
  ast.properties.forEach(prop => {
    const key = prop.key;
    const field = t.fields.find(field => field._1 === key.name)
    if (!field) {
      Error.unknownField(key, key.name, typesMap);
    } else {
      env = patTypeEnv(prop.value, field._2, env, typesMap);
    }
  });
  return env;
}

function patTypeEnv(
  ast: ESTree.Pattern,
  t: Type,
  env: Env,
  typesMap: TypesMap,
): Env {
  if (ast.type === 'ObjectPattern' && t.kind === 'Object')
    return patTypeEnvObjectPattern(ast, t, env, typesMap);
  else if (ast.type === 'Identifier')
    return patTypeEnvIdentifier(ast, t, env, typesMap);
  else {
    Error.withLocation(ast, `incompatible pattern for type ${Type.toString(t)}`, typesMap);
    return env;
  }
}

function genPatType(
  ast: ESTree.Pattern,
  t: Type,
): Type {
  if (ast.type === 'ObjectPattern') {
    return Type.object(
      ast.properties.reduce((obj, prop) =>
        ({ ...obj, [prop.key.name]: prop.shorthand ? t : genPatType(prop.value, t) }),
        {}
      )
    );
  } else if (ast.type === 'Identifier') {
    return t;
  } else {
    bug(`unexpected ast type '${(ast as ESTree.Pattern).type}'`);
  }
}

function synthArrowFunction(
  ast: ESTree.ArrowFunctionExpression,
  env: Env,
  typesMap: TypesMap,
): Type {
  let patEnv: Env = Immutable.Map();
  const paramTypes = ast.params.map(param => {
    if (!param.typeAnnotation) {
      const t = Error.withLocation(param, `function parameter must have a type`, typesMap);
      patEnv = patTypeEnv(param, genPatType(param, t), patEnv, typesMap);
      return genPatType(param, Type.unknown);
    }
    const t = Type.ofTSType(param.typeAnnotation.typeAnnotation, typesMap);
    patEnv = patTypeEnv(param, t, patEnv, typesMap);
    return t;
  });
  env = env.concat(patEnv);
  const type = synth(ast.body, env, typesMap);
  // TODO(jaked) doesn't handle parameters of union type
  return Type.functionType(paramTypes, type);
}

function synthConditional(
  ast: ESTree.ConditionalExpression,
  env: Env,
  typesMap: TypesMap,
): Type {
  const envConsequent = narrowEnvironment(env, ast.test, true, typesMap);
  const envAlternate = narrowEnvironment(env, ast.test, false, typesMap);
  const consequent = synth(ast.consequent, envConsequent, typesMap);
  const alternate = synth(ast.alternate, envAlternate, typesMap);

  return synthAndThen(ast.test, env, typesMap, (test, typesMap) => {
    if (Type.isTruthy(test))
      return consequent;
    else if (Type.isFalsy(test))
      return alternate;
    else
      return Type.union(consequent, alternate);
  });
}

function synthTemplateLiteral(
  ast: ESTree.TemplateLiteral,
  env: Env,
  typesMap: TypesMap,
): Type {
  // TODO(jaked) handle interpolations
  return Type.string;
}

function synthJSXIdentifier(
  ast: ESTree.JSXIdentifier,
  env: Env,
  typesMap: TypesMap,
): Type {
  const type = env.get(ast.name);
  if (type) return type;
  else return Error.withLocation(ast, `unbound identifier '${ast.name}'`, typesMap);
}

function synthJSXElement(
  ast: ESTree.JSXElement,
  env: Env,
  typesMap: TypesMap,
): Type {
  return synthAndThen(ast.openingElement.name, env, typesMap, (type, typesMap) => {
    const { props, ret } = (() => {
      switch (type.kind) {
        case 'Error':
          return { props: Type.object({}), ret: type }

        case 'Function':
          if (type.args.size === 0) {
            return { props: Type.object({}), ret: type.ret };

          } else if (type.args.size === 1) {
            const argType = type.args.get(0) ?? bug();
            if (argType.kind === 'Object') {
              const childrenField = argType.fields.find(field => field._1 === 'children');
              if (!childrenField || Type.isSubtype(Type.array(Type.reactNodeType), childrenField._2))
                return { props: argType, ret: type.ret };
            }
          }
          // TODO(jaked)
          // ok for func to have extra args as long as they accept undefined
          break;
      }
      // TODO(jaked) it would be better to mark the whole JSXElement as having an error
      // but for now this get us the right error highlighting in Editor
      return { props: Type.object({}), ret: Error.expectedType(ast.openingElement.name, 'component type', type, typesMap) };
    })();

    const attrTypes = ast.openingElement.attributes.map(attr => {
      const expectedType = props.getFieldType(attr.name.name);
      if (expectedType) {
        if (attr.value) {
          const type = check(attr.value, env, expectedType, typesMap);
          // it's OK for an argument to be Error if the function accepts undefined
          if (type.kind === 'Error' && Type.isSubtype(Type.undefined, expectedType))
            return Type.undefined;
          else
            return type;
        } else {
          const actual = Type.singleton(true);
          if (Type.isSubtype(actual, expectedType))
            return actual;
          else
            return Error.expectedType(attr.name, expectedType, actual, typesMap);
        }
      } else {
        // TODO(jaked) putting the error here gets us the right highlighting
        // but we also need to skip evaluation, would be better to put it on attr
        Error.extraField(attr.name, attr.name.name, typesMap);
        if (attr.value) {
          // TODO(jaked) an error in an extra attribute should not fail whole tag
          return synth(attr.value, env, typesMap);
        } else {
          return Type.singleton(true);
        }
      }
    });

    ast.children.forEach(child =>
      // TODO(jaked) see comment about recursive types on Type.reactNodeType
      check(child, env, Type.union(Type.reactNodeType, Type.array(Type.reactNodeType)), typesMap)
    );

    const attrNames =
      new Set(ast.openingElement.attributes.map(({ name }) => name.name ));
    let missingField: undefined | Type.ErrorType = undefined;
    props.fields.forEach(({ _1: name, _2: type }) => {
      if (name !== 'children' &&
          !attrNames.has(name) &&
          // it's OK for an argument to be missing if the function accepts undefined
          !Type.isSubtype(Type.undefined, type))
        // TODO(jaked) it would be better to mark the whole JSXElement as having an error
        // but for now this get us the right error highlighting in Editor
        missingField = Error.missingField(ast.openingElement.name, name, typesMap);
    });
    if (missingField) return missingField;

    return attrTypes.find(type => type.kind === 'Error') ?? ret;
  });
}

function synthJSXFragment(
  ast: ESTree.JSXFragment,
  env: Env,
  typesMap: TypesMap,
): Type {
  ast.children.forEach(child =>
    // TODO(jaked) see comment about recursive types on Type.reactNodeType
    check(child, env, Type.union(Type.reactNodeType, Type.array(Type.reactNodeType)), typesMap)
  );
  return Type.reactNodeType;
}

function synthJSXExpressionContainer(
  ast: ESTree.JSXExpressionContainer,
  env: Env,
  typesMap: TypesMap,
): Type {
  return synth(ast.expression, env, typesMap);
}

function synthJSXText(
  ast: ESTree.JSXText,
  env: Env,
  typesMap: TypesMap,
): Type {
  return Type.string;
}

function synthJSXEmptyExpression(
  ast: ESTree.JSXEmptyExpression,
  env: Env,
  typesMap: TypesMap,
): Type {
  return Type.undefined;
}

function synthHelper(
  ast: ESTree.Expression,
  env: Env,
  typesMap: TypesMap,
): Type {
  switch (ast.type) {
    case 'Identifier':              return synthIdentifier(ast, env, typesMap);
    case 'Literal':                 return synthLiteral(ast, env, typesMap);
    case 'ArrayExpression':         return synthArray(ast, env, typesMap);
    case 'ObjectExpression':        return synthObject(ast, env, typesMap);
    case 'ArrowFunctionExpression': return synthArrowFunction(ast, env, typesMap);
    case 'UnaryExpression':         return synthUnary(ast, env, typesMap);
    case 'LogicalExpression':       return synthLogical(ast, env, typesMap);
    case 'BinaryExpression':        return synthBinary(ast, env, typesMap);
    case 'SequenceExpression':      return synthSequence(ast, env, typesMap);
    case 'MemberExpression':        return synthMember(ast, env, typesMap);
    case 'CallExpression':          return synthCall(ast, env, typesMap);
    case 'ConditionalExpression':   return synthConditional(ast, env, typesMap);
    case 'TemplateLiteral':         return synthTemplateLiteral(ast, env, typesMap);
    case 'JSXIdentifier':           return synthJSXIdentifier(ast, env, typesMap);
    case 'JSXElement':              return synthJSXElement(ast, env, typesMap);
    case 'JSXFragment':             return synthJSXFragment(ast, env, typesMap);
    case 'JSXExpressionContainer':  return synthJSXExpressionContainer(ast, env, typesMap);
    case 'JSXText':                 return synthJSXText(ast, env, typesMap);
    case 'JSXEmptyExpression':      return synthJSXEmptyExpression(ast, env, typesMap);

    default:
      return bug(`unimplemented AST ${ast.type}`);
  }
}

export function synth(
  ast: ESTree.Expression,
  env: Env,
  typesMap: TypesMap,
): Type {
  const type = synthHelper(ast, env, typesMap);
  if (typesMap) {
    if (!type) bug(`expected type for ${JSON.stringify(ast)}`);
    typesMap.set(ast, type);
  }
  return type;
}

function andThen(type: Type, fn: (t: Type, typesMap: TypesMap) => Type, typesMap: TypesMap): Type {
  type = Type.expand(type);

  switch (type.kind) {
    case 'Union':
      return Type.union(...type.types.map(type => fn(type, typesMap)));

    case 'Intersection': {
      // an intersection type describes several interfaces to an object.
      // using an object of intersection type means using one of its interfaces
      // but others may not support the way we're trying to use it.
      // so we expect type errors for some arms of the intersection
      // and we don't want to pollute typesMap when typechecking those arms.
      // we first synth with no typesMap to find out which arms are OK
      //   - if no arms are OK we re-synth the last arm with typesMap
      //   - if some arms are OK we re-synth the first OK arm with typesMap
      // TODO(jaked)
      // this would be a little easier if we updated typesMap functionally
      // then we could just take the one we wanted instead of re-synthing
      // TODO(jaked)
      // maybe we could produce better error messages (like Typescript)
      // by treating some intersections as a single type
      // (e.g. {foo:boolean}&{bar:number}) rather than handling arms separately
      const noTypesMap: TypesMap = new Map();
      const types = type.types.map(type => fn(type, noTypesMap));
      const okIndex = types.findIndex(type => type.kind !== 'Error')
      if (okIndex === -1) {
        const type = types.get(types.size - 1) ?? bug(`expected type`);
        return fn(type, typesMap);
      } else {
        const okType = type.types.get(okIndex) ?? bug(`expected type`);
        fn(okType, typesMap);
        return Type.intersection(...types.filter(type => type.kind !== 'Error'));
      }
    }

    default:
      return fn(type, typesMap);
  }
}

export function synthAndThen(
  ast: ESTree.Expression,
  env: Env,
  typesMap: TypesMap,
  fn: (t: Type, typesMap: TypesMap) => Type
): Type {
  return andThen(synth(ast, env, typesMap), fn, typesMap);
}

function importDecl(
  moduleName: string,
  decl: ESTree.ImportDeclaration,
  moduleEnv: Map<string, Type.ModuleType>,
  env: Env,
  typesMap: TypesMap,
): Env {
  const importedModuleName = Name.rewriteResolve(moduleEnv, moduleName, decl.source.value);
  if (!importedModuleName) {
    const error = Error.withLocation(decl.source, `no module '${decl.source.value}'`, typesMap);
    decl.specifiers.forEach(spec => {
      env = env.set(spec.local.name, error);
    });
  } else {
    const module = moduleEnv.get(importedModuleName) ?? bug(`expected module '${importedModuleName}'`);
    decl.specifiers.forEach(spec => {
      switch (spec.type) {
        case 'ImportNamespaceSpecifier': {
          env = env.set(spec.local.name, module);
        }
        break;

        case 'ImportDefaultSpecifier': {
          const defaultField = module.fields.find(ft => ft._1 === 'default');
          if (defaultField) {
            env = env.set(spec.local.name, defaultField._2);
          } else {
            const error = Error.withLocation(spec.local, `no default export on '${decl.source.value}'`, typesMap);
            env = env.set(spec.local.name, error);
          }
        }
        break;

        case 'ImportSpecifier': {
          const importedField = module.fields.find(ft => ft._1 === spec.imported.name)
          if (importedField) {
            env = env.set(spec.local.name, importedField._2);
          } else {
            const error = Error.withLocation(spec.imported, `no exported member '${spec.imported.name}' on '${decl.source.value}'`, typesMap);
            env = env.set(spec.local.name, error);
          }
        }
        break;
      }
    });
  }
  return env;
}

function synthVariableDecl(
  decl: ESTree.VariableDeclaration,
  env: Env,
  typesMap: TypesMap,
  exportTypes?: { [s: string]: Type },
): Env {
  decl.declarations.forEach(declarator => {
    let type: Type;
    const typeAnnotation = declarator.id.typeAnnotation ?
      Type.ofTSType(declarator.id.typeAnnotation.typeAnnotation, typesMap) :
      undefined;
    if (declarator.init) {
      const initEnv = decl.kind === 'let' ? Immutable.Map({ undefined: Type.undefined }) : env;
      if (typeAnnotation) {
        type = check(declarator.init, initEnv, typeAnnotation, typesMap);
      } else {
        type = synth(declarator.init, initEnv, typesMap);
      }
    } else {
      type = Error.withLocation(declarator.id, `expected initializer`, typesMap);
    }
    let declType =
      type.kind === 'Error' ? type :
      typeAnnotation ? typeAnnotation :
      type;

    if (decl.kind === 'let' && type.kind !== 'Error')
      declType = Type.abstract('lensType', declType);

    if (typesMap) typesMap.set(declarator.id, declType);
    if (exportTypes) exportTypes[declarator.id.name] = declType;
    env = env.set(declarator.id.name, declType);
  });
  return env;
}

function synthAndExportNamedDecl(
  decl: ESTree.ExportNamedDeclaration,
  exportTypes: { [s: string]: Type },
  env: Env,
  typesMap: TypesMap,
): Env {
  return synthVariableDecl(
    decl.declaration,
    env,
    typesMap,
    exportTypes,
  );
}

function exportDefaultDecl(
  decl: ESTree.ExportDefaultDeclaration,
  exportTypes: { [s: string]: Type },
  env: Env,
  typesMap: TypesMap,
) {
  exportTypes['default'] = synth(decl.declaration, env, typesMap);
}

export function synthProgram(
  moduleName: string,
  moduleEnv: Map<string, Type.ModuleType>,
  program: ESTree.Program,
  env: Env,
  exportTypes: { [s: string]: Type },
  typesMap: TypesMap,
): Env {
  program.body.forEach(node => {
    switch (node.type) {
      case 'ExportDefaultDeclaration':
        exportDefaultDecl(node, exportTypes, env, typesMap);
        break;

      case 'ExportNamedDeclaration':
        env = synthAndExportNamedDecl(node, exportTypes, env, typesMap);
        break;

      case 'ImportDeclaration':
        env = importDecl(moduleName, node, moduleEnv, env, typesMap);
        break;

      case 'VariableDeclaration':
        env = synthVariableDecl(node, env, typesMap);
        break;

      case 'ExpressionStatement':
        check(node.expression, env, Type.reactNodeType, typesMap);
        break;
    }
  });
  return env;
}
