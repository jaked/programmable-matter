import unified from 'unified';
import toMDAST from 'remark-parse';
import remarkMdx from './remark-mdx';
import remarkEmoji from 'remark-emoji';
import remarkWikiLink from 'remark-wiki-link';
import squeeze from 'remark-squeeze-paragraphs';
import toMDXAST from '@mdx-js/mdx/md-ast-to-mdx-ast';
import mdxAstToMdxHast from '@mdx-js/mdx/mdx-ast-to-mdx-hast';

import * as Babel from '@babel/parser';

import { bug } from '../../util/bug';
import Try from '../../util/Try';
import * as MDXHAST from '../mdxhast';
import * as ESTree from '../ESTree';
import Type from '../Type';

const mdxParser =
  unified()
    .use(toMDAST)

    // TODO(jaked) get type of remarkMdx to match `use` signature
    .use(remarkMdx as any)

    .use(remarkEmoji)
    .use(remarkWikiLink, {
      aliasDivider: '|',
      hrefTemplate: (s: string) => s,
      pageResolver: (s: string) => [ s ]
    })
    .use(squeeze)
    .use(toMDXAST)
    .use(mdxAstToMdxHast)
    .freeze();

export function parseProgram(input: string, position?: MDXHAST.Position) {
  const ast = Babel.parse(input, {
    sourceType: 'module',
    plugins: [
      'jsx',
      'typescript',
      'estree'
    ]
  }).program as ESTree.Program;
  fixPositions(ast, position);
  return ast;
}

export function parseExpression(input: string, position?: MDXHAST.Position) {
  const ast = Babel.parseExpression(input, {
    sourceType: 'module',
    plugins: [
      'jsx',
      'typescript',
      'estree'
    ]
  }) as ESTree.Expression;
  fixPositions(ast, position);
  return ast;
}

function fixPositions(ast: ESTree.Node, position?: MDXHAST.Position) {
  if (position && position.start.offset) {
    const offset = position.start.offset;
    function fn(ast: ESTree.Node) {
      ast.start += offset;
      ast.end += offset;
    }
    ESTree.visit(ast, fn);
  }
}

function parseMdx(input: string): MDXHAST.Root {
  return <MDXHAST.Root><unknown>mdxParser.runSync(mdxParser.parse(input));
}

function parseJsxNodes(ast: MDXHAST.Node) {
  switch (ast.type) {
    case 'root':
    case 'element':
      ast.children.forEach(parseJsxNodes);
      break;

    case 'text':
      break;

    case 'jsx':
      ast.jsxElement = Try.apply(() => {
        const expr = parseExpression(ast.value, ast.position);
        if (expr.type === 'JSXElement' || expr.type === 'JSXFragment') return expr;
        else
          throw new Error('unexpected AST ' + expr.type);
      });
      break;

    case 'import':
    case 'export':
      ast.declarations = Try.apply(() => {
        const jsxAst = parseProgram(ast.value, ast.position);
        if (jsxAst.type === 'Program') {
          return jsxAst.body.map(decl => {
            switch (decl.type) {
              case 'ImportDeclaration':
              case 'ExportNamedDeclaration':
              case 'ExportDefaultDeclaration':
              case 'VariableDeclaration':
                return decl;
              default:
                throw new Error('unexpected AST ' + decl.type);
            }
          });
        } else {
          throw new Error('unexpected AST ' + jsxAst.type);
        }
      });
      break;

    default: throw new Error('unexpected AST ' + (ast as MDXHAST.Node).type);
  }
}

export function parse(input: string): MDXHAST.Root {
  const ast = parseMdx(input);
  parseJsxNodes(ast);
  return ast;
}

export function parseType(input: string): Type {
  const ast = parseExpression(`_ as ${input}`);
  if (ast.type !== 'TSAsExpression') bug(`unexpected ${ast.type}`);
  return Type.ofTSType(ast.typeAnnotation);
}
