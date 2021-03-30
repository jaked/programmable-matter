import expectCheck from './expectCheck';

const type = '(n: number) => number';

it('ok', () => {
  expectCheck({
    expr: 'x => x + 7',
    type,
  });
});

it('ok with block body', () => {
  expectCheck({
    expr: 'x => { true; ({}); x + 7 }',
    type,
  });
});

it('fewer args ok', () => {
  expectCheck({
    expr: '() => 7',
    type,
  });
});

it('too many args', () => {
  expectCheck({
    expr: '(x, y) => x + y',
    type,
    error: true,
  });
});

it('wrong body type', () => {
  expectCheck({
    expr: `x => 'foo'`,
    type,
    error: true
  });
});

it('wrong body type with empty block body', () => {
  expectCheck({
    expr: 'x => { }',
    type,
    error: true
  });
});

it('object pattern arg', () => {
  expectCheck({
    expr: '({ x: xArg, y: yArg }) => xArg + yArg',
    type: '(o: { x: number, y: number }) => number',
  });
});

it('shorthand object pattern arg', () => {
  expectCheck({
    expr: '({ x, y }) => x + y',
    type: '(o: { x: number, y: number }) => number',
  });
});

// Babel parser already checks this
// it('duplicate identifiers', () => {
//   const type = Type.functionType(
//     [ Type.object({ x: Type.number, y: Type.number }) ],
//     Type.number
//   );
//   expectCheckThrows('({ x: z, y: z }) => z + z', type);
// });

it('function component', () => {
  expectCheck({
    expr: '({ children, foo }) => foo',
    type: 'React.FC<{ foo: string }>',
  });
})
