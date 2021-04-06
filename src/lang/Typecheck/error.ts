import Type from '../Type';
import * as ESTree from '../ESTree';
import { TypeMap } from '../../model';

export function withLocation(ast: ESTree.Node, err: string | Error, typeMap?: TypeMap) {
  if (typeof err === 'string') err = new Error(err);
  const type = Type.error(err);
  if (typeMap) typeMap.set(ast, type);
  return type;
}

export function expectedType(
  ast: ESTree.Node,
  expected: string | Type,
  actual: string | Type,
  typeMap: TypeMap
) {
  if (typeof expected !== 'string')
    expected = Type.toString(expected);
  if (typeof actual !== 'string')
    actual = Type.toString(actual);
  return withLocation(ast, `expected ${expected}, got ${actual}`, typeMap);
}

export function unknownField(
  ast: ESTree.Node,
  field: string,
  typeMap: TypeMap
) {
  return withLocation(ast, `unknown field '${field}'`, typeMap);
}

export function noElementAtIndex(
  ast: ESTree.Node,
  elem: number,
  typeMap: TypeMap
) {
  return withLocation(ast, `no element at index ${elem}`, typeMap);
}

export function missingField(
  ast: ESTree.Node,
  field: string,
  typeMap: TypeMap
) {
  return withLocation(ast, `missing field '${field}'`, typeMap);
}

export function extraField(
  ast: ESTree.Node,
  field: string,
  typeMap: TypeMap
) {
  return withLocation(ast, `extra field ${field}`, typeMap);
}

export function wrongArgsLength(
  ast: ESTree.Node,
  expected: number,
  actual: number,
  typeMap: TypeMap
) {
  return withLocation(ast, `expected ${expected} args, function has ${actual} args`, typeMap);
}

export function wrongParamsLength(
  ast: ESTree.Node,
  expected: number,
  actual: number,
  typeMap: TypeMap
) {
  return withLocation(ast, `expected ${expected} type params, got ${actual} params`, typeMap);
}

export function duplicateIdentifier(
  ast: ESTree.Node,
  ident: string,
  typeMap: TypeMap
) {
  return withLocation(ast, `duplicate identifier ${ident}`, typeMap);
}
