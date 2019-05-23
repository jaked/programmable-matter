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

function parseJsx(input: string): AcornJsxAst.Node {
  return jsxParser.parse(input, { sourceType: 'module' }) as AcornJsxAst.Node;
}

function parseMdx(input: string): MDXHAST.Root {
  return mdxParser.runSync(mdxParser.parse(input)) as MDXHAST.Root
}

function parseJsxNodes(ast: MDXHAST.Node) {
  switch (ast.type) {
    case 'root':
    case 'element':
      ast.children.forEach(parseJsxNodes);
      break;

    case 'text':
      break;

    case 'jsx': {
      const jsxAst = parseJsx(ast.value);
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
      const jsxAst = parseJsx(ast.value);
      switch (jsxAst.type) {
        case 'Program':
          // TODO(jaked) handle multiple imports
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
      const jsxAst = parseJsx(ast.value);
      switch (jsxAst.type) {
        case 'Program':
          // TODO(jaked) handle multiple exports
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

export function parseJsxExpr(input: string): AcornJsxAst.Expression {
  const jsxAst = parseJsx(input);
  switch (jsxAst.type) {
    case 'Program':
      const body = jsxAst.body[0];
      switch (body.type) {
        case 'ExpressionStatement':
          return body.expression;
        default:
          throw 'unexpected AST ' + body.type;
      }
    default:
      throw 'unexpected AST ' + jsxAst.type;
  }
}

export function parse(input: string): MDXHAST.Root {
  const ast = parseMdx(input);
  parseJsxNodes(ast);
  return ast;
}
