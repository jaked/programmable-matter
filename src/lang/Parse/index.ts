import * as Babel from '@babel/parser';

import { bug } from '../../util/bug';
import * as ESTree from '../ESTree';
import Type from '../Type';

export function parseProgram(input: string) {
  const ast = Babel.parse(input, {
    sourceType: 'module',
    plugins: [
      'jsx',
      'typescript',
      'estree'
    ]
  }).program as ESTree.Program;
  return ast;
}

export function parseExpression(input: string) {
  const ast = Babel.parseExpression(input, {
    sourceType: 'module',
    plugins: [
      'jsx',
      'typescript',
      'estree'
    ]
  }) as ESTree.Expression;
  return ast;
}

export function parseType(input: string): Type {
  const ast = parseExpression(`_ as ${input}`);
  if (ast.type !== 'TSAsExpression') bug(`unexpected ${ast.type}`);
  return Type.ofTSType(ast.typeAnnotation);
}
