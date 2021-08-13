import * as Immutable from 'immutable';
import Try from '../util/Try';
import { bug } from '../util/bug';
import Type from '../type';
import * as ESTree from '../estree';
import { Interface, InterfaceMap } from '../model';
import { Env } from './env';
import * as Error from './error';
import { synth, synthAndThen } from './synth';
import { narrowEnvironment } from './narrow';

const intfType = (intf: Interface) =>
  intf.type === 'ok' ? intf.ok.type : Type.error(intf.err);

const intfDynamic = (intf: Interface) =>
  intf.type === 'ok' ? intf.ok.dynamic : false;

const undefinedIntf = Try.ok({ type: Type.undefined, dynamic: false });

function checkSubtype(
  ast: ESTree.Expression,
  env: Env,
  type: Type,
  interfaceMap: InterfaceMap,
): Interface {
  switch (ast.type) {
    case 'JSXExpressionContainer':
      return check(ast.expression, env, type, interfaceMap);

    case 'ConditionalExpression': {
      const envConsequent = narrowEnvironment(env, ast.test, true, interfaceMap);
      const envAlternate = narrowEnvironment(env, ast.test, false, interfaceMap);

      return synthAndThen(ast.test, env, interfaceMap, test => {
        if (Type.isTruthy(intfType(test))) {
          const consequent = check(ast.consequent, envConsequent, type, interfaceMap);
          synth(ast.alternate, envAlternate, interfaceMap);
          if (consequent.type === 'err') return consequent;
          const dynamic = intfDynamic(test) || consequent.ok.dynamic;
          return Try.ok({ type: consequent.ok.type, dynamic });
        } else if (Type.isFalsy(intfType(test))) {
          synth(ast.consequent, envConsequent, interfaceMap);
          const alternate = check(ast.alternate, envAlternate, type, interfaceMap);
          if (alternate.type === 'err') return alternate;
          const dynamic = intfDynamic(test) || alternate.ok.dynamic;
          return Try.ok({ type: alternate.ok.type, dynamic });
        } else {
          const consequent = check(ast.consequent, envConsequent, type, interfaceMap);
          const alternate = check(ast.alternate, envAlternate, type, interfaceMap);
          if (consequent.type === 'err') return consequent;
          if (alternate.type === 'err') return alternate;
          const unionType = Type.union(consequent.ok.type, alternate.ok.type);
          const dynamic = intfDynamic(test) || consequent.ok.dynamic || alternate.ok.dynamic;
          return Try.ok({ type: unionType, dynamic });
        }
      });
    }

    case 'SequenceExpression': {
      const intfs = ast.expressions.map((e, i) => {
        if (i < ast.expressions.length - 1)
          return synth(e, env, interfaceMap);
        else
          return check(e, env, type, interfaceMap);
      });
      const type = intfType(intfs[intfs.length - 1]);
      const dynamic = intfs.some(intfDynamic);
      return Try.ok({ type, dynamic });
    }

    default:
      const intf = synth(ast, env, interfaceMap);
      if (intf.type === 'err') return intf;

      const actual = intf.ok.type;
      if (Type.isSubtype(actual, type))
        return intf;
      else if (actual.kind === 'Error')
        return Try.err(actual.err);
      else
        return Error.expectedType(ast, type, actual, interfaceMap);
  }
}

function checkTuple(
  ast: ESTree.Expression,
  env: Env,
  type: Type.TupleType,
  interfaceMap: InterfaceMap,
): Interface {
  switch (ast.type) {
    case 'ArrayExpression': {
      const intfs = type.elems.map((expectedType, i) => {
        if (i < ast.elements.length) {
          const intf = check(ast.elements[i], env, expectedType, interfaceMap);
          if (intf.type === 'err' && Type.isSubtype(Type.undefined, expectedType))
            return undefinedIntf;
          else
            return intf;
        } else if (Type.isSubtype(Type.undefined, expectedType)) {
          return undefinedIntf;
        } else
          return Error.withLocation(ast, 'expected ${type.elems.size} elements');
      });
      const error = intfs.find(intf => intf.type === 'err');
      if (error) return error;
      const dynamic = intfs.some(intfDynamic);
      return Try.ok({ type, dynamic });
    }

    default:
      return checkSubtype(ast, env, type, interfaceMap);
  }
}

