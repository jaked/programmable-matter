import * as Immutable from 'immutable';
import { bug } from '../../util/bug';
import Type from '../Type';
import * as ESTree from '../ESTree';
import { AstAnnotations } from '../../model';
import { Env } from './env';
import * as Error from './error';
import { synth } from './synth';
import { narrowEnvironment } from './narrow';

function checkSubtype(
  ast: ESTree.Expression,
  env: Env,
  type: Type,
  annots: AstAnnotations,
): Type {
  switch (ast.type) {
    case 'JSXExpressionContainer':
      return check(ast.expression, env, type, annots);

    case 'ConditionalExpression': {
      const testType = synth(ast.test, env, annots);

      switch (testType.kind) {
        // conjecture: we can't learn anything new from narrowing
        // when test is error / singleton
        // (would be nice to prove this, but no harm in not narrowing)

        // when the test has a static value we don't check the untaken branch
        // this is a little weird but consistent with typechecking
        // only as much as needed to run the program

        case 'Error': {
          return check(ast.alternate, env, type, annots);
        }

        case 'Singleton':
          if (testType.value)
            return check(ast.consequent, env, type, annots);
          else
            return check(ast.alternate, env, type, annots);

        default: {
          const envConsequent = narrowEnvironment(env, ast.test, true, annots);
          const envAlternate = narrowEnvironment(env, ast.test, false, annots);
          const consequent = check(ast.consequent, envConsequent, type, annots);
          const alternate = check(ast.alternate, envAlternate, type, annots);
          return Type.union(consequent, alternate);
        }
      }
    }

    case 'SequenceExpression': {
      ast.expressions.forEach((e, i) => {
        if (i < ast.expressions.length - 1)
          synth(e, env, annots);
      });
      return check(ast.expressions[ast.expressions.length - 1], env, type, annots);
    }

    default:
      const actual = synth(ast, env, annots);
      if (Type.isSubtype(actual, type))
        return actual;
      else if (actual.kind === 'Error')
        return actual;
      else
        return Error.expectedType(ast, type, actual, annots);
  }
}

