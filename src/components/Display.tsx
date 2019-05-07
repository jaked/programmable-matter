import * as React from 'react';
import * as Bacon from 'baconjs';

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

type Env = Map<string, Bacon.Property<any>>;

export class Display extends React.Component<Props, {}> {
  static mdxParser =
    unified()
      .use(toMDAST)
      .use(remarkMdx)
      .use(squeeze)
      .use(toMDXAST)
      .use(mdxAstToMdxHast)

  static jsxParser = Acorn.Parser.extend(AcornJsx())

  static renderFromAst = function(env: Env, ast: MDXHAST.Node): React.ReactNode {
    switch (ast.type) {
      case 'root':
        return React.createElement(
          'div',
          {},
          ...ast.children.map(ast => Display.renderFromAst(env, ast))
        );
        break;

      case 'element':
        return React.createElement(
          ast.tagName,
          ast.properties,
          ...ast.children.map(ast => Display.renderFromAst(env, ast))
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
                    let shouldWrapWithProperties = false;
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
                              if (env.has(expression.name)) {
                                shouldWrapWithProperties = true;
                                attrValue = env.get(expression.name);
                              } else {
                                throw 'unbound identifier ' + expression.name;
                              }
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
                    let elem: string | React.ComponentClass;
                    if (STARTS_WITH_CAPITAL_LETTER.test(elemName)) {
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
                      elem = elemName;
                    }
                    if (shouldWrapWithProperties) {
                      // TODO(jaked) wrap outside renderFromAst so we don't defeat reconciliation
                      return React.createElement(Display.wrapWithProperties(elemName), attrs);
                    } else {
                      return React.createElement(elem, attrs);
                    }

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
      const env = new Map();
      env.set('now', Bacon.fromPoll(1000, () => new Bacon.Next(new Date())).toProperty(new Date()));
      const ast = Display.mdxParser.runSync(Display.mdxParser.parse(this.props.content)) as MDXHAST.Node
      return Display.renderFromAst(env, ast);
    }
  }

  static wrapWithProperties(component: string | React.ComponentClass): React.ComponentClass {
    return class extends React.Component<any, any> {
      unsub: Bacon.Unsub | null = null;

      constructor(props) {
        super(props);
        this.state =
          // TODO(jaked) we have no current value for properties
          Object.assign({}, ...Object.keys(props).map(k => {
            return { [k]: (props[k] instanceof Bacon.Property ? undefined : props[k]) }
          }));
      }

      componentDidMount() {
        const properties: Array<Bacon.Property<any>> = [];
        Object.keys(this.props).forEach(k => {
          const p = this.props[k];
          if (p instanceof Bacon.Property)
            properties.push(p);
        });
        this.unsub = Bacon.combineAsArray(properties).subscribe(currEvent => {
          const curr = (currEvent as Bacon.Value<any>).value;
          let i = 0;
          Object.keys(this.props).forEach(k => {
            const p = this.props[k];
            if (p instanceof Bacon.Property) {
              this.setState({ [k]: curr[i] });
              i++;
            }
          });
        });
      }

      componentWillUnmount() {
        this.unsub && this.unsub();
      }

      // TODO(jaked) handle change of props

      render() {
        return React.createElement(component, this.state)
      }
    }
  }
}