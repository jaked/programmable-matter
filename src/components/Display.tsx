import * as Immutable from 'immutable';

import * as React from 'react';

import { Atom, F, Lens } from '@grammarly/focal';

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

interface Props {
  state: Atom<Immutable.Map<string, any>>;
  content: string | null;
}

export class Display extends React.Component<Props, {}> {
  constructor(props: Props) {
    super(props);
    this.renderFromAst = this.renderFromAst.bind(this);
  }

  static mdxParser =
    unified()
      .use(toMDAST)
      .use(remarkMdx)
      .use(squeeze)
      .use(toMDXAST)
      .use(mdxAstToMdxHast)

  static jsxParser = Acorn.Parser.extend(AcornJsx())

  static immutableMapLens<T>(key: string): Lens<Immutable.Map<string, T>, T> {
    return Lens.create(
      (map: Immutable.Map<string, T>) => map.get<any>(key, null),
      (t: T, map: Immutable.Map<string, T>) => map.set(key, t)
    )
  }

  renderFromAst(ast: MDXHAST.Node): React.ReactNode {
    switch (ast.type) {
      case 'root':
        return React.createElement(
          'div',
          {},
          ...ast.children.map(this.renderFromAst)
        );
        break;

      case 'element':
        return React.createElement(
          ast.tagName,
          ast.properties,
          ...ast.children.map(this.renderFromAst)
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
                          const expression = value.expression;
                          switch (expression.type) {
                            case 'Literal':
                              attrValue = expression.value;
                              break;
                            case 'Identifier':
                              // TODO(jaked) we can't check for the existence
                              // of a name at compile time, unless we make compilation
                              // a reaction to change of the doc state?
                              attrValue = this.props.state.lens(Display.immutableMapLens(expression.name));
                              break;
                          }
                          break;
                        case 'Literal':
                          attrValue = value.value;
                          break;
                        default:
                          throw 'unexpected AST ' + value;
                      }
                      return { [name.name]: attrValue };
                    });
                    const attrs = Object.assign({}, ...attrObjs);
                    const elemName = expression.openingElement.name.name;
                    let elem: any; // TODO(jaked) give this a better type
                    if (STARTS_WITH_CAPITAL_LETTER.test(elemName)) {
                      // TODO(jaked) lift non-intrinsic components
                      switch (elemName) {
                        case 'Tweet':
                          elem = TwitterTweetEmbed;
                          break;
                        case 'YouTube':
                          elem = YouTube;
                          break;
                        default:
                          throw 'unexpected element ' + elemName;
                      }
                    } else {
                      switch (elemName) {
                          // TODO(jaked) lift other instrinsic components
                          case 'input':
                          elem = F.input;
                          break;
                        default:
                          elem = elemName;
                      }
                    }
                    return React.createElement(elem, attrs);

                  default:
                    throw 'unexpected AST ' + expression;
                }
              default:
                throw 'unexpected AST ' + body;
            }
          default:
            throw 'unexpected AST ' + jsxAst;
        }
     }
  }

  render() {
    if (this.props.content === null) {
      return <span>no note</span>;
    } else {
      const ast = Display.mdxParser.runSync(Display.mdxParser.parse(this.props.content)) as MDXHAST.Node
      return this.renderFromAst(ast);
    }
  }
}