function checkArray(
  ast: ESTree.Expression,
  env: Env,
  type: Type.ArrayType,
  interfaceMap: InterfaceMap,
): Interface {
  switch (ast.type) {
    // never called since we check against `reactNodeType`, see comment on checkUnion
    case 'JSXFragment': {
      const expectedType = type.elem;
      const intfs = ast.children.map(child => {
        const intf = check(child, env, expectedType, interfaceMap);
        if (intf.type === 'err' && Type.isSubtype(Type.undefined, expectedType))
          return undefinedIntf;
        else
          return intf;
      });
      const error = intfs.find(intf => intf.type === 'err');
      if (error) return error;
      const dynamic = intfs.some(intfDynamic);
      return Try.ok({ type, dynamic });
    }

    case 'ArrayExpression': {
      const expectedType = type.elem;
      const intfs = ast.elements.map(child => {
        const intf = check(child, env, expectedType, interfaceMap);
        if (intf.type === 'err' && Type.isSubtype(Type.undefined, expectedType))
          return undefinedIntf;
        else
          return intf;
      });
      const error = intfs.find(intf => intf.type === 'err');
      if (error) return error;
      const dynamic = intfs.some(intfDynamic);
      return Try.ok({ type, dynamic });
    }

    default:
      return checkSubtype(ast, env, type, interfaceMap);
  }
}

function checkSet(
  ast: ESTree.Expression,
  env: Env,
  type: Type.SetType,
  interfaceMap: InterfaceMap,
): Interface {
  switch (ast.type) {
    // TODO(jaked) Set literals?

    default:
      return checkSubtype(ast, env, type, interfaceMap);
  }
}

function checkMap(
  ast: ESTree.Expression,
  env: Env,
  type: Type.MapType,
  interfaceMap: InterfaceMap,
): Interface {
  switch (ast.type) {
    // TODO(jaked) Map literals?

    default:
      return checkSubtype(ast, env, type, interfaceMap);
  }
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
    const type = t.fields.find(({ name }) => name === key.name)?.type;
    if (!type) {
      Error.unknownField(key, key.name, interfaceMap);
    } else {
      env = patTypeEnv(prop.value, type, env, interfaceMap);
    }
  });
  return env;
}

// TODO(jaked) share with synth.ts
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

function checkFunction(
  ast: ESTree.Expression,
  env: Env,
  type: Type.FunctionType,
  interfaceMap: InterfaceMap,
): Interface {
  switch (ast.type) {
    case 'ArrowFunctionExpression':
      if (ast.params.length > type.args.length)
        return Error.wrongArgsLength(ast, type.args.length, ast.params.length, interfaceMap);
      let patEnv: Env = Immutable.Map(); // TODO(jaked) Env.empty();
      ast.params.forEach((pat, i) => {
        patEnv = patTypeEnv(pat, type.args[i] ?? bug(), patEnv, interfaceMap);
      });
      env = env.merge(patEnv);
      const body = ast.body;
      if (body.type === 'BlockStatement') {
        if (body.body.length === 0) {
          if (Type.isSubtype(Type.undefined, type))
            return undefinedIntf;
          else
            return Error.expectedType(ast, type, Type.undefined, interfaceMap);

        } else {
          const intfs = body.body.map((stmt, i) => {
            switch (stmt.type) {
              case 'ExpressionStatement':
                if (i < body.body.length - 1)
                  return synth(stmt.expression, env, interfaceMap);
                else
                  return check(stmt.expression, env, type.ret, interfaceMap);
              default:
                bug(`unimplemented ${stmt.type}`);
            }
          });
          const dynamic = intfs.some(intfDynamic);
          const lastIntf = intfs[intfs.length - 1];
          if (lastIntf.type === 'err' && type.ret !== Type.undefined) return lastIntf;
          return Try.ok({ type, dynamic });
        }

      } else {
        const intf = check(body, env, type.ret, interfaceMap);
        if (intf.type === 'err' && type.ret !== Type.undefined) return intf;
        else return Try.ok({ type, dynamic: intfDynamic(intf) });
      }

    default:
      return checkSubtype(ast, env, type, interfaceMap);
  }
}

function checkUnion(
  ast: ESTree.Expression,
  env: Env,
  type: Type.UnionType,
  interfaceMap: InterfaceMap,
): Interface {
  // to get a more localized error message we'd like to decompose the type and expression
  // as far as possible, but for unions we don't know which arm to break down.
  // if the outermost AST node corresponds to exactly one arm we'll try that one.
  // we could get fancier here, and try to figure out which arm best matches the AST,
  // but we don't know which arm was intended, so the error could be confusing.
  const matchingArms = type.types.filter(t =>
    (t.kind === 'Object' && ast.type === 'ObjectExpression') ||
    (t.kind === 'Array' && ast.type === 'ArrayExpression') ||
    (t.kind === 'Function' && ast.type === 'ArrowFunctionExpression')
  );
  if (matchingArms.length === 1)
    return check(ast, env, matchingArms[0] ?? bug(), interfaceMap);
  else
    return checkSubtype(ast, env, type, interfaceMap);
}

