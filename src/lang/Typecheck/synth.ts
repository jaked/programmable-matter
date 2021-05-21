import * as Immutable from 'immutable';
import Try from '../../util/Try';
import { bug } from '../../util/bug';
import Type from '../Type';
import * as ESTree from '../ESTree';
import { Interface, InterfaceMap } from '../../model';
import { Env } from './env';
import * as Error from './error';
import { check } from './check';
import { narrowType, narrowEnvironment } from './narrow';

const intfType = (intf: Interface) =>
  intf.type === 'ok' ? intf.ok.type : Type.error(intf.err);

const intfDynamic = (intf: Interface) =>
  intf.type === 'ok' ? intf.ok.dynamic : false;

const stringIntf = Try.ok({ type: Type.string, dynamic: false });
const trueIntf = Try.ok({ type: Type.singleton(true), dynamic: false });
const undefinedIntf = Try.ok({ type: Type.undefined, dynamic: false });

function synthIdentifier(
  ast: ESTree.Identifier,
  env: Env,
  interfaceMap: InterfaceMap,
): Interface {
  const intf = env.get(ast.name);
  if (intf) return intf;
  else if (ast.name === 'undefined') return undefinedIntf;
  else return Error.withLocation(ast, `unbound identifier '${ast.name}'`, interfaceMap);
}

function synthLiteral(
  ast: ESTree.Literal,
  env: Env,
  interfaceMap: InterfaceMap,
): Interface {
  return Try.ok({ type: Type.singleton(ast.value), dynamic: false });
}

function synthArray(
  ast: ESTree.ArrayExpression,
  env: Env,
  interfaceMap: InterfaceMap,
): Interface {
  const intfs = ast.elements.map(e => synth(e, env, interfaceMap));
  const type = Type.array(Type.union(...intfs.map(intfType)));
  const dynamic = intfs.some(intfDynamic);
  return Try.ok({ type, dynamic });
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
    (obj, nameIntf) => {
      if (!nameIntf) return obj;
      const { name, intf } = nameIntf;
      return { ...obj, [name]: intfType(intf) };
    },
    {}
  );
  const type = Type.object(fieldTypesObj);
  const dynamic = fieldIntfs.some(nameIntf => {
    if (!nameIntf) return false;
    const { intf } = nameIntf;
    return intfDynamic(intf);
  });
  return Try.ok({ type, dynamic });
}

const typeofType =
  Type.enumerate('undefined', 'boolean', 'number', 'string', 'function', 'object', 'error')

function synthUnary(
  ast: ESTree.UnaryExpression,
  env: Env,
  interfaceMap: InterfaceMap,
): Interface {
  return synthAndThen(ast.argument, env, interfaceMap, (intf, interfaceMap) => {
    return Try.apply(() => {
      const type = ((type: Type) => {
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
              case '-': return Type.number ;
            }
        }
        return Error.withLocation(ast, 'incompatible operand to ${ast.operator}', interfaceMap).get();
      })(intfType(intf));
      const dynamic = intfDynamic(intf);
      return { type, dynamic };
    });
  });
}

