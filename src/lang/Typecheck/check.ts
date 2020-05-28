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
import * as Throw from './throw';
import { synth } from './synth';
import { narrowEnvironment } from './narrow';

function checkSubtype(
  ast: ESTree.Expression,
  env: Env,
  type: Type,
  annots?: AstAnnotations,
  trace?: Trace,
) {
  switch (ast.type) {
    case 'JSXExpressionContainer':
      return check(ast.expression, env, type, annots, trace);

    case 'ConditionalExpression': {
      const testType = synth(ast.test, env, annots, trace);

      if (testType.kind === 'Singleton') {
        if (testType.value) {
          const envConsequent = narrowEnvironment(env, ast.test, true, annots);
          return check(ast.consequent, envConsequent, type, annots, trace);
        } else {
          const envAlternate = narrowEnvironment(env, ast.test, false, annots);
          return check(ast.alternate, envAlternate, type, annots, trace);
        }
      } else {
        const envConsequent = narrowEnvironment(env, ast.test, true, annots, trace);
        const envAlternate = narrowEnvironment(env, ast.test, false, annots, trace);
        check(ast.consequent, envConsequent, type, annots, trace);
        return check(ast.alternate, envAlternate, type, annots, trace);
      }
    }

    case 'SequenceExpression': {
      ast.expressions.forEach((e, i) => {
        if (i < ast.expressions.length - 1)
          check(e, env, Type.undefined, annots, trace);
      });
      return check(ast.expressions[ast.expressions.length - 1], env, type, annots, trace);
    }

    default:
      const actual = synth(ast, env, annots, trace);
      if (!Type.isSubtype(actual, type))
        Throw.expectedType(ast, type, actual, annots);
  }
}

function checkTuple(
  ast: ESTree.Expression,
  env: Env,
  type: Type.TupleType,
  annots?: AstAnnotations,
  trace?: Trace,
) {
  switch (ast.type) {
    case 'ArrayExpression':
      if (ast.elements.length !== type.elems.size) {
        return Throw.expectedType(ast, type, undefined, annots);
      } else {
        return ast.elements.forEach((elem, i) =>
          check(elem, env, type.elems.get(i) ?? bug(), annots, trace)
        );
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
) {
  switch (ast.type) {
    // never called since we check against `reactNodeType`, see comment on checkUnion
    case 'JSXFragment':
      return ast.children.forEach(child =>
        check(child, env, type, annots, trace)
      );

    case 'ArrayExpression':
      return ast.elements.forEach(elem =>
        check(elem, env, type.elem, annots, trace)
      );

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
) {
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
) {
  switch (ast.type) {
    // TODO(jaked) Map literals?

    default:
      return checkSubtype(ast, env, type, annots, trace);
  }
}

function checkPatEnv(
  pat: ESTree.Pattern,
  env: Env,
  type: Type,
  annots?: AstAnnotations,
  trace?: Trace,
): Env {
  if (pat.type === 'Identifier') {
    if (env.has(pat.name)) Throw.duplicateIdentifier(pat, pat.name, annots);
    else return env.set(pat.name, type);

  } else if (pat.type === 'ObjectPattern' && type.kind === 'Object') {
    pat.properties.forEach(prop => {
      const propType = type.getFieldType(prop.key.name) ?? Throw.extraField(prop, prop.key.name, annots);
      env = checkPatEnv(prop.value, env, propType, annots);
    });
    return env;

  } else {
    bug(`unimplemented pattern type ${(pat as ESTree.Pattern).type}`);
  }
}

function checkFunction(
  ast: ESTree.Expression,
  env: Env,
  type: Type.FunctionType,
  annots?: AstAnnotations,
  trace?: Trace,
) {
  switch (ast.type) {
    case 'ArrowFunctionExpression':
      if (ast.params.length > type.args.size)
        Throw.wrongArgsLength(ast, type.args.size, ast.params.length, annots);
      let patEnv: Env = Immutable.Map(); // TODO(jaked) Env.empty();
      ast.params.forEach((pat, i) => {
        patEnv = checkPatEnv(pat, patEnv, type.args.get(i) ?? bug(), annots, trace);
      });
      return check(ast.body, env.merge(patEnv), type.ret, annots, trace);

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
) {
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
) {
  return type.types.map(type => check(ast, env, type, annots, trace));
}

function checkSingleton(
  ast: ESTree.Expression,
  env: Env,
  type: Type.SingletonType,
  annots?: AstAnnotations,
  trace?: Trace
) {
  return checkSubtype(ast, env, type, annots, trace);
}

function checkObject(
  ast: ESTree.Expression,
  env: Env,
  type: Type.ObjectType,
  annots?: AstAnnotations,
  trace?: Trace,
) {
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
      type.fields.forEach(({ _1: name, _2: type }) => {
        if (!propNames.has(name) && !Type.isSubtype(Type.undefined, type))
          return Throw.missingField(ast, name, annots);
      });
      const fieldTypes = new Map(type.fields.map(({ _1, _2 }) => [_1, _2]));
      return ast.properties.map(prop => {
        let name: string;
        switch (prop.key.type) {
          case 'Identifier': name = prop.key.name; break;
          case 'Literal': name = prop.key.value; break;
          default: throw new Error('expected Identifier or Literal prop key name');
        }
        const type = fieldTypes.get(name);
        if (type) return check(prop.value, env, type, annots, trace);
        else {
          return Throw.extraField(prop.key, name, annots);
        }
      }).some(x => x);

    default:
      return checkSubtype(ast, env, type, annots, trace);
  }
}

function checkAbstract(
  ast: ESTree.Expression,
  env: Env,
  type: Type.AbstractType,
  annots?: AstAnnotations,
  trace?: Trace
) {
  switch (type.label) {
    case 'React.ReactNode': {
      if (type.params.size !== 0) Throw.wrongParamsLength(ast, 0, type.params.size, annots);
      return Type.reactNodeType;
    }

    // TODO(jaked)
    // this seems to be somewhat deprecated, see
    // https://github.com/typescript-cheatsheets/react-typescript-cheatsheet#function-components
    // but it is useful to avoid a separate `type Props = ...`
    case 'React.FC':
    case 'React.FunctionComponent': {
      if (type.params.size !== 1) Throw.wrongParamsLength(ast, 1, type.params.size, annots);
      const param = type.params.get(0) ?? bug();
      if (param.kind !== 'Object') Throw.withLocation(ast, `expected object param, got ${param.kind}`);
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
) {
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
) {
  try {
    if (trace) trace.time(Recast.print(ast).code, () => checkHelper(ast, env, type, annots, trace));
    else checkHelper(ast, env, type, annots, trace);
    if (annots) annots.set(ast, Try.ok(type));
  } catch (e) {
    if (annots) annots.set(ast, Try.err(e));
    throw e;
  }
}
