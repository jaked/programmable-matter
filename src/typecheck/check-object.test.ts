import expectCheck from './expectCheck';

const type = '{ foo: number, bar: undefined | number, quux }';

it('undefined / error properties may be omitted', () => {
  expectCheck({
    expr: '({ foo: 7 })',
    type,
  });
});

it('error properties may be any type', () => {
  expectCheck({
    expr: '({ foo: 7, quux: 9 })',
    type,
  });
});

it('throws on missing properties', () => {
  expectCheck({
    expr: '({ })',
    type,
    error: true,
  });
});

it('throws on excess properties in literals', () => {
  expectCheck({
    expr: '({ foo: 7, baz: 9 })',
    type,
    error: true,
  });
});

it('permits excess properties in non-literal', () => {
  expectCheck({
    expr: 'foo',
    env: { foo: '{ foo: number, baz: number }' },
    type,
  });
});
