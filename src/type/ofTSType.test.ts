import { bug } from '../util/bug';
import { InterfaceMap } from '../model';
import * as Parse from '../parse';
import Type from './index';

function expectOfTSType(typeExpr: string, type: Type) {
  const ast = Parse.parseExpression(`_ as ${typeExpr}`);
  if (ast.type !== 'TSAsExpression') bug(`unexpected ${ast.type}`);
  const interfaceMap: InterfaceMap = new Map();
  expect(Type.ofTSType(ast.typeAnnotation, interfaceMap)).toEqual(type);
}

describe('object', () => {
  it('ok', () => {
    expectOfTSType(
      '{ foo: number, bar: boolean }',
      Type.object({ foo: Type.number, bar: Type.boolean })
    );
  });

  it('ok with missing type', () => {
    expectOfTSType(
      '{ foo: number, bar }',
      Type.object({ foo: Type.number, bar: Type.error(new Error('expected type')) })
    );
  });
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
