import * as Immutable from 'immutable';
import { bug } from '../../util/bug';
import Type from '../Type';
import * as ESTree from '../ESTree';
import { TypeMap } from '../../model';
import { Env } from './env';
import * as Error from './error';
import { check } from './check';
import { narrowType, narrowEnvironment } from './narrow';

function synthIdentifier(
  ast: ESTree.Identifier,
  env: Env,
  typeMap: TypeMap,
): Type {
  const type = env.get(ast.name);
  if (type) return type;
  else if (ast.name === 'undefined') return Type.undefined;
  else return Error.withLocation(ast, `unbound identifier '${ast.name}'`, typeMap);
}

function synthLiteral(
  ast: ESTree.Literal,
  env: Env,
  typeMap: TypeMap,
): Type {
  return Type.singleton(ast.value);
}

function synthArray(
  ast: ESTree.ArrayExpression,
  env: Env,
  typeMap: TypeMap,
): Type {
  const types = ast.elements.map(e => synth(e, env, typeMap));
  const elem = Type.union(...types);
  return Type.array(elem);
}

function synthObject(
  ast: ESTree.ObjectExpression,
  env: Env,
  typeMap: TypeMap,
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
      synth(prop.value, env, typeMap);
      // TODO(jaked) this highlights the error but we also need to skip evaluation
      Error.withLocation(prop.key, `duplicate property name '${name}'`, typeMap);
      return undefined;
    } else {
      seen.add(name);
      return { name, type: synth(prop.value, env, typeMap) };
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
  typeMap: TypeMap,
): Type {
  return synthAndThen(ast.argument, env, typeMap, (type, typeMap) => {
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
    return Error.withLocation(ast, 'incompatible operand to ${ast.operator}', typeMap);
  });
}