function synthLogical(
  ast: ESTree.LogicalExpression,
  env: Env,
  interfaceMap: InterfaceMap,
): Interface {
  let rightEnv: Env;
  switch (ast.operator) {
    case '&&':
      rightEnv = narrowEnvironment(env, ast.left, true, interfaceMap);
      break;
    case '||':
      rightEnv = narrowEnvironment(env, ast.left, false, interfaceMap);
      break;
    case '??':
      // TODO(jaked) narrow type (left hand side is not undefined)
      rightEnv = env;
      break;
    default:
      bug(`unexpected operator ${ast.operator}`);
  }

  return synthAndThen(ast.left, env, interfaceMap, (left, interfaceMap) => {
    return synthAndThen(ast.right, rightEnv, interfaceMap, (right, interfaceMap) => {
      const type = ((left: Type, right: Type) => {
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

              // TODO(jaked) Type.union(Type.intersection(left.type, Type.notFalsy), right.type) ?
              default:          return Type.union(left, right);
            }
          }

          case '??': {
            switch (left.kind) {
              case 'Error':     return right;
              case 'undefined': return right;
              case 'Singleton': return (left.value !== undefined) ? left : right;

              default:          return Type.union(narrowType(left, Type.notUndefined), right);
            }
          }

          default:
            bug(`unexpected operator ${ast.operator}`);
        }
      })(intfType(left), intfType(right));
      const dynamic = intfDynamic(left) || intfDynamic(right);
      return Try.ok({ type, dynamic });
    });
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
      return Try.apply(() => {
        const type = ((left: Type, right: Type) => {
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
          return Error.withLocation(ast, `incompatible operands to ${ast.operator} (${Type.toString(left)}, ${Type.toString(right)})`, interfaceMap).get();
        })(intfType(left), intfType(right));
        const dynamic = intfDynamic(left) || intfDynamic(right);
        return { type, dynamic };
      });
    });
  });
}

function synthSequence(
  ast: ESTree.SequenceExpression,
  env: Env,
  interfaceMap: InterfaceMap,
): Interface {
  const intfs = ast.expressions.map(e => synth(e, env, interfaceMap));
  const type = intfType(intfs[intfs.length - 1]);
  const dynamic = intfs.some(intfDynamic);
  return Try.ok({ type, dynamic });
}

function synthMember(
  ast: ESTree.MemberExpression,
  env: Env,
  interfaceMap: InterfaceMap,
): Interface {
  return synthAndThen(ast.object, env, interfaceMap, (object: Interface, interfaceMap: InterfaceMap) => {
    if (ast.computed) {
      return synthAndThen(ast.property, env, interfaceMap, (prop, interfaceMap) => {
        if (object.type === 'err') return object;

        return Try.apply(() => {
          const type = ((object: Type, prop: Type) => {
            switch (object.kind) {
              case 'Array':
                if (prop.kind === 'Error') return Type.undefined;
                if (prop.kind === 'number' ||
                    (prop.kind === 'Singleton' && prop.base.kind === 'number')) {
                  return Type.undefinedOr(object.elem);
                }
                return Error.expectedType(ast, Type.number, prop, interfaceMap).get();

              case 'Tuple':
                if (prop.kind === 'Error') return prop;
                if (prop.kind === 'Singleton' && prop.base.kind === 'number') {
                  if (prop.value < object.elems.size)
                    return object.elems.get(prop.value) ?? bug(`expected elem`);
                  return Error.noElementAtIndex(ast, prop.value, interfaceMap).get();
                }
                return Error.expectedType(ast, Type.number, prop, interfaceMap).get();

              case 'Object':
                if (prop.kind === 'Error') return prop;
                if (prop.kind === 'Singleton' && prop.base.kind === 'string') {
                  const type = object.getFieldType(prop.value);
                  if (type) return type;
                  else return Error.unknownField(ast, prop.value, interfaceMap).get();
                }
                return Error.expectedType(ast, Type.string, prop, interfaceMap).get();

              default:
                return Error.expectedType(ast, 'Array or Tuple', object, interfaceMap).get();
            }
          })(intfType(object), intfType(prop));
          const dynamic = intfDynamic(object) || intfDynamic(prop);
          return { type, dynamic };
        });
      });

    } else {
      if (ast.property.type !== 'Identifier') bug(`expected identifier on non-computed property`);
      const name = ast.property.name;

      if (object.type === 'err') return object;

      return Try.apply(() => {
        const type = ((object: Type) => {
          switch (object.kind) {
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
                    [ Type.functionType([ object.elem, Type.number, object ], Type.boolean) ],
                    Type.boolean,
                  );

                case 'filter':
                  return Type.functionType(
                    [ Type.functionType([ object.elem, Type.number, object ], Type.boolean) ],
                    object,
                  );

                case 'forEach':
                  return Type.functionType(
                    [ Type.functionType([ object.elem, Type.number, object ], Type.undefined) ],
                    Type.undefined,
                  );

                case 'map':
                  return Type.functionType(
                    [ Type.functionType([ object.elem, Type.number, object ], Type.reactNodeType) ], // TODO(jaked) temporary
                    Type.array(Type.reactNodeType),
                  );
              }
              break;

            case 'Map':
              switch (name) {
                case 'size': return Type.number;

                case 'set':
                  return Type.functionType([ object.key, object.value ], object);

                case 'delete':
                  return Type.functionType([ object.key ], object);

                case 'clear':
                  return Type.functionType([], object);

                case 'filter':
                  return Type.functionType(
                    [ Type.functionType([ object.value, object.key, object ], Type.boolean) ],
                    object,
                  );

                case 'toList':
                  return Type.functionType([], Type.array(object.value));

                case 'update':
                  return Type.functionType(
                    [ object.key, Type.functionType([ object.value ], object.value) ],
                    object
                  );

                case 'get':
                  return Type.functionType(
                    [ object.key ],
                    Type.undefinedOr(object.value),
                  );
              }
              break;

            case 'Object': {
              const type = object.getFieldType(name);
              if (type) return type;
              break;
            }

            case 'Module': {
              const type = object.getFieldType(name);
              if (type) return type;
              break;
            }
          }
          return Error.unknownField(ast.property, name, interfaceMap).get();
        })(intfType(object));
        const dynamic = intfDynamic(object);
        return { type, dynamic };
      });
    }
  });
}

