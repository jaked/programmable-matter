import Try from '../../util/Try';
import Type from '../Type';
import * as ESTree from '../ESTree';
import { TypeMap } from '../../model';

export function withLocation(ast: ESTree.Node, msg, typeMap?: TypeMap): never {
  const err = new Error(msg);
  if (typeMap) typeMap.set(ast, Type.error(err));
  throw err;
}

export function expectedType(
  ast: ESTree.Node,
  expected: string | Type,
  actual?: string | Type,
  typeMap?: TypeMap
): never {
  if (typeof expected !== 'string')
    expected = Type.toString(expected);
  if (actual && typeof actual !== 'string')
    actual = Type.toString(actual);

  let msg = 'expected ' + expected;
  if (actual) msg += ', got ' + actual;
  return withLocation(ast, msg, typeMap);
}

export function unknownField(
  ast: ESTree.Node,
  field: string,
  typeMap?: TypeMap
): never {
  return withLocation(ast, `unknown field '${field}'`, typeMap);
}

export function missingField(
  ast: ESTree.Node,
  field: string,
  typeMap?: TypeMap
): never {
  return withLocation(ast, `missing field '${field}'`, typeMap);
}

export function extraField(
  ast: ESTree.Node,
  field: string,
  typeMap?: TypeMap
): never {
  return withLocation(ast, `extra field ${field}`, typeMap);
}

export function wrongArgsLength(
  ast: ESTree.Node,
  expected: number,
  actual: number,
  typeMap?: TypeMap
) {
  return withLocation(ast, `expected ${expected} args, function has ${actual} args`, typeMap);
}

export function wrongParamsLength(
  ast: ESTree.Node,
  expected: number,
  actual: number,
  typeMap?: TypeMap
) {
  return withLocation(ast, `expected ${expected} type params, got ${actual} params`, typeMap);
}

export function duplicateIdentifier(
  ast: ESTree.Node,
  ident: string,
  typeMap?: TypeMap
): never {
  return withLocation(ast, `duplicate identifier ${ident}`, typeMap);
}
