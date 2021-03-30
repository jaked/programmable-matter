import * as Immutable from 'immutable';
import { bug } from '../../util/bug';
import Type from '../Type';
import * as ESTree from '../ESTree';
import { TypesMap } from '../../model';
import { Env } from './env';
import * as Error from './error';
import { synth, synthAndThen } from './synth';
import { narrowEnvironment } from './narrow';

function checkSubtype(
  ast: ESTree.Expression,
  env: Env,
  type: Type,
  typesMap: TypesMap,
): Type {
  switch (ast.type) {
    case 'JSXExpressionContainer':
      return check(ast.expression, env, type, typesMap);

    case 'ConditionalExpression': {
      const envConsequent = narrowEnvironment(env, ast.test, true, typesMap);
      const envAlternate = narrowEnvironment(env, ast.test, false, typesMap);

      return synthAndThen(ast.test, env, typesMap, test => {
        if (Type.isTruthy(test)) {
          synth(ast.alternate, envAlternate, typesMap);
          return check(ast.consequent, envConsequent, type, typesMap)
        } else if (Type.isFalsy(test)) {
          synth(ast.consequent, envConsequent, typesMap);
          return check(ast.alternate, envAlternate, type, typesMap);
        } else {
          const consequent = check(ast.consequent, envConsequent, type, typesMap);
          const alternate = check(ast.alternate, envAlternate, type, typesMap);
          return Type.union(consequent, alternate);
        }
      });
    }

    case 'SequenceExpression': {
      ast.expressions.forEach((e, i) => {
        if (i < ast.expressions.length - 1)
          synth(e, env, typesMap);
      });
      return check(ast.expressions[ast.expressions.length - 1], env, type, typesMap);
    }

    default:
      const actual = synth(ast, env, typesMap);
      if (Type.isSubtype(actual, type))
        return actual;
      else if (actual.kind === 'Error')
        return actual;
      else
        return Error.expectedType(ast, type, actual, typesMap);
  }
}

function checkTuple(
  ast: ESTree.Expression,
  env: Env,
  type: Type.TupleType,
  typesMap: TypesMap,
): Type {
  switch (ast.type) {
    case 'ArrayExpression': {
      const types = type.elems.map((expectedType, i) => {
        if (i < ast.elements.length) {
          const type = check(ast.elements[i], env, expectedType, typesMap);
          if (type.kind === 'Error' && Type.isSubtype(Type.undefined, expectedType))
            return Type.undefined;
          else
            return type;
        } else if (Type.isSubtype(Type.undefined, expectedType)) {
          return Type.undefined;
        } else
          return Error.withLocation(ast, 'expected ${type.elems.size} elements');
      });
      return types.find(type => type.kind === 'Error') ?? type;
    }

    default:
      return checkSubtype(ast, env, type, typesMap);
  }
}

function checkArray(
  ast: ESTree.Expression,
  env: Env,
  type: Type.ArrayType,
  typesMap: TypesMap,
): Type {
  switch (ast.type) {
    // never called since we check against `reactNodeType`, see comment on checkUnion
    case 'JSXFragment': {
      const expectedType = type.elem;
      const types = ast.children.map(child => {
        const type = check(child, env, expectedType, typesMap);
        if (type.kind === 'Error' && Type.isSubtype(Type.undefined, expectedType))
          return Type.undefined;
        else
          return type;
      });
      return types.find(type => type.kind === 'Error') ?? type;
    }

    case 'ArrayExpression': {
      const expectedType = type.elem;
      const types = ast.elements.map(child => {
        const type = check(child, env, expectedType, typesMap);
        if (type.kind === 'Error' && Type.isSubtype(Type.undefined, expectedType))
          return Type.undefined;
        else
          return type;
      });
      return types.find(type => type.kind === 'Error') ?? type;
    }

    default:
      return checkSubtype(ast, env, type, typesMap);
  }
}

function checkSet(
  ast: ESTree.Expression,
  env: Env,
  type: Type.SetType,
  typesMap: TypesMap,
): Type {
  switch (ast.type) {
    // TODO(jaked) Set literals?

    default:
      return checkSubtype(ast, env, type, typesMap);
  }
}