function synthCall(
  ast: ESTree.CallExpression,
  env:Env,
  interfaceMap: InterfaceMap,
): Interface {
  return synthAndThen(ast.callee, env, interfaceMap, (callee, interfaceMap) => {
    if (callee.type == 'err') {
      ast.arguments.forEach(arg => synth(arg, env, interfaceMap))
      return callee;
    }

    if (callee.ok.type.kind !== 'Function') {
      ast.arguments.forEach(arg => synth(arg, env, interfaceMap));
      return Error.expectedType(ast.callee, 'function', callee.ok.type, interfaceMap);
    }

    const args = callee.ok.type.args;
    const intfs = args.map((expectedType, i) => {
      if (i < ast.arguments.length) {
        const intf = check(ast.arguments[i], env, expectedType, interfaceMap);
        // it's OK for an argument to be Error if the function accepts undefined
        if (intf.type === 'err' && Type.isSubtype(Type.undefined, expectedType))
          return undefinedIntf;
        else
          return intf;
      } else if (Type.isSubtype(Type.undefined, expectedType)) {
        // it's OK for an argument to be missing if the function accepts undefined
        return undefinedIntf;
      } else
        return Error.wrongArgsLength(ast, args.size, ast.arguments.length, interfaceMap);
    });
    ast.arguments.forEach((arg, i) => {
      if (i >= args.size) {
        synth(arg, env, interfaceMap);
        Error.wrongArgsLength(arg, args.size, ast.arguments.length, interfaceMap);
      }
    });
    // if there aren't enough arguments or a required argument is err then the call is err
    const errIntf = intfs.find(intf => intf.type === 'err');
    if (errIntf) return errIntf;
    const type = callee.ok.type.ret;
    const dynamic = callee.ok.dynamic || intfs.some(intfDynamic);
    // TODO(jaked) carry dynamic bit on function type and use it here
    return Try.ok({ type, dynamic });
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
    // local variables are always static
    return env.set(ast.name, Try.ok({ type, dynamic: false }));
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
      const t = Type.error(Error.withLocation(param, `function parameter must have a type`, interfaceMap).err);
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
  // TODO(jaked) track dynamic flag of body in function type
  const type = Type.functionType(params, intfType(body));
  return Try.ok({ type, dynamic: intfDynamic(body) });
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
    return undefinedIntf;
  else {
    const type = intfType(intfs[intfs.length - 1]);
    const dynamic = intfs.some(intfDynamic);
    return Try.ok({ type, dynamic });
  }
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
    if (Type.isTruthy(intfType(test))) {
      if (consequent.type === 'err') return consequent;
      const type = consequent.ok.type;
      const dynamic = intfDynamic(test) || consequent.ok.dynamic;
      return Try.ok({ type, dynamic });
    } else if (Type.isFalsy(intfType(test))) {
      if (alternate.type === 'err') return alternate;
      const type = alternate.ok.type;
      const dynamic = intfDynamic(test) || alternate.ok.dynamic;
      return Try.ok({ type, dynamic });
    } else {
      if (consequent.type === 'err') return consequent;
      if (alternate.type === 'err') return alternate;
      const type = Type.union(consequent.ok.type, alternate.ok.type);
      const dynamic = intfDynamic(test) || consequent.ok.dynamic || alternate.ok.dynamic;
      return Try.ok({ type, dynamic });
    }
  });
}

