import Type from '../Type';
import * as ESTree from '../ESTree';
import { TypesMap } from '../../model';

export function withLocation(ast: ESTree.Node, err: string | Error, typesMap?: TypesMap) {
  if (typeof err === 'string') err = new Error(err);
  const type = Type.error(err);
  if (typesMap) typesMap.set(ast, type);
  return type;
}

export function expectedType(
  ast: ESTree.Node,
  expected: string | Type,
  actual: string | Type,
  typesMap: TypesMap
) {
  if (typeof expected !== 'string')
    expected = Type.toString(expected);
  if (typeof actual !== 'string')
    actual = Type.toString(actual);
  return withLocation(ast, `expected ${expected}, got ${actual}`, typesMap);
}

export function unknownField(
  ast: ESTree.Node,
  field: string,
  typesMap: TypesMap
) {
  return withLocation(ast, `unknown field '${field}'`, typesMap);
}

export function noElementAtIndex(
  ast: ESTree.Node,
  elem: number,
  typesMap: TypesMap
) {
  return withLocation(ast, `no element at index ${elem}`, typesMap);
}

export function missingField(
  ast: ESTree.Node,
  field: string,
  typesMap: TypesMap
) {
  return withLocation(ast, `missing field '${field}'`, typesMap);
}

export function extraField(
  ast: ESTree.Node,
  field: string,
  typesMap: TypesMap
) {
  return withLocation(ast, `extra field ${field}`, typesMap);
}

export function wrongArgsLength(
  ast: ESTree.Node,
  expected: number,
  actual: number,
  typesMap: TypesMap
) {
  return withLocation(ast, `expected ${expected} args, function has ${actual} args`, typesMap);
}

export function wrongParamsLength(
  ast: ESTree.Node,
  expected: number,
  actual: number,
  typesMap: TypesMap
) {
  return withLocation(ast, `expected ${expected} type params, got ${actual} params`, typesMap);
}

export function duplicateIdentifier(
  ast: ESTree.Node,
  ident: string,
  typesMap: TypesMap
) {
  return withLocation(ast, `duplicate identifier ${ident}`, typesMap);
}
