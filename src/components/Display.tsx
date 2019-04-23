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

const components = {
  Tweet: (props) => <TwitterTweetEmbed {...props} />
}

interface Props {
  content: string;
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
      case "root":
        return React.createElement(
          'div',
          {},
          ...ast.children.map(Display.renderFromAst)
        );
        break;

      case "element":
        return React.createElement(
          ast.tagName,
          ast.properties,
          ...ast.children.map(Display.renderFromAst)
        );
        break;

      case "text":
        // TODO(jaked) handle interpolation
        return ast.value;
        break;

      case "jsx":
        const jsxAst = Display.jsxParser.parse(ast.value) as AcornJsxAst.Node;
        switch (jsxAst.type) {
          case 'Program':
            const body = jsxAst.body[0]
            switch (body.type) {
              case 'ExpressionStatement':
                const expression = body.expression;
                switch (expression.type) {
                  case 'JSXElement':
                    let elem: React.ComponentClass;
                    switch (expression.openingElement.name.name) {
                      case 'Tweet':
                        elem = TwitterTweetEmbed;
                        break;
                      case 'YouTube':
                        elem = YouTube;
                        break;
                      default:
                        return null; // TODO(jaked) how do we throw an error?
                    }
                    const attrs = expression.openingElement.attributes.map(({ name: jsxName, value: jsxValue }) => {
                      const name = jsxName.name;
                      const value = jsxValue.expression.value;
                      return { [name]: value };
                    });
                    return React.createElement(
                      elem,
                      Object.assign({}, ...attrs)
                    )
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
    const ast = Display.mdxParser.runSync(Display.mdxParser.parse(this.props.content)) as MDXHAST.Node
    return Display.renderFromAst(ast)
  }
}
