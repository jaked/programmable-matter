import * as Immutable from 'immutable';

import * as React from 'react';

import { Atom, F, Lens } from '@grammarly/focal';

import * as MDXHAST from '../parse/mdxhast';
import * as Parser from '../parse/parser';

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

      case 'element':
        return React.createElement(
          ast.tagName,
          ast.properties,
          ...ast.children.map(this.renderFromAst)
        );

      case 'text':
        // TODO(jaked) handle interpolation
        return ast.value;

      case 'jsx':
        if (ast.jsxElement) {
          const jsxElement = ast.jsxElement;
          const attrObjs =
            jsxElement.openingElement.attributes.map(({ name, value }) => {
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
                  default:
                    throw 'unexpected AST ' + value;
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
          const elemName = jsxElement.openingElement.name.name;
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
              case 'input':
                elem = F.input;
                if (attrs.id) {
                  const atom =
                    this.props.state.lens(Display.immutableMapLens(attrs.id))
                  attrs.onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
                    atom.set(e.currentTarget.value);
                  }
                }
                break;
              default:
                elem = F[elemName] || elemName;
            }
          }
          return React.createElement(elem, attrs);

        } else {
          throw 'expected JSX node to be parsed';
        }
    }
  }
  
  render() {
    if (this.props.content === null) {
      return <span>no note</span>;
    } else {
      const ast = Parser.parse(this.props.content)
      return this.renderFromAst(ast);
    }
  }
}
