import * as Immutable from 'immutable';
import Recast from 'recast/main';
import { bug } from '../../util/bug';
import Trace from '../../util/Trace';
import Try from '../../util/Try';
import { Tuple2 } from '../../util/Tuple';
import Type from '../Type';
import * as ESTree from '../ESTree';
import { AstAnnotations } from '../../data';
import { Env } from './env';
import * as Error from './error';
import { synth } from './synth';
import { narrowEnvironment } from './narrow';

function checkSubtype(
  ast: ESTree.Expression,
  env: Env,
  type: Type,
  annots?: AstAnnotations,
  trace?: Trace,
): Type {
  switch (ast.type) {
    case 'JSXExpressionContainer':
      return check(ast.expression, env, type, annots, trace);

    case 'ConditionalExpression': {
      const testType = synth(ast.test, env, annots, trace);
      const envConsequent = narrowEnvironment(env, ast.test, true, annots, trace);
      const envAlternate = narrowEnvironment(env, ast.test, false, annots, trace);
      const consequent = check(ast.consequent, envConsequent, type, annots, trace);
      const alternate = check(ast.alternate, envAlternate, type, annots, trace);

      switch (testType.kind) {
        case 'Error':
          return alternate;

        case 'Singleton':
          if (testType.value) {
            return consequent;
          } else {
            return alternate;
          }

        default:
          return Type.union(consequent, alternate);
      }
    }

    case 'SequenceExpression': {
      ast.expressions.forEach((e, i) => {
        if (i < ast.expressions.length - 1)
          // TODO(jaked) undefined or error
          check(e, env, Type.undefined, annots, trace);
      });
      return check(ast.expressions[ast.expressions.length - 1], env, type, annots, trace);
    }

    default:
      const actual = synth(ast, env, annots, trace);
      if (Type.isSubtype(actual, type))
        return actual;
      else
        return Error.expectedType(ast, type, actual, annots);
  }
}

function checkTuple(
  ast: ESTree.Expression,
  env: Env,
  type: Type.TupleType,
  annots?: AstAnnotations,
  trace?: Trace,
): Type {
  switch (ast.type) {
    case 'ArrayExpression':
      // TODO(jaked) long array acceptable
      if (ast.elements.length !== type.elems.size) {
        return Error.expectedType(ast, type, undefined, annots);
      } else {
        const types = ast.elements.map((elem, i) =>
          check(elem, env, type.elems.get(i) ?? bug(), annots, trace)
        );
        // TODO(jaked) error ok where undefined ok
        const error = types.find(type => type.kind === 'Error');
        if (error) return error;
        else return type;
      }

    default:
      return checkSubtype(ast, env, type, annots, trace);
  }
}

function checkArray(
  ast: ESTree.Expression,
  env: Env,
  type: Type.ArrayType,
  annots?: AstAnnotations,
  trace?: Trace,
): Type {
  switch (ast.type) {
    // never called since we check against `reactNodeType`, see comment on checkUnion
    case 'JSXFragment': {
      const types = ast.children.map(child =>
        check(child, env, type, annots, trace)
      );
      // TODO(jaked) error ok where undefined ok
      const error = types.find(type => type.kind === 'Error');
      if (error) return error;
      else return type;
    }

    case 'ArrayExpression': {
      const types = ast.elements.map(elem =>
        check(elem, env, type.elem, annots, trace)
      );
      // TODO(jaked) error ok where undefined ok
      const error = types.find(type => type.kind === 'Error');
      if (error) return error;
      else return type;
    }

      default:
      return checkSubtype(ast, env, type, annots, trace);
  }
}

function checkSet(
  ast: ESTree.Expression,
  env: Env,
  type: Type.SetType,
  annots?: AstAnnotations,
  trace?: Trace,
): Type {
  switch (ast.type) {
    // TODO(jaked) Set literals?

    default:
      return checkSubtype(ast, env, type, annots, trace);
  }
}

function checkMap(
  ast: ESTree.Expression,
  env: Env,
  type: Type.MapType,
  annots?: AstAnnotations,
  trace?: Trace,
): Type {
  switch (ast.type) {
    // TODO(jaked) Map literals?

    default:
      return checkSubtype(ast, env, type, annots, trace);
  }
}

function patTypeEnvIdentifier(
  ast: ESTree.Identifier,
  type: Type,
  env: Env,
  annots?: AstAnnotations,
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
  annots?: AstAnnotations,
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
  annots?: AstAnnotations,
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
  annots?: AstAnnotations,
  trace?: Trace,
): Type {
  switch (ast.type) {
    case 'ArrowFunctionExpression':
      if (ast.params.length > type.args.size)
        return Error.wrongArgsLength(ast, type.args.size, ast.params.length, annots);
      let patEnv: Env = Immutable.Map(); // TODO(jaked) Env.empty();
      ast.params.forEach((pat, i) => {
        patEnv = patTypeEnv(pat, type.args.get(i) ?? bug(), patEnv, annots);
      });
      const retType = check(ast.body, env.merge(patEnv), type.ret, annots, trace);
      if (retType.kind === 'Error') return retType;
      else return Type.functionType(type.args.toArray(), retType);

    default:
      return checkSubtype(ast, env, type, annots, trace);
  }
}

