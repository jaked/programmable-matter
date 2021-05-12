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
