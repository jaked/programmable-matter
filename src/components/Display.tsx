import * as React from 'react';

import unified from 'unified';
import toMDAST from 'remark-parse';
import remarkMdx from 'remark-mdx';
import squeeze from 'remark-squeeze-paragraphs';
import toMDXAST from '@mdx-js/mdx/md-ast-to-mdx-ast';
import mdxAstToMdxHast from '@mdx-js/mdx/mdx-ast-to-mdx-hast';

import * as Acorn from 'acorn';
import AcornJsx from 'acorn-jsx';

import * as MDXHAST from '../parse/mdxhast';
import * as AcornJsxAst from '../parse/acornJsxAst';

import { TwitterTweetEmbed } from 'react-twitter-embed';
import YouTube from 'react-youtube';

const STARTS_WITH_CAPITAL_LETTER = /^[A-Z]/

const components = {
  Tweet: (props) => <TwitterTweetEmbed {...props} />
}

interface Props {
  content: string | null;
}

export class Display extends React.Component<Props, {}> {
  static mdxParser =
    unified()
      .use(toMDAST)
      .use(remarkMdx)
      .use(squeeze)
      .use(toMDXAST)
      .use(mdxAstToMdxHast)

  static jsxParser = Acorn.Parser.extend(AcornJsx())

  static renderFromAst = function(ast: MDXHAST.Node): React.ReactNode {
    switch (ast.type) {
      case 'root':
        return React.createElement(
          'div',
          {},
          ...ast.children.map(Display.renderFromAst)
        );
        break;

      case 'element':
        return React.createElement(
          ast.tagName,
          ast.properties,
          ...ast.children.map(Display.renderFromAst)
        );
        break;

      case 'text':
        // TODO(jaked) handle interpolation
        return ast.value;
        break;

      case 'jsx':
        const jsxAst = Display.jsxParser.parse(ast.value) as AcornJsxAst.Node;
        switch (jsxAst.type) {
          case 'Program':
            const body = jsxAst.body[0]
            switch (body.type) {
              case 'ExpressionStatement':
                const expression = body.expression;
                switch (expression.type) {
                  case 'JSXElement':
                    const attrObjs =
                      expression.openingElement.attributes.map(({ name, value }) => {
                      let attrValue;
                      switch (value.type) {
                        case 'JSXExpressionContainer':
                          attrValue = value.expression.value;
                          break;
                        case 'Literal':
                          attrValue = value.value;
                          break;
                      }
                      return { [name.name]: attrValue };
                    });
                    const attrs = Object.assign({}, ...attrObjs);
                    const elemName = expression.openingElement.name.name;
                    if (STARTS_WITH_CAPITAL_LETTER.test(elemName)) {
                      let elem: React.ComponentClass;
                      switch (elemName) {
                        case 'Tweet':
                          elem = TwitterTweetEmbed;
                          break;
                        case 'YouTube':
                          elem = YouTube;
                          break;
                        default:
                          return null; // TODO(jaked) how do we throw an error?
                      }
                      return React.createElement(elem, attrs);
                    } else {
                      return React.createElement(elemName, attrs);
                    }
                    break;
                  default:
                    return null; // TODO(jaked) how do we throw an error?
                }
                break;
              default:
                return null; // TODO(jaked) how do we throw an error?
            }
            break;
          default:
            return null; // TODO(jaked) how do we throw an error?
        }
        break;
     }
  }

  render() {
    if (this.props.content === null) {
      return <span>no note</span>;
    } else {
      const ast = Display.mdxParser.runSync(Display.mdxParser.parse(this.props.content)) as MDXHAST.Node
      return Display.renderFromAst(ast);
    }
  }
}
