import Try from '../../util/Try';
import Type from '../Type';
import * as ESTree from '../ESTree';
import { InterfaceMap } from '../../model';

export function withLocation(ast: ESTree.Node, msg, interfaceMap?: InterfaceMap): never {
  const err = new Error(msg);
  if (interfaceMap) interfaceMap.set(ast, Type.error(err));
  throw err;
}

export function expectedType(
  ast: ESTree.Node,
  expected: string | Type,
  actual?: string | Type,
  interfaceMap?: InterfaceMap
): never {
  if (typeof expected !== 'string')
    expected = Type.toString(expected);
  if (actual && typeof actual !== 'string')
    actual = Type.toString(actual);

  let msg = 'expected ' + expected;
  if (actual) msg += ', got ' + actual;
  return withLocation(ast, msg, interfaceMap);
}

export function unknownField(
  ast: ESTree.Node,
  field: string,
  interfaceMap?: InterfaceMap
): never {
  return withLocation(ast, `unknown field '${field}'`, interfaceMap);
}

export function missingField(
  ast: ESTree.Node,
  field: string,
  interfaceMap?: InterfaceMap
): never {
  return withLocation(ast, `missing field '${field}'`, interfaceMap);
}

export function extraField(
  ast: ESTree.Node,
  field: string,
  interfaceMap?: InterfaceMap
): never {
  return withLocation(ast, `extra field ${field}`, interfaceMap);
}

export function wrongArgsLength(
  ast: ESTree.Node,
  expected: number,
  actual: number,
  interfaceMap?: InterfaceMap
) {
  return withLocation(ast, `expected ${expected} args, function has ${actual} args`, interfaceMap);
}

export function wrongParamsLength(
  ast: ESTree.Node,
  expected: number,
  actual: number,
  interfaceMap?: InterfaceMap
) {
  return withLocation(ast, `expected ${expected} type params, got ${actual} params`, interfaceMap);
}

export function duplicateIdentifier(
  ast: ESTree.Node,
  ident: string,
  interfaceMap?: InterfaceMap
): never {
  return withLocation(ast, `duplicate identifier ${ident}`, interfaceMap);
}
