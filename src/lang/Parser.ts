import unified from 'unified';
import toMDAST from 'remark-parse';
import remarkMdx from './remark-mdx';
import remarkEmoji from 'remark-emoji';
import remarkWikiLink from 'remark-wiki-link';
import squeeze from 'remark-squeeze-paragraphs';
import toMDXAST from '@mdx-js/mdx/md-ast-to-mdx-ast';
import mdxAstToMdxHast from '@mdx-js/mdx/mdx-ast-to-mdx-hast';

import * as Acorn from 'acorn';
import AcornJsx from 'acorn-jsx';

import Trace from '../util/Trace';
import Try from '../util/Try';
import * as MDXHAST from './mdxhast';
import * as AcornJsxAst from './acornJsxAst';

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

const jsxParser = Acorn.Parser.extend(AcornJsx())

function fixPositions(ast: AcornJsxAst.Node, position?: MDXHAST.Position) {
  if (position && position.start.offset) {
    const offset = position.start.offset;
    function fn(ast: AcornJsxAst.Node) {
      ast.start += offset;
      ast.end += offset;
    }
    AcornJsxAst.visit(ast, fn);
  }
}

function parseJsx(input: string, position?: MDXHAST.Position): AcornJsxAst.Node {
  const ast = jsxParser.parse(input, { sourceType: 'module' }) as AcornJsxAst.Node;
  fixPositions(ast, position);
  return ast;
}

export function parseProgram(input: string): AcornJsxAst.Program {
  return jsxParser.parse(input, { sourceType: 'module' }) as AcornJsxAst.Program;
}

export function parseExpression(input: string, position?: MDXHAST.Position): AcornJsxAst.Expression {
  const ast = jsxParser.parseExpressionAt(input, 0) as AcornJsxAst.Expression;
  fixPositions(ast, position);
  return ast;
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
        const jsxAst = parseJsx(ast.value, ast.position);
        if (jsxAst.type === 'Program') {
          return jsxAst.body.map(decl => {
            switch (decl.type) {
              case 'ImportDeclaration':
              case 'ExportNamedDeclaration':
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

export function parse(trace: Trace, input: string): MDXHAST.Root {
  const ast = trace.time('parseMdx', () => parseMdx(input));
  trace.time('parseJsxNodes', () => parseJsxNodes(ast));
  return ast;
}
