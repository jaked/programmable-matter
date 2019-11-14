import { bug } from '../../util/bug';
import Type from '../Type';
import * as ESTree from '../ESTree';
import { Env } from './env';
import * as Throw from './throw';

function narrowExpression(
  env: Env,
  ast: ESTree.Expression,
  otherType: Type
): Env {
  switch (ast.type) {
    case 'Identifier': {
      const identType = env.get(ast.name) || bug('expected bound identifier');
      const type = Type.intersection(identType, otherType);
      return env.set(ast.name, type);
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