function synthLogical(
  ast: ESTree.LogicalExpression,
  env: Env,
  typeMap: TypeMap,
): Type {
  const rightEnv = narrowEnvironment(env, ast.left, ast.operator === '&&', typeMap);
  return synthAndThen(ast.left, env, typeMap, (left, typeMap) => {
    return synthAndThen(ast.right, rightEnv, typeMap, (right, typeMap) => {
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
  typeMap: TypeMap,
): Type {
  // TODO(jaked) handle other operators

  return synthAndThen(ast.left, env, typeMap, (left, typeMap) => {
    return synthAndThen(ast.right, env, typeMap, (right, typeMap) => {

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
      return Error.withLocation(ast, `incompatible operands to ${ast.operator}`, typeMap);
    });
  });
}

function synthSequence(
  ast: ESTree.SequenceExpression,
  env: Env,
  typeMap: TypeMap,
): Type {
  const types = ast.expressions.map(e => synth(e, env, typeMap));
  return types[types.length - 1];
}

function synthMember(
  ast: ESTree.MemberExpression,
  env: Env,
  typeMap: TypeMap,
): Type {
  const fn = (objType: Type, typeMap: TypeMap) => {
    if (objType.kind === 'Error') return objType;

    if (objType.kind === 'Abstract' && (objType.label === 'Code' || objType.label === 'Session')) {
      const param = objType.params.get(0) ?? bug(`expected param`);
      const type = fn(param, typeMap);
      return type.kind === 'Error' ? type : Type.abstract(objType.label, type);
    }

    if (ast.computed)
      return synthAndThen(ast.property, env, typeMap, (prop, typeMap) => {

        switch (objType.kind) {
          case 'Array':
            if (prop.kind === 'Error') return Type.undefined;
            if (prop.kind === 'number' ||
                (prop.kind === 'Singleton' && prop.base.kind === 'number')) {
              return Type.undefinedOr(objType.elem);
            }
            return Error.expectedType(ast, Type.number, prop, typeMap);

          case 'Tuple':
            if (prop.kind === 'Error') return prop;
            if (prop.kind === 'Singleton' && prop.base.kind === 'number') {
              if (prop.value < objType.elems.size)
                return objType.elems.get(prop.value) ?? bug(`expected elem`);
              return Error.noElementAtIndex(ast, prop.value, typeMap);
            }
            return Error.expectedType(ast, Type.number, prop, typeMap);

          case 'Object':
            if (prop.kind === 'Error') return prop;
            if (prop.kind === 'Singleton' && prop.base.kind === 'string') {
              const type = objType.getFieldType(prop.value);
              if (type) return type;
              else return Error.unknownField(ast, prop.value, typeMap);
            }
            return Error.expectedType(ast, Type.string, prop, typeMap);

          default:
            return Error.expectedType(ast, 'Array or Tuple', objType, typeMap);
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
      return Error.unknownField(ast.property, name, typeMap);
    }
  }

  return synthAndThen(ast.object, env, typeMap, fn, /* preserveCell = */ true);
}

function synthCall(
  ast: ESTree.CallExpression,
  env:Env,
  typeMap: TypeMap,
): Type {
  return synthAndThen(ast.callee, env, typeMap, (callee, typeMap) => {
    if (callee.kind !== 'Function')
      return Error.expectedType(ast.callee, 'function', callee, typeMap);

    // TODO(jaked) tolerate extra arguments
    else if (ast.arguments.length > callee.args.size)
      return Error.wrongArgsLength(ast, callee.args.size, ast.arguments.length, typeMap);
    else {
      const types = callee.args.map((expectedType, i) => {
        if (i < ast.arguments.length) {
          const type = check(ast.arguments[i], env, expectedType, typeMap);
          // it's OK for an argument to be Error if the function accepts undefined
          if (type.kind === 'Error' && Type.isSubtype(Type.undefined, expectedType))
            return Type.undefined;
          else
            return type;
        } else if (Type.isSubtype(Type.undefined, expectedType)) {
          // it's OK for an argument to be missing if the function accepts undefined
          return Type.undefined;
        } else
          return Error.wrongArgsLength(ast, callee.args.size, ast.arguments.length, typeMap);
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
  typeMap: TypeMap,
): Env {
  if (env.has(ast.name)) {
    Error.withLocation(ast, `identifier ${ast.name} already bound in pattern`, typeMap);
    return env;
  } else {
    return env.set(ast.name, type);
  }
}

function patTypeEnvObjectPattern(
  ast: ESTree.ObjectPattern,
  t: Type.ObjectType,
  env: Env,
  typeMap: TypeMap,
): Env {
  ast.properties.forEach(prop => {
    const key = prop.key;
    const field = t.fields.find(field => field._1 === key.name)
    if (!field) {
      Error.unknownField(key, key.name, typeMap);
    } else {
      env = patTypeEnv(prop.value, field._2, env, typeMap);
    }
  });
  return env;
}

function patTypeEnv(
  ast: ESTree.Pattern,
  t: Type,
  env: Env,
  typeMap: TypeMap,
): Env {
  if (ast.type === 'ObjectPattern' && t.kind === 'Object')
    return patTypeEnvObjectPattern(ast, t, env, typeMap);
  else if (ast.type === 'Identifier')
    return patTypeEnvIdentifier(ast, t, env, typeMap);
  else {
    Error.withLocation(ast, `incompatible pattern for type ${Type.toString(t)}`, typeMap);
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
  typeMap: TypeMap,
): Type {
  let patEnv: Env = Immutable.Map();
  const paramTypes = ast.params.map(param => {
    if (!param.typeAnnotation) {
      const t = Error.withLocation(param, `function parameter must have a type`, typeMap);
      patEnv = patTypeEnv(param, genPatType(param, t), patEnv, typeMap);
      return genPatType(param, Type.unknown);
    }
    const t = Type.ofTSType(param.typeAnnotation.typeAnnotation, typeMap);
    patEnv = patTypeEnv(param, t, patEnv, typeMap);
    return t;
  });
  env = env.concat(patEnv);
  const type = synth(ast.body, env, typeMap);
  // TODO(jaked) doesn't handle parameters of union type
  return Type.functionType(paramTypes, type);
}

function synthBlockStatement(
  ast: ESTree.BlockStatement,
  env: Env,
  typeMap: TypeMap,
): Type {
  const types = ast.body.map(stmt => {
    switch (stmt.type) {
      case 'ExpressionStatement':
        return synth(stmt.expression, env, typeMap);
      default:
        bug(`unimplemented ${stmt.type}`);
    }
  });
  if (types.length === 0)
    return Type.undefined;
  else
    return types[types.length - 1];
}

function synthConditional(
  ast: ESTree.ConditionalExpression,
  env: Env,
  typeMap: TypeMap,
): Type {
  const envConsequent = narrowEnvironment(env, ast.test, true, typeMap);
  const envAlternate = narrowEnvironment(env, ast.test, false, typeMap);
  const consequent = synth(ast.consequent, envConsequent, typeMap);
  const alternate = synth(ast.alternate, envAlternate, typeMap);

  return synthAndThen(ast.test, env, typeMap, (test, typeMap) => {
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
  typeMap: TypeMap,
): Type {
  // TODO(jaked) handle interpolations
  return Type.string;
}

function synthJSXIdentifier(
  ast: ESTree.JSXIdentifier,
  env: Env,
  typeMap: TypeMap,
): Type {
  const type = env.get(ast.name);
  if (type) return type;
  else return Error.withLocation(ast, `unbound identifier '${ast.name}'`, typeMap);
}

function synthJSXElement(
  ast: ESTree.JSXElement,
  env: Env,
  typeMap: TypeMap,
): Type {
  return synthAndThen(ast.openingElement.name, env, typeMap, (type, typeMap) => {
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
      return { props: Type.object({}), ret: Error.expectedType(ast.openingElement.name, 'component type', type, typeMap) };
    })();

    const attrTypes = ast.openingElement.attributes.map(attr => {
      const expectedType = props.getFieldType(attr.name.name);
      if (expectedType) {
        if (attr.value) {
          const type = check(attr.value, env, expectedType, typeMap);
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
            return Error.expectedType(attr.name, expectedType, actual, typeMap);
        }
      } else {
        // TODO(jaked) putting the error here gets us the right highlighting
        // but we also need to skip evaluation, would be better to put it on attr
        Error.extraField(attr.name, attr.name.name, typeMap);
        if (attr.value) {
          // TODO(jaked) an error in an extra attribute should not fail whole tag
          return synth(attr.value, env, typeMap);
        } else {
          return Type.singleton(true);
        }
      }
    });

    ast.children.forEach(child =>
      // TODO(jaked) see comment about recursive types on Type.reactNodeType
      check(child, env, Type.union(Type.reactNodeType, Type.array(Type.reactNodeType)), typeMap)
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
        missingField = Error.missingField(ast.openingElement.name, name, typeMap);
    });
    if (missingField) return missingField;

    return attrTypes.find(type => type.kind === 'Error') ?? ret;
  });
}

function synthJSXFragment(
  ast: ESTree.JSXFragment,
  env: Env,
  typeMap: TypeMap,
): Type {
  ast.children.forEach(child =>
    // TODO(jaked) see comment about recursive types on Type.reactNodeType
    check(child, env, Type.union(Type.reactNodeType, Type.array(Type.reactNodeType)), typeMap)
  );
  return Type.reactNodeType;
}

function synthJSXExpressionContainer(
  ast: ESTree.JSXExpressionContainer,
  env: Env,
  typeMap: TypeMap,
): Type {
  return synth(ast.expression, env, typeMap);
}

function synthJSXText(
  ast: ESTree.JSXText,
  env: Env,
  typeMap: TypeMap,
): Type {
  return Type.string;
}

function synthJSXEmptyExpression(
  ast: ESTree.JSXEmptyExpression,
  env: Env,
  typeMap: TypeMap,
): Type {
  return Type.undefined;
}

function synthAssignment(
  ast: ESTree.AssignmentExpression,
  env: Env,
  typeMap: TypeMap,
): Type {
  return synthAndThen(ast.left, env, typeMap, (left, typeMap) => {
    if (left.kind === 'Abstract' && (left.label === 'Code' || left.label === 'Session')) {
      const param = left.params.get(0) ?? bug(`expected param`);
      return check(ast.right, env, param, typeMap);
    } else {
      return Error.expectedType(ast.left, 'Code<T> or Session<T>', left, typeMap);
    }
  }, /* preserveCell */ true);
}

function synthTSAs(
  ast: ESTree.TSAsExpression,
  env: Env,
  typeMap: TypeMap,
): Type {
  const type = Type.ofTSType(ast.typeAnnotation, typeMap);
  const checked = check(ast.expression, env, type, typeMap);
  return checked.kind === 'Error' ? checked : type;
}

function synthHelper(
  ast: ESTree.Node,
  env: Env,
  typeMap: TypeMap,
): Type {
  switch (ast.type) {
    case 'Identifier':              return synthIdentifier(ast, env, typeMap);
    case 'Literal':                 return synthLiteral(ast, env, typeMap);
    case 'ArrayExpression':         return synthArray(ast, env, typeMap);
    case 'ObjectExpression':        return synthObject(ast, env, typeMap);
    case 'ArrowFunctionExpression': return synthArrowFunction(ast, env, typeMap);
    case 'BlockStatement':          return synthBlockStatement(ast, env, typeMap);
    case 'UnaryExpression':         return synthUnary(ast, env, typeMap);
    case 'LogicalExpression':       return synthLogical(ast, env, typeMap);
    case 'BinaryExpression':        return synthBinary(ast, env, typeMap);
    case 'SequenceExpression':      return synthSequence(ast, env, typeMap);
    case 'MemberExpression':        return synthMember(ast, env, typeMap);
    case 'CallExpression':          return synthCall(ast, env, typeMap);
    case 'ConditionalExpression':   return synthConditional(ast, env, typeMap);
    case 'TemplateLiteral':         return synthTemplateLiteral(ast, env, typeMap);
    case 'JSXIdentifier':           return synthJSXIdentifier(ast, env, typeMap);
    case 'JSXElement':              return synthJSXElement(ast, env, typeMap);
    case 'JSXFragment':             return synthJSXFragment(ast, env, typeMap);
    case 'JSXExpressionContainer':  return synthJSXExpressionContainer(ast, env, typeMap);
    case 'JSXText':                 return synthJSXText(ast, env, typeMap);
    case 'JSXEmptyExpression':      return synthJSXEmptyExpression(ast, env, typeMap);
    case 'AssignmentExpression':    return synthAssignment(ast, env, typeMap);
    case 'TSAsExpression':          return synthTSAs(ast, env, typeMap);

    default:
      return bug(`unimplemented AST ${ast.type}`);
  }
}

export function synth(
  ast: ESTree.Node,
  env: Env,
  typeMap: TypeMap,
): Type {
  const type = synthHelper(ast, env, typeMap);
  typeMap.set(ast, type);
  return type;
}

function andThen(
  type: Type,
  fn: (t: Type, typeMap: TypeMap) => Type,
  typeMap: TypeMap,
  preserveCell: boolean = false
): Type {
  type = Type.expand(type);

  // TODO(jaked) this is pretty ad-hoc
  if (!preserveCell && type.kind === 'Abstract' && (type.label === 'Code' || type.label === 'Session')) {
    const param = type.params.get(0) ?? bug(`expected param`);
    type = param;
  }

  switch (type.kind) {
    case 'Union':
      return Type.union(...type.types.map(type => fn(type, typeMap)));

    case 'Intersection': {
      // an intersection type describes several interfaces to an object.
      // using an object of intersection type means using one of its interfaces
      // but others may not support the way we're trying to use it.
      // so we expect type errors for some arms of the intersection
      // and we don't want to pollute typeMap when typechecking those arms.
      // we first synth with no typeMap to find out which arms are OK
      //   - if no arms are OK we re-synth the last arm with typeMap
      //   - if some arms are OK we re-synth the first OK arm with typeMap
      // TODO(jaked)
      // this would be a little easier if we updated typeMap functionally
      // then we could just take the one we wanted instead of re-synthing
      // TODO(jaked)
      // maybe we could produce better error messages (like Typescript)
      // by treating some intersections as a single type
      // (e.g. {foo:boolean}&{bar:number}) rather than handling arms separately
      const noTypeMap: TypeMap = new Map();
      const types = type.types.map(type => fn(type, noTypeMap));
      const okIndex = types.findIndex(type => type.kind !== 'Error')
      if (okIndex === -1) {
        const type = types.get(types.size - 1) ?? bug(`expected type`);
        return fn(type, typeMap);
      } else {
        const okType = type.types.get(okIndex) ?? bug(`expected type`);
        fn(okType, typeMap);
        return Type.intersection(...types.filter(type => type.kind !== 'Error'));
      }
    }

    default:
      return fn(type, typeMap);
  }
}

export function synthAndThen(
  ast: ESTree.Expression,
  env: Env,
  typeMap: TypeMap,
  fn: (t: Type, typeMap: TypeMap) => Type,
  preserveCell: boolean = false
): Type {
  return andThen(synth(ast, env, typeMap), fn, typeMap, preserveCell);
}

function importDecl(
  decl: ESTree.ImportDeclaration,
  moduleEnv: Map<string, Type.ModuleType>,
  env: Env,
  typeMap: TypeMap,
): Env {
  const module = moduleEnv.get(decl.source.value);
  if (!module) {
    const error = Error.withLocation(decl.source, `no module '${decl.source.value}'`, typeMap);
    decl.specifiers.forEach(spec => {
      env = env.set(spec.local.name, error);
    });
  } else {
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
            const error = Error.withLocation(spec.local, `no default export on '${decl.source.value}'`, typeMap);
            env = env.set(spec.local.name, error);
          }
        }
        break;

        case 'ImportSpecifier': {
          const importedField = module.fields.find(ft => ft._1 === spec.imported.name)
          if (importedField) {
            env = env.set(spec.local.name, importedField._2);
          } else {
            const error = Error.withLocation(spec.imported, `no exported member '${spec.imported.name}' on '${decl.source.value}'`, typeMap);
            typeMap.set(spec.local, error);
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
  typeMap: TypeMap,
): Env {
  decl.declarations.forEach(declarator => {
    let declType: Type;

    if (!declarator.init) {
      declType = Error.withLocation(declarator.id, `expected initializer`, typeMap);

    } else if (decl.kind === 'const') {
      if (declarator.id.typeAnnotation) {
        const ann = Type.ofTSType(declarator.id.typeAnnotation.typeAnnotation, typeMap);
        if (ann.kind === 'Error') {
          declType = synth(declarator.init, env, typeMap);
        } else {
          const type = check(declarator.init, env, ann, typeMap);
          declType = type.kind === 'Error' ? type : ann;
        }
      } else {
        declType = synth(declarator.init, env, typeMap);
      }

    } else if (decl.kind === 'let') {
      // TODO(jaked) could relax this and allow referring to static variables
      const initEnv = Immutable.Map({ undefined: Type.undefined });
      if (!declarator.id.typeAnnotation) {
        synth(declarator.init, initEnv, typeMap);
        declType = Error.withLocation(declarator.id, `expected type annotation`, typeMap);
      } else {
        const ann = Type.ofTSType(declarator.id.typeAnnotation.typeAnnotation, typeMap);
        if (ann.kind === 'Error') {
          synth(declarator.init, initEnv, typeMap);
          declType = ann;
        } if (ann.kind !== 'Abstract' || (ann.label !== 'Code' && ann.label !== 'Session')) {
          synth(declarator.init, initEnv, typeMap);
          declType = Error.withLocation(declarator.id.typeAnnotation, `expected Code<T> or Session<T>`, typeMap);
        } else {
          const param = ann.params.get(0) ?? bug(`expected param`);
          const type = check(declarator.init, initEnv, param, typeMap);
          declType = type.kind === 'Error' ? type : ann;
        }
      }
    }

    else bug(`unexpected ${decl.kind}`);

    typeMap.set(declarator.id, declType);
    env = env.set(declarator.id.name, declType);
  });
  return env;
}

export function synthProgram(
  moduleEnv: Map<string, Type.ModuleType>,
  program: ESTree.Program,
  env: Env,
  typeMap: TypeMap,
): Env {
  program.body.forEach(node => {
    switch (node.type) {
      case 'ExportDefaultDeclaration':
        env = env.set('default', synth(node.declaration, env, typeMap));
        break;

      case 'ExportNamedDeclaration':
        env = synthVariableDecl(node.declaration, env, typeMap);
        break;

      case 'ImportDeclaration':
        env = importDecl(node, moduleEnv, env, typeMap);
        break;

      case 'VariableDeclaration':
        env = synthVariableDecl(node, env, typeMap);
        break;

      case 'ExpressionStatement':
        check(node.expression, env, Type.reactNodeType, typeMap);
        break;
    }
  });
  return env;
}
