import Try from '../../util/Try';
import Type from '../Type';
import * as ESTree from '../ESTree';
import { TypesMap } from '../../model';

export function withLocation(ast: ESTree.Node, msg, typesMap?: TypesMap): never {
  const err = new Error(msg);
  if (typesMap) typesMap.set(ast, Type.error(err));
  throw err;
}

export function expectedType(
  ast: ESTree.Node,
  expected: string | Type,
  actual?: string | Type,
  typesMap?: TypesMap
): never {
  if (typeof expected !== 'string')
    expected = Type.toString(expected);
  if (actual && typeof actual !== 'string')
    actual = Type.toString(actual);

  let msg = 'expected ' + expected;
  if (actual) msg += ', got ' + actual;
  return withLocation(ast, msg, typesMap);
}

export function unknownField(
  ast: ESTree.Node,
  field: string,
  typesMap?: TypesMap
): never {
  return withLocation(ast, `unknown field '${field}'`, typesMap);
}

export function missingField(
  ast: ESTree.Node,
  field: string,
  typesMap?: TypesMap
): never {
  return withLocation(ast, `missing field '${field}'`, typesMap);
}

export function extraField(
  ast: ESTree.Node,
  field: string,
  typesMap?: TypesMap
): never {
  return withLocation(ast, `extra field ${field}`, typesMap);
}

export function wrongArgsLength(
  ast: ESTree.Node,
  expected: number,
  actual: number,
  typesMap?: TypesMap
) {
  return withLocation(ast, `expected ${expected} args, function has ${actual} args`, typesMap);
}

export function wrongParamsLength(
  ast: ESTree.Node,
  expected: number,
  actual: number,
  typesMap?: TypesMap
) {
  return withLocation(ast, `expected ${expected} type params, got ${actual} params`, typesMap);
}

export function duplicateIdentifier(
  ast: ESTree.Node,
  ident: string,
  typesMap?: TypesMap
): never {
  return withLocation(ast, `duplicate identifier ${ident}`, typesMap);
}
