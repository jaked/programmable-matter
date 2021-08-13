import { bug } from '../util/bug';
import * as Parse from '../lang/Parse';
import Type from './index';

function expectOfTSType(typeExpr: string, type: Type) {
  const ast = Parse.parseExpression(`_ as ${typeExpr}`);
  if (ast.type !== 'TSAsExpression') bug(`unexpected ${ast.type}`);
  expect(Type.ofTSType(ast.typeAnnotation)).toEqual(type);
}

it('object', () => {
  expectOfTSType(
    '{ foo: number, bar: boolean }',
    Type.object({ foo: Type.number, bar: Type.boolean })
  );
});

it('function', () => {
  expectOfTSType(
    '(x: number) => string',
    Type.functionType([Type.number], Type.string)
  );
});

it('singleton', () => {
  expectOfTSType(
    '7',
    Type.singleton(7)
  );
});

it('tuple', () => {
  expectOfTSType(
    '[number, string]',
    Type.tuple(Type.number, Type.string)
  );
})

describe('abstract', () => {
  it('React.ReactNode', () => {
    expectOfTSType(
      'React.ReactNode',
      Type.abstract('React.ReactNode'),
    )
  });

  it('React.FC', () => {
    expectOfTSType(
      'React.FC<{ foo: string }>',
      Type.abstract('React.FC', Type.object({ foo: Type.string })),
    )
  });

  it('unknown abstract type', () => {
    expectOfTSType(
      'foo',
      Type.error(new Error(`unknown abstract type 'foo'`))
    )
  });
});

it('union', () => {
  expectOfTSType(
    '7 | 9',
    Type.union(Type.singleton(7), Type.singleton(9))
  );
});

it('intersection', () => {
  expectOfTSType(
    '{ foo: 7 } & { bar: 9 }',
    Type.intersection(
      Type.object({ foo: Type.singleton(7) }),
      Type.object({ bar: Type.singleton(9) })
    )
  );
});
