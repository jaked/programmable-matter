import * as Immutable from 'immutable';
import { bug } from '../../util/bug';
import Type from '../Type';
import * as ESTree from '../ESTree';
import { Interface, InterfaceMap } from '../../model';
import { Env } from './env';
import * as Error from './error';
import { check } from './check';
import { narrowType, narrowEnvironment } from './narrow';

function synthIdentifier(
  ast: ESTree.Identifier,
  env: Env,
  interfaceMap: InterfaceMap,
): Interface {
  const intf = env.get(ast.name);
  if (intf) return intf;
  else if (ast.name === 'undefined') return { type: Type.undefined };
  else return Error.withLocation(ast, `unbound identifier '${ast.name}'`, interfaceMap);
}

function synthLiteral(
  ast: ESTree.Literal,
  env: Env,
  interfaceMap: InterfaceMap,
): Interface {
  return { type: Type.singleton(ast.value) };
}

function synthArray(
  ast: ESTree.ArrayExpression,
  env: Env,
  interfaceMap: InterfaceMap,
): Interface {
  const intfs = ast.elements.map(e => synth(e, env, interfaceMap));
  const elem = Type.union(...intfs.map(intf => intf.type));
  return { type: Type.array(elem) };
}

function synthObject(
  ast: ESTree.ObjectExpression,
  env: Env,
  interfaceMap: InterfaceMap,
): Interface {
  const seen = new Set();
  const fieldIntfs = ast.properties.map(prop => {
    let name: string;
    switch (prop.key.type) {
      case 'Identifier': name = prop.key.name; break;
      case 'Literal': name = prop.key.value; break;
      default: bug('expected Identifier or Literal property name');
    }
    if (seen.has(name)) {
      synth(prop.value, env, interfaceMap);
      // TODO(jaked) this highlights the error but we also need to skip evaluation
      Error.withLocation(prop.key, `duplicate property name '${name}'`, interfaceMap);
      return undefined;
    } else {
      seen.add(name);
      return { name, intf: synth(prop.value, env, interfaceMap) };
    }
  });

  const fieldTypesObj = fieldIntfs.reduce<{ [n: string]: Type }>(
    (obj, fieldInterface) => {
      if (!fieldInterface) return obj;
      const { name, intf } = fieldInterface;
      return { ...obj, [name]: intf.type };
    },
    {}
  );
  return { type: Type.object(fieldTypesObj) };
}

const typeofType =
  Type.enumerate('undefined', 'boolean', 'number', 'string', 'function', 'object', 'error')

function synthUnary(
  ast: ESTree.UnaryExpression,
  env: Env,
  interfaceMap: InterfaceMap,
): Interface {
  return synthAndThen(ast.argument, env, interfaceMap, (intf, interfaceMap) => {
    if (intf.type.kind === 'Error') switch (ast.operator) {
      // TODO(jaked) does this make sense?
      case '+':      return { type: Type.singleton(0) };
      case '-':      return { type: Type.singleton(0) };
      case '!':      return { type: Type.singleton(true) };
      case 'typeof': return { type: Type.singleton('error') };
    }
    if (intf.type.kind === 'Singleton') {
      const value = intf.type.value;
      switch (ast.operator) {
        case '!':      return { type: Type.singleton(!value) };
        case 'typeof': return { type: Type.singleton(typeof value) };
        default:
          if (intf.type.base.kind === 'number') switch (ast.operator) {
            case '+': return { type: Type.singleton(value) };
            case '-': return { type: Type.singleton(-value) };
          }
      }
    }
    switch (ast.operator) {
      case '!':      return { type: Type.boolean };
      case 'typeof': return { type: typeofType };
      default:
        if (intf.type.kind === 'number') switch (ast.operator) {
          case '+': return { type: Type.number };
          case '-': return { type: Type.number };
        }
    }
    return Error.withLocation(ast, 'incompatible operand to ${ast.operator}', interfaceMap);
  });
}