function checkIntersection(
  ast: ESTree.Expression,
  env: Env,
  type: Type.IntersectionType,
  interfaceMap: InterfaceMap,
): Interface {
  // TODO(jaked)
  // how should we return / display errors here?
  // we don't have a way to show alternatives in editor
  const intfs = type.types.map(type => check(ast, env, type, interfaceMap));
  const error = intfs.find(intf => intf.type === 'err');
  if (error) return error;
  let dynamic: boolean | undefined = undefined;
  intfs.forEach(intf => {
    if (dynamic === undefined) dynamic = intfDynamic(intf);
    else if (intfDynamic(intf) !== dynamic) bug(`expected uniform dynamic`);
  });
  if (dynamic === undefined) bug(`expectd dynamic`);
  return Try.ok({ type, dynamic });
}

function checkSingleton(
  ast: ESTree.Expression,
  env: Env,
  type: Type.SingletonType,
  interfaceMap: InterfaceMap,
): Interface {
  return checkSubtype(ast, env, type, interfaceMap);
}

function checkObject(
  ast: ESTree.Expression,
  env: Env,
  type: Type.ObjectType,
  interfaceMap: InterfaceMap,
): Interface {
  if (ast.type === 'ObjectExpression') {
    const seen = new Set();
    const intfs = ast.properties.map(prop => {
      let name: string;
      switch (prop.key.type) {
        case 'Identifier': name = prop.key.name; break;
        case 'Literal': name = prop.key.value; break;
        default: bug('expected Identifier or Literal prop key name');
      }
      if (seen.has(name)) {
        synth(prop.value, env, interfaceMap);
        // TODO(jaked) this highlights the error but we also need to skip evaluation
        Error.withLocation(prop.key, `duplicate property name '${name}'`, interfaceMap);
        return undefinedIntf;
      } else {
        seen.add(name);
        const fieldType = type.fields.find(({ name: name2 }) => name2 === name)?.type;
        if (fieldType) return check(prop.value, env, fieldType, interfaceMap);
        else {
          // TODO(jaked) this highlights the error but we also need to skip evaluation
          Error.extraField(prop.key, name, interfaceMap);
          synth(prop.value, env, interfaceMap);
          return undefinedIntf;
        }
      }
    });

    const propNames = new Set(ast.properties.map(prop => {
      let name: string;
      switch (prop.key.type) {
        case 'Identifier': name = prop.key.name; break;
        case 'Literal': name = prop.key.value; break;
        default: bug('expected Identifier or Literal prop key name');
      }
      return name;
    }));
    let missingField: undefined | Interface = undefined;
    type.fields.forEach(({ name, type }) => {
      if (!propNames.has(name) && !Type.isSubtype(Type.undefined, type))
        // TODO(jaked) stop after first one? aggregate all?
        missingField = Error.missingField(ast, name, interfaceMap);
    });
    if (missingField) return missingField;

    const error = intfs.find(intf => intf.type === 'err');
    if (error) return error;
    const dynamic = intfs.some(intfDynamic);
    return Try.ok({ type, dynamic })
  }

  else return checkSubtype(ast, env, type, interfaceMap);
}

function checkAbstract(
  ast: ESTree.Expression,
  env: Env,
  type: Type.AbstractType,
  interfaceMap: InterfaceMap,
): Interface {
  return check(ast, env, Type.expand(type), interfaceMap);
}

function checkError(
  ast: ESTree.Expression,
  env: Env,
  type: Type.ErrorType,
  interfaceMap: InterfaceMap,
): Interface {
  synth(ast, env, interfaceMap);
  return Try.err(type.err);
}

function checkHelper(
  ast: ESTree.Expression,
  env: Env,
  type: Type,
  interfaceMap: InterfaceMap,
): Interface {
  switch (type.kind) {
    case 'Tuple':         return checkTuple(ast, env, type, interfaceMap);
    case 'Array':         return checkArray(ast, env, type, interfaceMap);
    case 'Set':           return checkSet(ast, env, type, interfaceMap);
    case 'Map':           return checkMap(ast, env, type, interfaceMap);
    case 'Object':        return checkObject(ast, env, type, interfaceMap);
    case 'Function':      return checkFunction(ast, env, type, interfaceMap);
    case 'Union':         return checkUnion(ast, env, type, interfaceMap);
    case 'Intersection':  return checkIntersection(ast, env, type, interfaceMap);
    case 'Singleton':     return checkSingleton(ast, env, type, interfaceMap);
    case 'Abstract':      return checkAbstract(ast, env, type, interfaceMap);

    case 'Error':         return checkError(ast, env, type, interfaceMap);

    default:              return checkSubtype(ast, env, type, interfaceMap);
  }
}

export function check(
  ast: ESTree.Expression,
  env: Env,
  type: Type,
  interfaceMap: InterfaceMap,
): Interface {
  let intf = checkHelper(ast, env, type, interfaceMap);
  if (intf.type === 'ok' && intf.ok.type.kind === 'Error')
    intf = Try.err(intf.ok.type.err);
  interfaceMap.set(ast, intf);
  return intf;
}
