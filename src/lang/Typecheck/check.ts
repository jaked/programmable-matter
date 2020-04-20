import { bug } from '../../util/bug';
import Try from '../../util/Try';
import Type from '../Type';
import * as ESTree from '../ESTree';
import { AstAnnotations } from '../../data';
import { Env } from './env';
import * as Throw from './throw';
import { synth } from './synth';
import { narrowEnvironment } from './narrow';

function checkSubtype(ast: ESTree.Expression, env: Env, type: Type, annots: AstAnnotations) {
  switch (ast.type) {
    case 'JSXExpressionContainer':
      return check(ast.expression, env, type, annots);

    case 'ConditionalExpression': {
      const testType = synth(ast.test, env, annots);

      if (testType.kind === 'Singleton') {
        if (testType.value) {
          const envConsequent = narrowEnvironment(env, ast.test, true, annots);
          return check(ast.consequent, envConsequent, type, annots);
        } else {
          const envAlternate = narrowEnvironment(env, ast.test, false, annots);
          return check(ast.alternate, envAlternate, type, annots);
        }
      } else {
        const envConsequent = narrowEnvironment(env, ast.test, true, annots);
        const envAlternate = narrowEnvironment(env, ast.test, false, annots);
        check(ast.consequent, envConsequent, type, annots);
        return check(ast.alternate, envAlternate, type, annots);
      }
    }

    default:
      const actual = synth(ast, env, annots);
      if (!Type.isSubtype(actual, type))
        Throw.expectedType(ast, type, actual, annots);
  }
}

function checkTuple(ast: ESTree.Expression, env: Env, type: Type.TupleType, annots: AstAnnotations) {
  switch (ast.type) {
    case 'ArrayExpression':
      if (ast.elements.length !== type.elems.length) {
        return Throw.expectedType(ast, type, undefined, annots);
      } else {
        return ast.elements.forEach((elem, i) =>
          check(elem, env, type.elems[i], annots)
        );
      }

    default:
      return checkSubtype(ast, env, type, annots);
  }
}

function checkArray(ast: ESTree.Expression, env: Env, type: Type.ArrayType, annots: AstAnnotations) {
  switch (ast.type) {
    // never called since we check against `reactNodeType`, see comment on checkUnion
    case 'JSXFragment':
      return ast.children.forEach(child =>
        check(child, env, type, annots)
      );

    case 'ArrayExpression':
      return ast.elements.forEach(elem =>
        check(elem, env, type.elem, annots)
      );

    default:
      return checkSubtype(ast, env, type, annots);
  }
}

function checkSet(ast: ESTree.Expression, env: Env, type: Type.SetType, annots: AstAnnotations) {
  switch (ast.type) {
    // TODO(jaked) Set literals?

    default:
      return checkSubtype(ast, env, type, annots);
  }
}

function checkMap(ast: ESTree.Expression, env: Env, type: Type.MapType, annots: AstAnnotations) {
  switch (ast.type) {
    // TODO(jaked) Map literals?

    default:
      return checkSubtype(ast, env, type, annots);
  }
}

function checkFunction(ast: ESTree.Expression, env: Env, type: Type.FunctionType, annots: AstAnnotations) {
  switch (ast.type) {
    case 'ArrowFunctionExpression':
      if (type.args.length != ast.params.length)
        Throw.wrongArgsLength(ast, type.args.length, ast.params.length, annots);
      ast.params.forEach((pat, i) => {
        switch (pat.type) {
          case 'Identifier':
            env = env.set(pat.name, type.args[i]);
            break;

          default:
            return bug('unexpected AST type ' + (pat as ESTree.Pattern).type);
        }
      });
      return check(ast.body, env, type.ret, annots);

    default:
      return checkSubtype(ast, env, type, annots);
  }
}

function checkUnion(ast: ESTree.Expression, env: Env, type: Type.UnionType, annots: AstAnnotations) {
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
    return check(ast, env, matchingArms[0], annots);
  else
    return checkSubtype(ast, env, type, annots);
}

function checkIntersection(ast: ESTree.Expression, env: Env, type: Type.IntersectionType, annots: AstAnnotations) {
  // TODO(jaked)
  // we check that the expression is an atom for each arm of the intersection
  // but it should not matter what type we check with
  // (really we are just piggybacking on the tree traversal here)
  // need to be careful once we have function types carrying an atom effect
  // e.g. a type (T =(true)> U & T =(false)> U) is well-formed
  // but we don't want to union / intersect atom effects
  return type.types.map(type => check(ast, env, type, annots));
}

function checkSingleton(ast: ESTree.Expression, env: Env, type: Type.SingletonType, annots: AstAnnotations) {
  return checkSubtype(ast, env, type, annots);
}

function checkObject(ast: ESTree.Expression, env: Env, type: Type.ObjectType, annots: AstAnnotations) {
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
      type.fields.forEach(({ field, type }) => {
        if (!propNames.has(field) && !Type.isSubtype(Type.undefined, type))
          return Throw.missingField(ast, field, annots);
      });
      const fieldTypes = new Map(type.fields.map(({ field, type }) => [field, type]));
      return ast.properties.map(prop => {
        let name: string;
        switch (prop.key.type) {
          case 'Identifier': name = prop.key.name; break;
          case 'Literal': name = prop.key.value; break;
          default: throw new Error('expected Identifier or Literal prop key name');
        }
        const type = fieldTypes.get(name);
        if (type) return check(prop.value, env, type, annots);
        else {
          return Throw.extraField(prop.key, name, annots);
        }
      }).some(x => x);

    default:
      return checkSubtype(ast, env, type, annots);
  }
}

function checkHelper(ast: ESTree.Expression, env: Env, type: Type, annots: AstAnnotations) {
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

    default:              return checkSubtype(ast, env, type, annots);
  }
}

export function check(ast: ESTree.Expression, env: Env, type: Type, annots: AstAnnotations) {
  try {
    checkHelper(ast, env, type, annots);
    if (annots) annots.set(ast, Try.ok(type));
  } catch (e) {
    if (annots) annots.set(ast, Try.err(e));
    throw e;
  }
}
