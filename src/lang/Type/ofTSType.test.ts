import { bug } from '../../util/bug';
import * as Parser from '../Parser';
import Type from './index';

function expectOfTSType(typeExpr: string, type: Type) {
  const ast = Parser.parseExpression(`_ as ${typeExpr}`);
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
