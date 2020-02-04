import Recast from 'recast/main';

import Try from '../../util/Try';
import Type from '../Type';
import * as ESTree from '../ESTree';

class LocatedError extends Error {
  location: ESTree.Node;

  constructor(msg: string, location: ESTree.Node) {
    super(msg);
    this.location = location;
  }

  toString() {
    return this.message + ' at ' + Recast.print(this.location).code;
  }
}

export function withLocation(ast: ESTree.Node, msg): never {
  const err = new LocatedError(msg, ast);
  ast.etype = Try.err(err);
  throw err;
}

export function expectedType(ast: ESTree.Node, expected: string | Type, actual?: string | Type): never {
  if (typeof expected !== 'string')
    expected = Type.toString(expected);
  if (actual && typeof actual !== 'string')
    actual = Type.toString(actual);

  let msg = 'expected ' + expected;
  if (actual) msg += ', got ' + actual;
  return withLocation(ast, msg);
}

export function unknownField(ast: ESTree.Node, field: string): never {
  return withLocation(ast, `unknown field '${field}'`);
}

export function missingField(ast: ESTree.Node, field: string): never {
  return withLocation(ast, `missing field '${field}'`);
}

export function extraField(ast: ESTree.Node, field: string): never {
  return withLocation(ast, `extra field ${field}`);
}

export function wrongArgsLength(ast: ESTree.Node, expected: number, actual: number) {
  return withLocation(ast, `expected ${expected} args, function has ${actual} args`);
}