function checkUnion(
  ast: ESTree.Expression,
  env: Env,
  type: Type.UnionType,
  annots?: AstAnnotations,
  trace?: Trace
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
    return check(ast, env, matchingArms.get(0) ?? bug(), annots, trace);
  else
    return checkSubtype(ast, env, type, annots, trace);
}

function checkIntersection(
  ast: ESTree.Expression,
  env: Env,
  type: Type.IntersectionType,
  annots?: AstAnnotations,
  trace?: Trace,
): Type {
  // TODO(jaked)
  // how should we return / display errors here?
  // we don't have a way to show alternatives in editor
  const types = type.types.map(type => check(ast, env, type, annots, trace));
  const error = types.find(type => type.kind === 'Error');
  if (error) return error;
  else return type;
}

function checkSingleton(
  ast: ESTree.Expression,
  env: Env,
  type: Type.SingletonType,
  annots?: AstAnnotations,
  trace?: Trace
): Type {
  return checkSubtype(ast, env, type, annots, trace);
}

function checkObject(
  ast: ESTree.Expression,
  env: Env,
  type: Type.ObjectType,
  annots?: AstAnnotations,
  trace?: Trace,
): Type {
  if (ast.type === 'ObjectExpression') {
    const propNames = new Set(ast.properties.map(prop => {
      let name: string;
      switch (prop.key.type) {
        case 'Identifier': name = prop.key.name; break;
        case 'Literal': name = prop.key.value; break;
        default: bug('expected Identifier or Literal prop key name');
      }
      return name;
    }));
    type.fields.forEach(({ _1: name, _2: type }) => {
      if (!propNames.has(name) && !Type.isSubtype(Type.undefined, type))
        // TODO(jaked) stop after first one? aggregate all?
        Error.missingField(ast, name, annots);
    });
    const types = ast.properties.map(prop => {
      let name: string;
      switch (prop.key.type) {
        case 'Identifier': name = prop.key.name; break;
        case 'Literal': name = prop.key.value; break;
        default: bug('expected Identifier or Literal prop key name');
      }
      const fieldType = type.getFieldType(name);
      if (fieldType) return check(prop.value, env, fieldType, annots, trace);
      else {
        Error.extraField(prop.key, name, annots);
        return synth(prop.value, env, annots, trace);
      }
    });
    const error = types.find(type => type.kind === 'Error');
    if (error) return error;
    else return type;
  }

  else return checkSubtype(ast, env, type, annots, trace);
}

function checkAbstract(
  ast: ESTree.Expression,
  env: Env,
  type: Type.AbstractType,
  annots?: AstAnnotations,
  trace?: Trace
): Type {
  switch (type.label) {
    case 'React.ReactNode': {
      if (type.params.size !== 0)
        // TODO(jaked) should assume valid types here, check it at construction
        return Error.wrongParamsLength(ast, 0, type.params.size, annots);
      return Type.reactNodeType;
    }

    // TODO(jaked)
    // this seems to be somewhat deprecated, see
    // https://github.com/typescript-cheatsheets/react-typescript-cheatsheet#function-components
    // but it is useful to avoid a separate `type Props = ...`
    case 'React.FC':
    case 'React.FunctionComponent': {
      if (type.params.size !== 1)
        return Error.wrongParamsLength(ast, 1, type.params.size, annots);
      const param = type.params.get(0) ?? bug();
      if (param.kind !== 'Object')
        return Error.withLocation(ast, `expected object param, got ${param.kind}`);
      // TODO(jaked) catch multiple definition of `children`
      const paramWithChildren = Type.object(param.fields.push(Tuple2('children', Type.array(Type.reactNodeType))));
      const expandedType = Type.functionType([ paramWithChildren ], Type.reactNodeType);
      return check(ast, env, expandedType, annots, trace);
    }

    default:
      return checkSubtype(ast, env, type, annots, trace);
  }
}

function checkHelper(
  ast: ESTree.Expression,
  env: Env,
  type: Type,
  annots?: AstAnnotations,
  trace?: Trace,
): Type {
  switch (type.kind) {
    case 'Tuple':         return checkTuple(ast, env, type, annots, trace);
    case 'Array':         return checkArray(ast, env, type, annots, trace);
    case 'Set':           return checkSet(ast, env, type, annots, trace);
    case 'Map':           return checkMap(ast, env, type, annots, trace);
    case 'Object':        return checkObject(ast, env, type, annots, trace);
    case 'Function':      return checkFunction(ast, env, type, annots, trace);
    case 'Union':         return checkUnion(ast, env, type, annots, trace);
    case 'Intersection':  return checkIntersection(ast, env, type, annots, trace);
    case 'Singleton':     return checkSingleton(ast, env, type, annots, trace);
    case 'Abstract':      return checkAbstract(ast, env, type, annots, trace);

    default:              return checkSubtype(ast, env, type, annots, trace);
  }
}

export function check(
  ast: ESTree.Expression,
  env: Env,
  type: Type,
  annots?: AstAnnotations,
  trace?: Trace
): Type {
  try {
    if (trace) {
      return trace.time(Recast.print(ast).code, () => {
        const actualType = checkHelper(ast, env, type, annots, trace);
        if (annots) annots.set(ast, actualType);
        return actualType;
      });
    } else {
      const actualType = checkHelper(ast, env, type, annots, trace);
      if (annots) annots.set(ast, actualType);
      return actualType;
    }
  } catch (e) {
    if (annots) annots.set(ast, Type.error(e));
    throw e;
  }
}
