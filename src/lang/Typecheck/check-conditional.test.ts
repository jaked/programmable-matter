import { Interface } from '../../model';
import * as ESTree from '../ESTree';
import * as Parse from '../Parse';
import Type from '../Type';
import Typecheck from './index';
import { bug } from '../../util/bug';

import expectCheck from './expectCheck';

it('ok', () => {
  expectCheck({
    expr: 'b ? 1 : 2',
    env: { b: 'boolean' },
    type: '1 | 2',
  });
});

it('ok with statically evaluable test', () => {
  expectCheck({
    expr: 'true ? 1 : 2',
    type: '1',
  });
});

it('ok with statically evaluable test 2', () => {
  expectCheck({
    expr: `x === 'foo' ? 1 : 2`,
    env: { x: `'foo'` },
    type: '1',
  });
});

it('narrows type for equality tests', () => {
  expectCheck({
    expr: `s === 'foo' ? s : 'foo'`,
    env: { s: `'foo' | 'bar'` },
    type: `'foo'`,
  });
});

it('synths untaken branch when test is falsy', () => {
  const expr = Parse.parseExpression(`false ? 1 : 2`);
  const interfaceMap = new Map<ESTree.Node, Interface>();
  const env = Typecheck.env();
  const type = Type.number;
  Typecheck.check(expr, env, type, interfaceMap);
  const consequent = expr.type === 'ConditionalExpression' ? expr.consequent : bug(`expected conditional`);
  const intf = interfaceMap.get(consequent) ?? bug(`expected interface`);
  expect(intf.type === 'ok' && intf.ok.dynamic == false).toBe(true);
});