function checkTuple(
  ast: ESTree.Expression,
  env: Env,
  type: Type.TupleType,
  annots: AstAnnotations,
): Type {
  switch (ast.type) {
    case 'ArrayExpression': {
      const types = type.elems.map((expectedType, i) => {
        if (i < ast.elements.length) {
          const type = check(ast.elements[i], env, expectedType, annots);
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
      return checkSubtype(ast, env, type, annots);
  }
}

function checkArray(
  ast: ESTree.Expression,
  env: Env,
  type: Type.ArrayType,
  annots: AstAnnotations,
): Type {
  switch (ast.type) {
    // never called since we check against `reactNodeType`, see comment on checkUnion
    case 'JSXFragment': {
      const expectedType = type.elem;
      const types = ast.children.map(child => {
        const type = check(child, env, expectedType, annots);
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
        const type = check(child, env, expectedType, annots);
        if (type.kind === 'Error' && Type.isSubtype(Type.undefined, expectedType))
          return Type.undefined;
        else
          return type;
      });
      return types.find(type => type.kind === 'Error') ?? type;
    }

    default:
      return checkSubtype(ast, env, type, annots);
  }
}

function checkSet(
  ast: ESTree.Expression,
  env: Env,
  type: Type.SetType,
  annots: AstAnnotations,
): Type {
  switch (ast.type) {
    // TODO(jaked) Set literals?

    default:
      return checkSubtype(ast, env, type, annots);
  }
}

function checkMap(
  ast: ESTree.Expression,
  env: Env,
  type: Type.MapType,
  annots: AstAnnotations,
): Type {
  switch (ast.type) {
    // TODO(jaked) Map literals?

    default:
      return checkSubtype(ast, env, type, annots);
  }
}

function patTypeEnvIdentifier(
  ast: ESTree.Identifier,
  type: Type,
  env: Env,
  annots: AstAnnotations,
): Env {
  if (env.has(ast.name)) {
    Error.withLocation(ast, `identifier ${ast.name} already bound in pattern`, annots);
    return env;
  } else {
    return env.set(ast.name, type);
  }
}

function patTypeEnvObjectPattern(
  ast: ESTree.ObjectPattern,
  t: Type.ObjectType,
  env: Env,
  annots: AstAnnotations,
): Env {
  ast.properties.forEach(prop => {
    const key = prop.key;
    const field = t.fields.find(field => field._1 === key.name)
    if (!field) {
      Error.unknownField(key, key.name, annots);
    } else {
      env = patTypeEnv(prop.value, field._2, env, annots);
    }
  });
  return env;
}

// TODO(jaked) share with synth.ts
function patTypeEnv(
  ast: ESTree.Pattern,
  t: Type,
  env: Env,
  annots: AstAnnotations,
): Env {
  if (ast.type === 'ObjectPattern' && t.kind === 'Object')
    return patTypeEnvObjectPattern(ast, t, env, annots);
  else if (ast.type === 'Identifier')
    return patTypeEnvIdentifier(ast, t, env, annots);
  else {
    Error.withLocation(ast, `incompatible pattern for type ${Type.toString(t)}`, annots);
    return env;
  }
}

function checkFunction(
  ast: ESTree.Expression,
  env: Env,
  type: Type.FunctionType,
  annots: AstAnnotations,
): Type {
  switch (ast.type) {
    case 'ArrowFunctionExpression':
      if (ast.params.length > type.args.size)
        return Error.wrongArgsLength(ast, type.args.size, ast.params.length, annots);
      let patEnv: Env = Immutable.Map(); // TODO(jaked) Env.empty();
      ast.params.forEach((pat, i) => {
        patEnv = patTypeEnv(pat, type.args.get(i) ?? bug(), patEnv, annots);
      });
      const retType = check(ast.body, env.merge(patEnv), type.ret, annots);
      if (retType.kind === 'Error') return retType;
      else return Type.functionType(type.args.toArray(), retType);

    default:
      return checkSubtype(ast, env, type, annots);
  }
}

function checkUnion(
  ast: ESTree.Expression,
  env: Env,
  type: Type.UnionType,
  annots: AstAnnotations,
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
    return check(ast, env, matchingArms.get(0) ?? bug(), annots);
  else
    return checkSubtype(ast, env, type, annots);
}

function checkIntersection(
  ast: ESTree.Expression,
  env: Env,
  type: Type.IntersectionType,
  annots: AstAnnotations,
): Type {
  // TODO(jaked)
  // how should we return / display errors here?
  // we don't have a way to show alternatives in editor
  const types = type.types.map(type => check(ast, env, type, annots));
  return types.find(type => type.kind === 'Error') ?? type;
}

function checkSingleton(
  ast: ESTree.Expression,
  env: Env,
  type: Type.SingletonType,
  annots: AstAnnotations,
): Type {
  return checkSubtype(ast, env, type, annots);
}

function checkObject(
  ast: ESTree.Expression,
  env: Env,
  type: Type.ObjectType,
  annots: AstAnnotations,
): Type {
  if (ast.type === 'ObjectExpression') {
    const types = ast.properties.map(prop => {
      let name: string;
      switch (prop.key.type) {
        case 'Identifier': name = prop.key.name; break;
        case 'Literal': name = prop.key.value; break;
        default: bug('expected Identifier or Literal prop key name');
      }
      const fieldType = type.getFieldType(name);
      if (fieldType) return check(prop.value, env, fieldType, annots);
      else {
        Error.extraField(prop.key, name, annots);
        return synth(prop.value, env, annots);
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
        missingField = Error.missingField(ast, name, annots);
    });

    if (missingField) return missingField;
    return types.find(type => type.kind === 'Error') ?? type;
  }

  else return checkSubtype(ast, env, type, annots);
}

function checkAbstract(
  ast: ESTree.Expression,
  env: Env,
  type: Type.AbstractType,
  annots: AstAnnotations,
): Type {
  return check(ast, env, Type.expand(type), annots);
}

function checkHelper(
  ast: ESTree.Expression,
  env: Env,
  type: Type,
  annots: AstAnnotations,
): Type {
  switch (type.kind) {
    case 'Tuple':         return checkTuple(ast, env, type, annots);
    case 'Array':         return checkArray(ast, env, type, annots);
    case 'Set':           return checkSet(ast, env, type, annots);
    case 'Map':           return checkMap(ast, env, type, annots);
    case 'Object':        return checkObject(ast, env, type, annots);
    case 'Function':      return checkFunction(ast, env, type, annots);
    case 'Union':         return checkUnion(ast, env, type, annots);
    case 'Intersection':  return checkIntersection(ast, env, type, annots);
    case 'Singleton':     return checkSingleton(ast, env, type, annots);
    case 'Abstract':      return checkAbstract(ast, env, type, annots);

    default:              return checkSubtype(ast, env, type, annots);
  }
}

export function check(
  ast: ESTree.Expression,
  env: Env,
  type: Type,
  annots: AstAnnotations,
): Type {
  const actualType = checkHelper(ast, env, type, annots);
  if (annots) annots.set(ast, actualType);
  return actualType;
}
