import * as React from 'react';

import unified from 'unified';
import toMDAST from 'remark-parse';
import remarkMdx from 'remark-mdx';
import squeeze from 'remark-squeeze-paragraphs';
import toMDXAST from '@mdx-js/mdx/md-ast-to-mdx-ast';
import mdxAstToMdxHast from '@mdx-js/mdx/mdx-ast-to-mdx-hast';

import { Node } from '../parse/mdxhast'

import { TwitterTweetEmbed } from 'react-twitter-embed';

const components = {
  Tweet: (props) => <TwitterTweetEmbed {...props} />
}

interface Props {
  content: string;
}

export class Display extends React.Component<Props, {}> {
  parser =
    unified()
      .use(toMDAST)
      .use(remarkMdx)
      .use(squeeze)
      .use(toMDXAST)
      .use(mdxAstToMdxHast)

  render() {
    const ast = this.parser.runSync(this.parser.parse(this.props.content)) as Node
    return renderFromAst(ast)
  }
}

function renderFromAst(ast: Node): React.ReactNode {
  switch (ast.type) {
    case "root":
      return React.createElement(
        'div',
        {},
        ...ast.children.map(renderFromAst)
      );
      break;
    case "element":
      return React.createElement(
        ast.tagName,
        ast.properties,
        ...ast.children.map(renderFromAst)
      );
      break;
    case "text":
      // TODO(jaked) handle interpolation
      return ast.value;
      break;
    case "jsx":
      return null;
      break;
   }
}