function synthTemplateLiteral(
  ast: ESTree.TemplateLiteral,
  env: Env,
  interfaceMap: InterfaceMap,
): Interface {
  // TODO(jaked) handle interpolations
  return Try.ok({ type: Type.string, dynamic: false });
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
    const { props, ret } = ((element: Type) => {
      switch (element.kind) {
        case 'Error':
          return { props: Type.object({}), ret: element }

        case 'Function':
          if (element.args.size === 0) {
            return { props: Type.object({}), ret: element.ret };

          } else if (element.args.size === 1) {
            const argType = element.args.get(0) ?? bug();
            if (argType.kind === 'Object') {
              const childrenField = argType.fields.find(field => field._1 === 'children');
              if (!childrenField || Type.isSubtype(Type.array(Type.reactNodeType), childrenField._2))
                return { props: argType, ret: element.ret };
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
        ret: Type.error(Error.expectedType(ast.openingElement.name, 'component type', element, interfaceMap).err)
      };
    })(intfType(element));

    const attrs = ast.openingElement.attributes.map(attr => {
      const expectedType = props.getFieldType(attr.name.name);
      if (expectedType) {
        if (attr.value) {
          const intf = check(attr.value, env, expectedType, interfaceMap);
          // it's OK for an argument to be Error if the function accepts undefined
          if (intf.type === 'err' && Type.isSubtype(Type.undefined, expectedType))
            return undefinedIntf;
          else
            return intf;
        } else {
          const type = Type.singleton(true);
          if (Type.isSubtype(type, expectedType))
            return trueIntf;
          else
            return Error.expectedType(attr.name, expectedType, type, interfaceMap);
        }
      } else {
        // TODO(jaked) putting the error here gets us the right highlighting
        // but we also need to skip evaluation, would be better to put it on attr
        Error.extraField(attr.name, attr.name.name, interfaceMap);
        if (attr.value) {
          // TODO(jaked) an error in an extra attribute should not fail whole tag
          return synth(attr.value, env, interfaceMap);
        } else {
          return trueIntf;
        }
      }
    });

    const children = ast.children.map(child =>
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
    const attrError = attrs.find(intf => intf.type === 'err');
    if (attrError) return attrError;
    // TODO(jaked) check dynamic bit on function types
    const dynamic = intfDynamic(element) || attrs.some(intfDynamic) || children.some(intfDynamic);
    return Try.ok({ type: ret, dynamic });
  });
}

function synthJSXFragment(
  ast: ESTree.JSXFragment,
  env: Env,
  interfaceMap: InterfaceMap,
): Interface {
  const children = ast.children.map(child =>
    // TODO(jaked) see comment about recursive types on Type.reactNodeType
    check(child, env, Type.union(Type.reactNodeType, Type.array(Type.reactNodeType)), interfaceMap)
  );
  const dynamic = children.some(intfDynamic);
  return Try.ok({ type: Type.reactNodeType, dynamic });
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
  return stringIntf;
}

function synthJSXEmptyExpression(
  ast: ESTree.JSXEmptyExpression,
  env: Env,
  interfaceMap: InterfaceMap,
): Interface {
  return undefinedIntf;
}

function synthAssignment(
  ast: ESTree.AssignmentExpression,
  env: Env,
  interfaceMap: InterfaceMap,
): Interface {
  const left = synth(ast.left, env, interfaceMap);
  if (left.type === 'err') {
    synth(ast.right, env, interfaceMap);
    return left;
  }

  let object = ast.left;
  let leftDynamic = false;
  while (object.type === 'MemberExpression') {
    if (object.computed) {
      const intf = interfaceMap.get(object.property) ?? bug(`expected intf`);
      leftDynamic ||= intfDynamic(intf);
    }
    object = object.object;
  }

  const intf = interfaceMap.get(object) ?? bug(`expected intf`);
  if (intf.type === 'err' || intf.ok.mutable === undefined)
    return Error.expectedType(ast, 'mutable', 'immutable', interfaceMap);

  const right = check(ast.right, env, left.ok.type, interfaceMap);
  if (right.type === 'err') return right;

  return Try.ok({ type: right.ok.type, dynamic: leftDynamic || right.ok.dynamic });
}

function synthTSAs(
  ast: ESTree.TSAsExpression,
  env: Env,
  interfaceMap: InterfaceMap,
): Interface {
  const type = Type.ofTSType(ast.typeAnnotation, interfaceMap);
  const intf = check(ast.expression, env, type, interfaceMap);
  return intf.type === 'err' ? intf : Try.ok({ type, dynamic: intf.ok.dynamic });
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
  let intf = synthHelper(ast, env, interfaceMap);
  if (intf.type === 'ok' && intf.ok.type.kind === 'Error')
    intf = Try.err(intf.ok.type.err);
  interfaceMap.set(ast, intf);
  return intf;
}

function andThen(
  intf: Interface,
  fn: (t: Interface, interfaceMap: InterfaceMap) => Interface,
  interfaceMap: InterfaceMap,
): Interface {
  if (intf.type === 'err')
    return fn(intf, interfaceMap);
  // TODO(jaked) should understand better where Type-level errors are allowed
  if (intf.ok.type.kind === 'Error')
    return fn(Try.err(intf.ok.type.err), interfaceMap);
  const type = Type.expand(intf.ok.type);

  switch (type.kind) {
    case 'Union': {
      const intfs = type.types.map(type =>
        fn(Try.ok({ type, dynamic: intfDynamic(intf) }), interfaceMap)
      );
      const error = intfs.find(intf => intf.type === 'err');
      if (error) return error;
      const unionType = Type.union(...intfs.map(intfType));
      let dynamic: undefined | boolean = undefined;
      intfs.forEach(intf => {
        if (dynamic === undefined) dynamic = intfDynamic(intf);
        else if (intfDynamic(intf) !== dynamic) bug(`expected uniform dynamic`);
      });
      if (dynamic === undefined) bug(`expected dynamic`);
      return Try.ok({ type: unionType, dynamic });
    }

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
      const intfs = type.types.map(type =>
        fn(Try.ok({ type, dynamic: intfDynamic(intf) }), noInterfaceMap)
      );
      const okIndex = intfs.findIndex(intf => intf.type !== 'err')
      if (okIndex === -1) {
        const intf = intfs.get(intfs.size - 1) ?? bug(`expected type`);
        return fn(intf, interfaceMap);
      } else {
        const okType = type.types.get(okIndex) ?? bug(`expected type`);
        fn(Try.ok({ type: okType, dynamic: intfDynamic(intf) }), interfaceMap);
        let dynamic: boolean | undefined = undefined;
        const types: Type[] = [];
        intfs.forEach(intf => {
          if (intf.type === 'err') return;
          if (dynamic === undefined) dynamic = intf.ok.dynamic;
          else if (intf.ok.dynamic !== dynamic) bug(`expected uniform dynamic`);
          types.push(intf.ok.type);
        });
        if (dynamic === undefined) bug(`expected dynamic`);
        return Try.ok({
          type: Type.intersection(...types),
          dynamic
        });
      }
    }

    default:
      return fn(Try.ok({ type, dynamic: intfDynamic(intf) }), interfaceMap);
  }
}