function synthLogical(
  ast: ESTree.LogicalExpression,
  env: Env,
  interfaceMap: InterfaceMap,
): Interface {
  const rightEnv = narrowEnvironment(env, ast.left, ast.operator === '&&', interfaceMap);
  return synthAndThen(ast.left, env, interfaceMap, (left, interfaceMap) => {
    return synthAndThen(ast.right, rightEnv, interfaceMap, (right, interfaceMap) => {
      switch (ast.operator) {
        case '&&': {
          switch (left.type.kind) {
            case 'Error':     return left;
            case 'Singleton': return left.type.value ? right : left;
            default:          return { type: Type.union(narrowType(left.type, Type.falsy), right.type) };
          }
        }

        case '||': {
          switch (left.type.kind) {
            case 'Error':     return right;
            case 'Singleton': return left.type.value ? left : right;

            // TODO(jaked) Type.union(Type.intersection(left.type, Type.notFalsy), right.type) ?
            default:          return { type: Type.union(left.type, right.type) };
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
  interfaceMap: InterfaceMap,
): Interface {
  // TODO(jaked) handle other operators

  return synthAndThen(ast.left, env, interfaceMap, (left, interfaceMap) => {
    return synthAndThen(ast.right, env, interfaceMap, (right, interfaceMap) => {

      if (left.type.kind === 'Error') switch (ast.operator) {
        case '===': return { type: Type.singleton(false) };
        case '!==': return { type: Type.singleton(true) };
        default:    return right;
      }
      if (right.type.kind === 'Error') switch (ast.operator) {
        case '===': return { type: Type.singleton(false) };
        case '!==': return { type: Type.singleton(true) };
        default:    return left;
      }
      if (left.type.kind === 'Singleton' && right.type.kind === 'Singleton') {
        const lvalue = left.type.value;
        const rvalue = right.type.value;
        switch (ast.operator) {
          case '===': return { type: Type.singleton(lvalue === right.type.value) };
          case '!==': return { type: Type.singleton(lvalue !== right.type.value) };
          default:
            if (left.type.base.kind === 'number' && right.type.base.kind === 'number') switch (ast.operator) {
              case '-': return { type: Type.singleton(lvalue - rvalue) };
              case '*': return { type: Type.singleton(lvalue * rvalue) };
              case '+': return { type: Type.singleton(lvalue + rvalue) };
              case '/': return { type: Type.singleton(lvalue / rvalue) };
              case '%': return { type: Type.singleton(lvalue % rvalue) };
            }
            if (left.type.base.kind === 'string' && right.type.base.kind === 'string') switch (ast.operator) {
              case '+': return { type: Type.singleton(lvalue + rvalue) };
            }
        }
      }
      if ((left.type.kind === 'number' || (left.type.kind === 'Singleton' && left.type.base.kind === 'number')) &&
          (right.type.kind === 'number' || (right.type.kind === 'Singleton' && right.type.base.kind === 'number'))) {
        switch (ast.operator) {
          case '+':
          case '-':
          case '*':
          case '/':
          case '%':
            return { type: Type.number };
        }
      }
      if ((left.type.kind === 'string' || (left.type.kind === 'Singleton' && left.type.base.kind === 'string')) &&
          (right.type.kind === 'string' || (right.type.kind === 'Singleton' && right.type.base.kind === 'string'))) {
        switch (ast.operator) {
          case '+':
            return { type: Type.string };
        }
      }
      switch (ast.operator) {
        case '===':
        case '!==':
          return { type: Type.boolean };
      }
      return Error.withLocation(ast, `incompatible operands to ${ast.operator}`, interfaceMap);
    });
  });
}

function synthSequence(
  ast: ESTree.SequenceExpression,
  env: Env,
  interfaceMap: InterfaceMap,
): Interface {
  const intfs = ast.expressions.map(e => synth(e, env, interfaceMap));
  return intfs[intfs.length - 1];
}

function synthMember(
  ast: ESTree.MemberExpression,
  env: Env,
  interfaceMap: InterfaceMap,
): Interface {
  const fn = (object: Interface, interfaceMap: InterfaceMap) => {
    if (object.type.kind === 'Error') return object;

    if (object.type.kind === 'Abstract' && (object.type.label === 'Code' || object.type.label === 'Session')) {
      const param = object.type.params.get(0) ?? bug(`expected param`);
      const intf = fn({ type: param }, interfaceMap);
      return intf.type.kind === 'Error' ? intf : { type: Type.abstract(object.type.label, intf.type) };
    }

    if (ast.computed)
      return synthAndThen(ast.property, env, interfaceMap, (prop, interfaceMap) => {

        switch (object.type.kind) {
          case 'Array':
            if (prop.type.kind === 'Error') return { type: Type.undefined };
            if (prop.type.kind === 'number' ||
                (prop.type.kind === 'Singleton' && prop.type.base.kind === 'number')) {
              return { type: Type.undefinedOr(object.type.elem) };
            }
            return Error.expectedType(ast, Type.number, prop.type, interfaceMap);

          case 'Tuple':
            if (prop.type.kind === 'Error') return prop;
            if (prop.type.kind === 'Singleton' && prop.type.base.kind === 'number') {
              if (prop.type.value < object.type.elems.size)
                return { type: object.type.elems.get(prop.type.value) ?? bug(`expected elem`) };
              return Error.noElementAtIndex(ast, prop.type.value, interfaceMap);
            }
            return Error.expectedType(ast, Type.number, prop.type, interfaceMap);

          case 'Object':
            if (prop.type.kind === 'Error') return prop;
            if (prop.type.kind === 'Singleton' && prop.type.base.kind === 'string') {
              const type = object.type.getFieldType(prop.type.value);
              if (type) return { type };
              else return Error.unknownField(ast, prop.type.value, interfaceMap);
            }
            return Error.expectedType(ast, Type.string, prop.type, interfaceMap);

          default:
            return Error.expectedType(ast, 'Array or Tuple', object.type, interfaceMap);
        }
      });

    else {
      if (ast.property.type !== 'Identifier')
        bug(`expected identifier on non-computed property`);

      const name = ast.property.name;
      switch (object.type.kind) {
        case 'string':
          switch (name) {
            case 'startsWith':
              return { type: Type.functionType([Type.string], Type.boolean) };
          }
          break;

        case 'number':
          switch (name) {
            case 'toString':
              return { type: Type.functionType([], Type.string) };
          }
          break;

        case 'Array':
          switch (name) {
            case 'size': return { type: Type.number };

            case 'some':
            case 'every':
              return { type: Type.functionType(
                [ Type.functionType([ object.type.elem, Type.number, object.type ], Type.boolean) ],
                Type.boolean,
              ) };

            case 'filter':
              return { type: Type.functionType(
                [ Type.functionType([ object.type.elem, Type.number, object.type ], Type.boolean) ],
                object.type,
              ) };

            case 'forEach':
              return { type: Type.functionType(
                [ Type.functionType([ object.type.elem, Type.number, object.type ], Type.undefined) ],
                Type.undefined,
              ) };

            case 'map':
              return { type: Type.functionType(
                [ Type.functionType([ object.type.elem, Type.number, object.type ], Type.reactNodeType) ], // TODO(jaked) temporary
                Type.array(Type.reactNodeType),
              ) };
          }
          break;

        case 'Map':
          switch (name) {
            case 'size': return { type: Type.number };

            case 'set':
              return { type: Type.functionType([ object.type.key, object.type.value ], object.type) };

            case 'delete':
              return { type: Type.functionType([ object.type.key ], object.type,) };

            case 'clear':
              return { type: Type.functionType([], object.type) };

            case 'filter':
              return { type: Type.functionType(
                [ Type.functionType([ object.type.value, object.type.key, object.type ], Type.boolean) ],
                object.type,
              ) };

            case 'toList':
              return { type: Type.functionType([], Type.array(object.type.value)) };

            case 'update':
              return { type: Type.functionType(
                [ object.type.key, Type.functionType([ object.type.value ], object.type.value) ],
                object.type
              ) };

            case 'get':
              return { type: Type.functionType(
                [ object.type.key ],
                Type.undefinedOr(object.type.value),
              ) };
          }
          break;

        case 'Object': {
          const type = object.type.getFieldType(name);
          if (type) return { type };
          break;
        }

        case 'Module': {
          const type = object.type.getFieldType(name);
          if (type) return { type };
          break;
        }
      }
      return Error.unknownField(ast.property, name, interfaceMap);
    }
  }

  return synthAndThen(ast.object, env, interfaceMap, fn, /* preserveCell = */ true);
}

function synthCall(
  ast: ESTree.CallExpression,
  env:Env,
  interfaceMap: InterfaceMap,
): Interface {
  return synthAndThen(ast.callee, env, interfaceMap, (callee, interfaceMap) => {
    if (callee.type.kind !== 'Function')
      return Error.expectedType(ast.callee, 'function', callee.type, interfaceMap);

    // TODO(jaked) tolerate extra arguments
    else if (ast.arguments.length > callee.type.args.size)
      return Error.wrongArgsLength(ast, callee.type.args.size, ast.arguments.length, interfaceMap);
    else {
      const args = callee.type.args;
      const intfs = args.map((expectedType, i) => {
        if (i < ast.arguments.length) {
          const intf = check(ast.arguments[i], env, expectedType, interfaceMap);
          // it's OK for an argument to be Error if the function accepts undefined
          if (intf.type.kind === 'Error' && Type.isSubtype(Type.undefined, expectedType))
            return { type: Type.undefined };
          else
            return intf;
        } else if (Type.isSubtype(Type.undefined, expectedType)) {
          // it's OK for an argument to be missing if the function accepts undefined
          return { type: Type.undefined };
        } else
          return Error.wrongArgsLength(ast, args.size, ast.arguments.length, interfaceMap);
      });
      // if there aren't enough arguments or a required argument is Error then the call is Error
      return intfs.find(intf => intf.type.kind === 'Error') ?? { type: callee.type.ret };
    }
  });
}

function patTypeEnvIdentifier(
  ast: ESTree.Identifier,
  type: Type,
  env: Env,
  interfaceMap: InterfaceMap,
): Env {
  if (env.has(ast.name)) {
    Error.withLocation(ast, `identifier ${ast.name} already bound in pattern`, interfaceMap);
    return env;
  } else {
    return env.set(ast.name, { type });
  }
}

function patTypeEnvObjectPattern(
  ast: ESTree.ObjectPattern,
  t: Type.ObjectType,
  env: Env,
  interfaceMap: InterfaceMap,
): Env {
  ast.properties.forEach(prop => {
    const key = prop.key;
    const field = t.fields.find(field => field._1 === key.name)
    if (!field) {
      Error.unknownField(key, key.name, interfaceMap);
    } else {
      env = patTypeEnv(prop.value, field._2, env, interfaceMap);
    }
  });
  return env;
}

// given a pattern and a type
// destructure the pattern and type together
// to produce an environment mapping leaf identifiers to types
function patTypeEnv(
  ast: ESTree.Pattern,
  t: Type,
  env: Env,
  interfaceMap: InterfaceMap,
): Env {
  if (ast.type === 'ObjectPattern' && t.kind === 'Object')
    return patTypeEnvObjectPattern(ast, t, env, interfaceMap);
  else if (ast.type === 'Identifier')
    return patTypeEnvIdentifier(ast, t, env, interfaceMap);
  else {
    Error.withLocation(ast, `incompatible pattern for type ${Type.toString(t)}`, interfaceMap);
    return env;
  }
}

// given a pattern and a type
// generate a type satisfying the pattern
// where pattern identifiers have the given type
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
  interfaceMap: InterfaceMap,
): Interface {
  let patEnv: Env = Immutable.Map();
  const params = ast.params.map(param => {
    if (!param.typeAnnotation) {
      const t = Error.withLocation(param, `function parameter must have a type`, interfaceMap).type;
      patEnv = patTypeEnv(param, genPatType(param, t), patEnv, interfaceMap);
      return genPatType(param, Type.unknown);
    }
    const t = Type.ofTSType(param.typeAnnotation.typeAnnotation, interfaceMap);
    patEnv = patTypeEnv(param, t, patEnv, interfaceMap);
    return t;
  });
  env = env.concat(patEnv);
  const body = synth(ast.body, env, interfaceMap);
  // TODO(jaked) doesn't handle parameters of union type
  return { type: Type.functionType(params, body.type) };
}

function synthBlockStatement(
  ast: ESTree.BlockStatement,
  env: Env,
  interfaceMap: InterfaceMap,
): Interface {
  const intfs = ast.body.map(stmt => {
    switch (stmt.type) {
      case 'ExpressionStatement':
        return synth(stmt.expression, env, interfaceMap);
      default:
        bug(`unimplemented ${stmt.type}`);
    }
  });
  if (intfs.length === 0)
    return { type: Type.undefined };
  else
    return intfs[intfs.length - 1];
}

function synthConditional(
  ast: ESTree.ConditionalExpression,
  env: Env,
  interfaceMap: InterfaceMap,
): Interface {
  const envConsequent = narrowEnvironment(env, ast.test, true, interfaceMap);
  const envAlternate = narrowEnvironment(env, ast.test, false, interfaceMap);
  const consequent = synth(ast.consequent, envConsequent, interfaceMap);
  const alternate = synth(ast.alternate, envAlternate, interfaceMap);

  return synthAndThen(ast.test, env, interfaceMap, (test, interfaceMap) => {
    if (Type.isTruthy(test.type))
      return consequent;
    else if (Type.isFalsy(test.type))
      return alternate;
    else
      return { type: Type.union(consequent.type, alternate.type) };
  });
}

function synthTemplateLiteral(
  ast: ESTree.TemplateLiteral,
  env: Env,
  interfaceMap: InterfaceMap,
): Interface {
  // TODO(jaked) handle interpolations
  return { type: Type.string };
}

function synthJSXIdentifier(
  ast: ESTree.JSXIdentifier,
  env: Env,
  interfaceMap: InterfaceMap,
): Interface {
  const intf = env.get(ast.name);
  if (intf) return intf;
  else return Error.withLocation(ast, `unbound identifier '${ast.name}'`, interfaceMap);
}

function synthJSXElement(
  ast: ESTree.JSXElement,
  env: Env,
  interfaceMap: InterfaceMap,
): Interface {
  return synthAndThen(ast.openingElement.name, env, interfaceMap, (element, interfaceMap) => {
    const { props, ret } = (() => {
      switch (element.type.kind) {
        case 'Error':
          return { props: Type.object({}), ret: element.type }

        case 'Function':
          if (element.type.args.size === 0) {
            return { props: Type.object({}), ret: element.type.ret };

          } else if (element.type.args.size === 1) {
            const argType = element.type.args.get(0) ?? bug();
            if (argType.kind === 'Object') {
              const childrenField = argType.fields.find(field => field._1 === 'children');
              if (!childrenField || Type.isSubtype(Type.array(Type.reactNodeType), childrenField._2))
                return { props: argType, ret: element.type.ret };
            }
          }
          // TODO(jaked)
          // ok for func to have extra args as long as they accept undefined
          break;
      }
      // TODO(jaked) it would be better to mark the whole JSXElement as having an error
      // but for now this get us the right error highlighting in Editor
      return {
        props: Type.object({}),
        ret: Error.expectedType(ast.openingElement.name, 'component type', element.type, interfaceMap).type
      };
    })();

    const attrIntfs = ast.openingElement.attributes.map(attr => {
      const expectedType = props.getFieldType(attr.name.name);
      if (expectedType) {
        if (attr.value) {
          const intf = check(attr.value, env, expectedType, interfaceMap);
          // it's OK for an argument to be Error if the function accepts undefined
          if (intf.type.kind === 'Error' && Type.isSubtype(Type.undefined, expectedType))
            return { type: Type.undefined };
          else
            return intf;
        } else {
          const actual = Type.singleton(true);
          if (Type.isSubtype(actual, expectedType))
            return { type: actual };
          else
            return Error.expectedType(attr.name, expectedType, actual, interfaceMap);
        }
      } else {
        // TODO(jaked) putting the error here gets us the right highlighting
        // but we also need to skip evaluation, would be better to put it on attr
        Error.extraField(attr.name, attr.name.name, interfaceMap);
        if (attr.value) {
          // TODO(jaked) an error in an extra attribute should not fail whole tag
          return synth(attr.value, env, interfaceMap);
        } else {
          return { type: Type.singleton(true) };
        }
      }
    });

    ast.children.forEach(child =>
      // TODO(jaked) see comment about recursive types on Type.reactNodeType
      check(child, env, Type.union(Type.reactNodeType, Type.array(Type.reactNodeType)), interfaceMap)
    );

    const attrNames =
      new Set(ast.openingElement.attributes.map(({ name }) => name.name ));
    let missingField: undefined | Interface = undefined;
    props.fields.forEach(({ _1: name, _2: type }) => {
      if (name !== 'children' &&
          !attrNames.has(name) &&
          // it's OK for an argument to be missing if the function accepts undefined
          !Type.isSubtype(Type.undefined, type))
        // TODO(jaked) it would be better to mark the whole JSXElement as having an error
        // but for now this get us the right error highlighting in Editor
        missingField = Error.missingField(ast.openingElement.name, name, interfaceMap);
    });
    if (missingField) return missingField;

    return attrIntfs.find(intf => intf.type.kind === 'Error') ?? { type: ret };
  });
}

function synthJSXFragment(
  ast: ESTree.JSXFragment,
  env: Env,
  interfaceMap: InterfaceMap,
): Interface {
  ast.children.forEach(child =>
    // TODO(jaked) see comment about recursive types on Type.reactNodeType
    check(child, env, Type.union(Type.reactNodeType, Type.array(Type.reactNodeType)), interfaceMap)
  );
  return { type: Type.reactNodeType };
}

function synthJSXExpressionContainer(
  ast: ESTree.JSXExpressionContainer,
  env: Env,
  interfaceMap: InterfaceMap,
): Interface {
  return synth(ast.expression, env, interfaceMap);
}

function synthJSXText(
  ast: ESTree.JSXText,
  env: Env,
  interfaceMap: InterfaceMap,
): Interface {
  return { type: Type.string };
}

function synthJSXEmptyExpression(
  ast: ESTree.JSXEmptyExpression,
  env: Env,
  interfaceMap: InterfaceMap,
): Interface {
  return { type: Type.undefined };
}

function synthAssignment(
  ast: ESTree.AssignmentExpression,
  env: Env,
  interfaceMap: InterfaceMap,
): Interface {
  return synthAndThen(ast.left, env, interfaceMap, (left, interfaceMap) => {
    if (left.type.kind === 'Abstract' && (left.type.label === 'Code' || left.type.label === 'Session')) {
      const param = left.type.params.get(0) ?? bug(`expected param`);
      return check(ast.right, env, param, interfaceMap);
    } else {
      return Error.expectedType(ast.left, 'Code<T> or Session<T>', left.type, interfaceMap);
    }
  }, /* preserveCell */ true);
}

function synthTSAs(
  ast: ESTree.TSAsExpression,
  env: Env,
  interfaceMap: InterfaceMap,
): Interface {
  const type = Type.ofTSType(ast.typeAnnotation, interfaceMap);
  const checked = check(ast.expression, env, type, interfaceMap);
  return checked.type.kind === 'Error' ? checked : { type };
}

function synthHelper(
  ast: ESTree.Node,
  env: Env,
  interfaceMap: InterfaceMap,
): Interface {
  switch (ast.type) {
    case 'Identifier':              return synthIdentifier(ast, env, interfaceMap);
    case 'Literal':                 return synthLiteral(ast, env, interfaceMap);
    case 'ArrayExpression':         return synthArray(ast, env, interfaceMap);
    case 'ObjectExpression':        return synthObject(ast, env, interfaceMap);
    case 'ArrowFunctionExpression': return synthArrowFunction(ast, env, interfaceMap);
    case 'BlockStatement':          return synthBlockStatement(ast, env, interfaceMap);
    case 'UnaryExpression':         return synthUnary(ast, env, interfaceMap);
    case 'LogicalExpression':       return synthLogical(ast, env, interfaceMap);
    case 'BinaryExpression':        return synthBinary(ast, env, interfaceMap);
    case 'SequenceExpression':      return synthSequence(ast, env, interfaceMap);
    case 'MemberExpression':        return synthMember(ast, env, interfaceMap);
    case 'CallExpression':          return synthCall(ast, env, interfaceMap);
    case 'ConditionalExpression':   return synthConditional(ast, env, interfaceMap);
    case 'TemplateLiteral':         return synthTemplateLiteral(ast, env, interfaceMap);
    case 'JSXIdentifier':           return synthJSXIdentifier(ast, env, interfaceMap);
    case 'JSXElement':              return synthJSXElement(ast, env, interfaceMap);
    case 'JSXFragment':             return synthJSXFragment(ast, env, interfaceMap);
    case 'JSXExpressionContainer':  return synthJSXExpressionContainer(ast, env, interfaceMap);
    case 'JSXText':                 return synthJSXText(ast, env, interfaceMap);
    case 'JSXEmptyExpression':      return synthJSXEmptyExpression(ast, env, interfaceMap);
    case 'AssignmentExpression':    return synthAssignment(ast, env, interfaceMap);
    case 'TSAsExpression':          return synthTSAs(ast, env, interfaceMap);

    default:
      return bug(`unimplemented AST ${ast.type}`);
  }
}

export function synth(
  ast: ESTree.Node,
  env: Env,
  interfaceMap: InterfaceMap,
): Interface {
  const intf = synthHelper(ast, env, interfaceMap);
  interfaceMap.set(ast, intf);
  return intf;
}

function andThen(
  intf: Interface,
  fn: (t: Interface, interfaceMap: InterfaceMap) => Interface,
  interfaceMap: InterfaceMap,
  preserveCell: boolean = false
): Interface {
  let type = Type.expand(intf.type);

  // TODO(jaked) this is pretty ad-hoc
  if (!preserveCell && type.kind === 'Abstract' && (type.label === 'Code' || type.label === 'Session')) {
    const param = type.params.get(0) ?? bug(`expected param`);
    type = param;
  }

  switch (type.kind) {
    case 'Union':
      return { type: Type.union(...type.types.map(type =>
        fn({ type }, interfaceMap).type))
      };

    case 'Intersection': {
      // an intersection type describes several interfaces to an object.
      // using an object of intersection type means using one of its interfaces
      // but others may not support the way we're trying to use it.
      // so we expect type errors for some arms of the intersection
      // and we don't want to pollute interfaceMap when typechecking those arms.
      // we first synth with no interfaceMap to find out which arms are OK
      //   - if no arms are OK we re-synth the last arm with interfaceMap
      //   - if some arms are OK we re-synth the first OK arm with interfaceMap
      // TODO(jaked)
      // this would be a little easier if we updated interfaceMap functionally
      // then we could just take the one we wanted instead of re-synthing
      // TODO(jaked)
      // maybe we could produce better error messages (like Typescript)
      // by treating some intersections as a single type
      // (e.g. {foo:boolean}&{bar:number}) rather than handling arms separately
      const noInterfaceMap: InterfaceMap = new Map();
      const types = type.types.map(type => fn({ type }, noInterfaceMap).type);
      const okIndex = types.findIndex(type => type.kind !== 'Error')
      if (okIndex === -1) {
        const type = types.get(types.size - 1) ?? bug(`expected type`);
        return fn({ type }, interfaceMap);
      } else {
        const okType = type.types.get(okIndex) ?? bug(`expected type`);
        fn({ type: okType }, interfaceMap);
        return { type: Type.intersection(...types.filter(type => type.kind !== 'Error')) };
      }
    }

    default:
      return fn({ type }, interfaceMap);
  }
}

export function synthAndThen(
  ast: ESTree.Expression,
  env: Env,
  interfaceMap: InterfaceMap,
  fn: (t: Interface, interfaceMap: InterfaceMap) => Interface,
  preserveCell: boolean = false
): Interface {
  return andThen(synth(ast, env, interfaceMap), fn, interfaceMap, preserveCell);
}

function importDecl(
  decl: ESTree.ImportDeclaration,
  moduleEnv: Map<string, Type.ModuleType>,
  env: Env,
  interfaceMap: InterfaceMap,
): Env {
  const module = moduleEnv.get(decl.source.value);
  if (!module) {
    const error = Error.withLocation(decl.source, `no module '${decl.source.value}'`, interfaceMap);
    decl.specifiers.forEach(spec => {
      env = env.set(spec.local.name, error);
    });
  } else {
    decl.specifiers.forEach(spec => {
      switch (spec.type) {
        case 'ImportNamespaceSpecifier': {
          env = env.set(spec.local.name, { type: module });
        }
        break;

        case 'ImportDefaultSpecifier': {
          const defaultField = module.fields.find(ft => ft._1 === 'default');
          if (defaultField) {
            env = env.set(spec.local.name, { type: defaultField._2 });
          } else {
            const error = Error.withLocation(spec.local, `no default export on '${decl.source.value}'`, interfaceMap);
            env = env.set(spec.local.name, error);
          }
        }
        break;

        case 'ImportSpecifier': {
          const importedField = module.fields.find(ft => ft._1 === spec.imported.name)
          if (importedField) {
            env = env.set(spec.local.name, { type: importedField._2 });
          } else {
            const error = Error.withLocation(spec.imported, `no exported member '${spec.imported.name}' on '${decl.source.value}'`, interfaceMap);
            interfaceMap.set(spec.local, error);
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
  interfaceMap: InterfaceMap,
): Env {
  decl.declarations.forEach(declarator => {
    let declIntf: Interface;

    if (!declarator.init) {
      declIntf = Error.withLocation(declarator.id, `expected initializer`, interfaceMap);

    } else if (decl.kind === 'const') {
      if (declarator.id.typeAnnotation) {
        const ann = Type.ofTSType(declarator.id.typeAnnotation.typeAnnotation, interfaceMap);
        if (ann.kind === 'Error') {
          declIntf = synth(declarator.init, env, interfaceMap);
        } else {
          const intf = check(declarator.init, env, ann, interfaceMap);
          declIntf = intf.type.kind === 'Error' ? intf : { type: ann };
        }
      } else {
        declIntf = synth(declarator.init, env, interfaceMap);
      }

    } else if (decl.kind === 'let') {
      // TODO(jaked) could relax this and allow referring to static variables
      const initEnv = Immutable.Map({ undefined: { type: Type.undefined } });
      if (!declarator.id.typeAnnotation) {
        synth(declarator.init, initEnv, interfaceMap);
        declIntf = Error.withLocation(declarator.id, `expected type annotation`, interfaceMap);
      } else {
        const ann = Type.ofTSType(declarator.id.typeAnnotation.typeAnnotation, interfaceMap);
        if (ann.kind === 'Error') {
          synth(declarator.init, initEnv, interfaceMap);
          declIntf = { type: ann };
        } if (ann.kind !== 'Abstract' || (ann.label !== 'Code' && ann.label !== 'Session')) {
          synth(declarator.init, initEnv, interfaceMap);
          declIntf = Error.withLocation(declarator.id.typeAnnotation, `expected Code<T> or Session<T>`, interfaceMap);
        } else {
          const param = ann.params.get(0) ?? bug(`expected param`);
          const intf = check(declarator.init, initEnv, param, interfaceMap);
          declIntf = intf.type.kind === 'Error' ? intf : { type: ann };
        }
      }
    }

    else bug(`unexpected ${decl.kind}`);

    interfaceMap.set(declarator.id, declIntf);
    env = env.set(declarator.id.name, declIntf);
  });
  return env;
}

export function synthProgram(
  moduleEnv: Map<string, Type.ModuleType>,
  program: ESTree.Program,
  env: Env,
  interfaceMap: InterfaceMap,
): Env {
  program.body.forEach(node => {
    switch (node.type) {
      case 'ExportDefaultDeclaration':
        env = env.set('default', synth(node.declaration, env, interfaceMap));
        break;

      case 'ExportNamedDeclaration':
        env = synthVariableDecl(node.declaration, env, interfaceMap);
        break;

      case 'ImportDeclaration':
        env = importDecl(node, moduleEnv, env, interfaceMap);
        break;

      case 'VariableDeclaration':
        env = synthVariableDecl(node, env, interfaceMap);
        break;

      case 'ExpressionStatement':
        check(node.expression, env, Type.reactNodeType, interfaceMap);
        break;
    }
  });
  return env;
}
