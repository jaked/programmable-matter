import deepEqual from 'deep-equal';
import { bug } from '../../util/bug';
import Type from '../Type';
import * as ESTree from '../ESTree';
import { Env } from './env';
import * as Throw from './throw';

// best-effort intersection of `a` and `b`
// 'b' may contain Not-types
// the return type will not contain Not-types
export function narrowType(a: Type, b: Type): Type {
  if (deepEqual(a, b)) return a;
  if (a.kind === 'never' || b.kind === 'never') return Type.never;
  if (b.kind === 'unknown') return a;
  if (a.kind === 'Union')
    return Type.union(...a.types.map(a => narrowType(a, b)));
  if (b.kind === 'Union')
    return Type.union(...b.types.map(b => narrowType(a, b)));
  if (a.kind === 'Intersection')
    return Type.intersection(...a.types.map(a => narrowType(a, b)));
  if (b.kind === 'Intersection')
    return Type.intersection(...b.types.map(b => narrowType(a, b)));

  if (b.kind === 'Not') {
    if (Type.equiv(a, b.type)) return Type.never;
    else if (a.kind === 'boolean' && b.type.kind === 'Singleton' && b.type.base.kind == 'boolean') {
      if (b.type.value === true) return Type.singleton(false);
      else return Type.singleton(true);
    }
    else return a;
  }

  if (a.kind === 'Singleton' && b.kind === 'Singleton')
    return (a.value === b.value) ? a : Type.never;
  if (a.kind === 'Singleton')
    return (a.base.kind === b.kind) ? a : Type.never;
  if (b.kind === 'Singleton')
    return (b.base.kind === a.kind) ? b : Type.never;

  if (a.kind === 'Object' && b.kind === 'Object') {
    const type = Type.object(a.fields.map(aFieldType => {
      const field = aFieldType.field;
      const bFieldType = b.fields.find(bFieldType => bFieldType.field === field);
      if (bFieldType) {
        return { field, type: narrowType(aFieldType.type, bFieldType.type) }
      }
      else return aFieldType;
      // if there are  fields in `b` that are not in `a`, ignore them
    }));
    if (type.fields.some(({ type }) => type.kind === 'never')) {
      return Type.never;
    } else {
      return type;
    }
  }

  return Type.never;
}

function narrowExpression(
  env: Env,
  ast: ESTree.Expression,
  otherType: Type
): Env {
  switch (ast.type) {
    case 'Identifier': {
      const identType = env.get(ast.name);
      if (identType) {
        const type = narrowType(identType, otherType);
        return env.set(ast.name, type);
      }
      else if (ast.name === 'undefined') return env;
      else return bug('expected bound identifier');
    }

    case 'MemberExpression': {
      if (ast.computed) return env; // TODO(jaked) handle computed cases
      if (ast.property.type !== 'Identifier') return bug('expected Identifier');
      return narrowExpression(
        env,
        ast.object,
        Type.object({ [ast.property.name]: otherType }));
    }

    default: return env;
  }
}

// narrow the type of identifiers appearing in `ast` to reflect what
// we can deduce when the expression is assumed to be true or false.
// `ast` has already been typechecked so we can use `etype` fields in it.
export function narrowEnvironment(
  env: Env,
  ast: ESTree.Expression,
  assume: boolean
): Env {
  switch (ast.type) {
    case 'UnaryExpression':
      if (ast.operator === '!') {
        return narrowEnvironment(env, ast.argument, !assume);
      } else {
        // TODO(jaked) handle typeof
        if (assume) {
          return narrowExpression(env, ast, Type.notFalsy);
        } else {
          return narrowExpression(env, ast, Type.notTruthy);
        }
      }

    case 'LogicalExpression':
      switch (ast.operator) {
        case '&&':
          if (assume) {
            env = narrowEnvironment(env, ast.left, true);
            return narrowEnvironment(env, ast.right, true);
          } else return env;
        case '||':
          if (!assume) {
            env = narrowEnvironment(env, ast.left, false);
            return narrowEnvironment(env, ast.right, false);
          } else return env;
        default:
          return bug(`unexpected AST ${ast.operator}`);
      }

    case 'BinaryExpression':
      if (ast.operator === '===' && assume || ast.operator === '!==' && !assume) {
        if (!ast.right.etype) return bug('expected etype');
        if (!ast.left.etype) return bug('expected etype');
        env = narrowExpression(env, ast.left, ast.right.etype.get());
        return narrowExpression(env, ast.right, ast.left.etype.get());
      } else if (ast.operator === '!==' && assume || ast.operator === '===' && !assume) {
        if (!ast.right.etype) return bug('expected etype');
        if (!ast.left.etype) return bug('expected etype');
        env = narrowExpression(env, ast.left, Type.not(ast.right.etype.get()));
        return narrowExpression(env, ast.right, Type.not(ast.left.etype.get()));
      } else {
        return Throw.withLocation(ast, 'unimplemented');
      }

    default:
      if (assume) {
        return narrowExpression(env, ast, Type.notFalsy);
      } else {
        return narrowExpression(env, ast, Type.notTruthy);
      }
  }
}