export function synthAndThen(
  ast: ESTree.Expression,
  env: Env,
  interfaceMap: InterfaceMap,
  fn: (t: Interface, interfaceMap: InterfaceMap) => Interface,
): Interface {
  return andThen(synth(ast, env, interfaceMap), fn, interfaceMap);
}

function importDecl(
  decl: ESTree.ImportDeclaration,
  moduleEnv: Map<string, Map<string, Interface>>,
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
          // TODO(jaked)
          // module types should map names to interfaces
          // so we can undo some hacks
          const moduleObj: { [f: string]: Type } = {};
          for (const [name, intf] of module.entries()) {
            moduleObj[name] = intfType(intf);
          }
          const type = Type.module(moduleObj);
          // if any field is dynamic the whole module is dynamic
          // TODO(jaked) make this more fine-grained, see comment in compileFilePm
          const dynamic = [...module.values()].some(intfDynamic);
          env = env.set(spec.local.name, Try.ok({ type, dynamic }));
        }
        break;

        case 'ImportDefaultSpecifier': {
          const defaultIntf = module.get('default');
          if (defaultIntf) {
            env = env.set(spec.local.name, defaultIntf);
          } else {
            const error = Error.withLocation(spec.local, `no default export on '${decl.source.value}'`, interfaceMap);
            env = env.set(spec.local.name, error);
          }
        }
        break;

        case 'ImportSpecifier': {
          const importedIntf = module.get(spec.imported.name);
          if (importedIntf) {
            env = env.set(spec.local.name, importedIntf);
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
          declIntf = intf.type === 'err' ? intf : Try.ok({ type: ann, dynamic: intf.ok.dynamic });
        }
      } else {
        declIntf = synth(declarator.init, env, interfaceMap);
      }

    } else if (decl.kind === 'let') {
      // TODO(jaked) could relax this and allow referring to static variables
      const initEnv = Immutable.Map({ undefined: undefinedIntf });
      if (!declarator.id.typeAnnotation) {
        synth(declarator.init, initEnv, interfaceMap);
        declIntf = Error.withLocation(declarator.id, `expected type annotation`, interfaceMap);
      } else {
        const ann = Type.ofTSType(declarator.id.typeAnnotation.typeAnnotation, interfaceMap);
        if (ann.kind === 'Error') {
          synth(declarator.init, initEnv, interfaceMap);
          declIntf = Try.ok({ type: ann, dynamic: false });
        } if (ann.kind !== 'Abstract' || (ann.label !== 'Code' && ann.label !== 'Session')) {
          synth(declarator.init, initEnv, interfaceMap);
          declIntf = Error.withLocation(declarator.id.typeAnnotation, `expected Code<T> or Session<T>`, interfaceMap);
        } else {
          const [dynamic, mutable]: [boolean, 'Code' | 'Session'] =
            ann.label === 'Code' ? [false, 'Code'] :
            ann.label === 'Session' ? [true, 'Session'] :
            bug(`expected Code or Session`);

          const param = ann.params.get(0) ?? bug(`expected param`);
          const intf = check(declarator.init, initEnv, param, interfaceMap);
          declIntf = intf.type === 'err' ? intf : Try.ok({ type: param, dynamic, mutable });
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
  moduleEnv: Map<string, Map<string, Interface>>,
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
