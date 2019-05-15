import unified from 'unified';
import toMDAST from 'remark-parse';
import remarkMdx from 'remark-mdx';
import squeeze from 'remark-squeeze-paragraphs';
import toMDXAST from '@mdx-js/mdx/md-ast-to-mdx-ast';
import mdxAstToMdxHast from '@mdx-js/mdx/mdx-ast-to-mdx-hast';

import * as Acorn from 'acorn';
import AcornJsx from 'acorn-jsx';

import * as MDXHAST from './mdxhast';
import * as AcornJsxAst from './acornJsxAst';

const mdxParser =
  unified()
    .use(toMDAST)
    .use(remarkMdx)
    .use(squeeze)
    .use(toMDXAST)
    .use(mdxAstToMdxHast)

const jsxParser = Acorn.Parser.extend(AcornJsx())

function parseMdx(input: string): MDXHAST.Node {
  return mdxParser.runSync(mdxParser.parse(input)) as MDXHAST.Node
}

function parseJsx(ast: MDXHAST.Node) {
  switch (ast.type) {
    case 'root':
    case 'element':
      ast.children.forEach(parseJsx);
      break;

    case 'text':
      break;

    case 'jsx': {
      const jsxAst = jsxParser.parse(ast.value) as AcornJsxAst.Node;
      switch (jsxAst.type) {
        case 'Program':
          const body = jsxAst.body[0]
          switch (body.type) {
            case 'ExpressionStatement':
              const expression = body.expression;
              switch (expression.type) {
                case 'JSXElement':
                  ast.jsxElement = expression;
                  break;
                default:
                  throw 'unexpected AST ' + expression.type;
              }
              break;
            default:
              throw 'unexpected AST ' + body.type;
          }
          break;
        default:
          throw 'unexpected AST ' + jsxAst.type;
      }
    }
    break;

    case 'import': {
      const jsxAst =
        jsxParser.parse(ast.value, { sourceType: 'module' }) as AcornJsxAst.Node;
      switch (jsxAst.type) {
        case 'Program':
          const body = jsxAst.body[0];
          switch (body.type) {
            case 'ImportDeclaration':
              ast.importDeclaration = body;
              break;
            default:
              throw 'unexpected AST ' + body.type;
          }
          break;
        default:
          throw 'unexpected AST ' + jsxAst.type;
      }
    }
    break;

    case 'export': {
      const jsxAst =
        jsxParser.parse(ast.value, { sourceType: 'module' }) as AcornJsxAst.Node;
      switch (jsxAst.type) {
        case 'Program':
          const body = jsxAst.body[0];
          switch (body.type) {
            case 'ExportNamedDeclaration':
              ast.exportNamedDeclaration = body;
              break;
            default:
              throw 'unexpected AST ' + body.type;
          }
          break;
        default:
          throw 'unexpected AST ' + jsxAst.type;
      }
    }
    break;

    default: throw 'unexpected AST ' + (ast as MDXHAST.Node).type;
  }
}

export function parse(input: string): MDXHAST.Node {
  const ast = parseMdx(input);
  parseJsx(ast);
  return ast;
}