function checkMap(
  ast: ESTree.Expression,
  env: Env,
  type: Type.MapType,
  typesMap: TypesMap,
): Type {
  switch (ast.type) {
    // TODO(jaked) Map literals?

    default:
      return checkSubtype(ast, env, type, typesMap);
  }
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

// TODO(jaked) share with synth.ts
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

function checkFunction(
  ast: ESTree.Expression,
  env: Env,
  type: Type.FunctionType,
  typesMap: TypesMap,
): Type {
  switch (ast.type) {
    case 'ArrowFunctionExpression':
      if (ast.params.length > type.args.size)
        return Error.wrongArgsLength(ast, type.args.size, ast.params.length, typesMap);
      let patEnv: Env = Immutable.Map(); // TODO(jaked) Env.empty();
      ast.params.forEach((pat, i) => {
        patEnv = patTypeEnv(pat, type.args.get(i) ?? bug(), patEnv, typesMap);
      });
      env = env.merge(patEnv);
      const body = ast.body;
      if (body.type === 'BlockStatement') {
        body.body.forEach((stmt, i) => {
          if (i < body.body.length - 1) {
            switch (stmt.type) {
              case 'ExpressionStatement':
                return synth(stmt.expression, env, typesMap);
              default:
                bug(`unimplemented ${stmt.type}`);
            }
          }
        });
        if (body.body.length === 0) {
          const actual = Type.undefined;
          if (Type.isSubtype(actual, type))
            return actual;
          else
            return Error.expectedType(ast, type, actual, typesMap);

        } else {
          const stmt = body.body[body.body.length - 1];
          switch (stmt.type) {
            case 'ExpressionStatement': {
              const retType = check(stmt.expression, env, type.ret, typesMap);
              if (retType.kind === 'Error') return retType;
              else return Type.functionType(type.args.toArray(), retType);
            }
            default:
              bug(`unimplemented ${stmt.type}`);
          }
        }

      } else {
        const retType = check(body, env, type.ret, typesMap);
        if (retType.kind === 'Error') return retType;
        else return Type.functionType(type.args.toArray(), retType);
      }

    default:
      return checkSubtype(ast, env, type, typesMap);
  }
}

function checkUnion(
  ast: ESTree.Expression,
  env: Env,
  type: Type.UnionType,
  typesMap: TypesMap,
): Type {
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
  if (matchingArms.size === 1)
    return check(ast, env, matchingArms.get(0) ?? bug(), typesMap);
  else
    return checkSubtype(ast, env, type, typesMap);
}

function checkIntersection(
  ast: ESTree.Expression,
  env: Env,
  type: Type.IntersectionType,
  typesMap: TypesMap,
): Type {
  // TODO(jaked)
  // how should we return / display errors here?
  // we don't have a way to show alternatives in editor
  const types = type.types.map(type => check(ast, env, type, typesMap));
  return types.find(type => type.kind === 'Error') ?? type;
}

function checkSingleton(
  ast: ESTree.Expression,
  env: Env,
  type: Type.SingletonType,
  typesMap: TypesMap,
): Type {
  return checkSubtype(ast, env, type, typesMap);
}

function checkObject(
  ast: ESTree.Expression,
  env: Env,
  type: Type.ObjectType,
  typesMap: TypesMap,
): Type {
  if (ast.type === 'ObjectExpression') {
    const seen = new Set();
    const types = ast.properties.map(prop => {
      let name: string;
      switch (prop.key.type) {
        case 'Identifier': name = prop.key.name; break;
        case 'Literal': name = prop.key.value; break;
        default: bug('expected Identifier or Literal prop key name');
      }
      if (seen.has(name)) {
        synth(prop.value, env, typesMap);
        // TODO(jaked) this highlights the error but we also need to skip evaluation
        Error.withLocation(prop.key, `duplicate property name '${name}'`, typesMap);
        return Type.undefined;
      } else {
        seen.add(name);
        const fieldType = type.getFieldType(name);
        if (fieldType) return check(prop.value, env, fieldType, typesMap);
        else {
          // TODO(jaked) this highlights the error but we also need to skip evaluation
          Error.extraField(prop.key, name, typesMap);
          synth(prop.value, env, typesMap);
          return Type.undefined;
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
    let missingField: undefined | Type.ErrorType = undefined;
    type.fields.forEach(({ _1: name, _2: type }) => {
      if (!propNames.has(name) && !Type.isSubtype(Type.undefined, type))
        // TODO(jaked) stop after first one? aggregate all?
        missingField = Error.missingField(ast, name, typesMap);
    });

    if (missingField) return missingField;
    return types.find(type => type.kind === 'Error') ?? type;
  }

  else return checkSubtype(ast, env, type, typesMap);
}

function checkAbstract(
  ast: ESTree.Expression,
  env: Env,
  type: Type.AbstractType,
  typesMap: TypesMap,
): Type {
  return check(ast, env, Type.expand(type), typesMap);
}

function checkHelper(
  ast: ESTree.Expression,
  env: Env,
  type: Type,
  typesMap: TypesMap,
): Type {
  switch (type.kind) {
    case 'Tuple':         return checkTuple(ast, env, type, typesMap);
    case 'Array':         return checkArray(ast, env, type, typesMap);
    case 'Set':           return checkSet(ast, env, type, typesMap);
    case 'Map':           return checkMap(ast, env, type, typesMap);
    case 'Object':        return checkObject(ast, env, type, typesMap);
    case 'Function':      return checkFunction(ast, env, type, typesMap);
    case 'Union':         return checkUnion(ast, env, type, typesMap);
    case 'Intersection':  return checkIntersection(ast, env, type, typesMap);
    case 'Singleton':     return checkSingleton(ast, env, type, typesMap);
    case 'Abstract':      return checkAbstract(ast, env, type, typesMap);

    default:              return checkSubtype(ast, env, type, typesMap);
  }
}

export function check(
  ast: ESTree.Expression,
  env: Env,
  type: Type,
  typesMap: TypesMap,
): Type {
  const actualType = checkHelper(ast, env, type, typesMap);
  if (typesMap) typesMap.set(ast, actualType);
  return actualType;
}
