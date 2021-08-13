import Try from '../util/Try';
import Type from '../type';
import * as ESTree from '../estree';
import { InterfaceMap } from '../model';

export function withLocation(ast: ESTree.Node, err: string | Error, interfaceMap?: InterfaceMap) {
  if (typeof err === 'string') err = new Error(err);
  const intf = Try.err(err);
  if (interfaceMap) interfaceMap.set(ast, intf);
  return intf;
}

export function expectedType(
  ast: ESTree.Node,
  expected: string | Type,
  actual: string | Type,
  interfaceMap: InterfaceMap
) {
  if (typeof expected !== 'string')
    expected = Type.toString(expected);
  if (typeof actual !== 'string')
    actual = Type.toString(actual);
  return withLocation(ast, `expected ${expected}, got ${actual}`, interfaceMap);
}

export function unknownField(
  ast: ESTree.Node,
  field: string,
  interfaceMap: InterfaceMap
) {
  return withLocation(ast, `unknown field '${field}'`, interfaceMap);
}

export function noElementAtIndex(
  ast: ESTree.Node,
  elem: number,
  interfaceMap: InterfaceMap
) {
  return withLocation(ast, `no element at index ${elem}`, interfaceMap);
}

export function missingField(
  ast: ESTree.Node,
  field: string,
  interfaceMap: InterfaceMap
) {
  return withLocation(ast, `missing field '${field}'`, interfaceMap);
}

export function extraField(
  ast: ESTree.Node,
  field: string,
  interfaceMap: InterfaceMap
) {
  return withLocation(ast, `extra field ${field}`, interfaceMap);
}

export function wrongArgsLength(
  ast: ESTree.Node,
  expected: number,
  actual: number,
  interfaceMap: InterfaceMap
) {
  return withLocation(ast, `expected ${expected} args, function has ${actual} args`, interfaceMap);
}

export function wrongParamsLength(
  ast: ESTree.Node,
  expected: number,
  actual: number,
  interfaceMap: InterfaceMap
) {
  return withLocation(ast, `expected ${expected} type params, got ${actual} params`, interfaceMap);
}

export function duplicateIdentifier(
  ast: ESTree.Node,
  ident: string,
  interfaceMap: InterfaceMap
) {
  return withLocation(ast, `duplicate identifier ${ident}`, interfaceMap);
}
