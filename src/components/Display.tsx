import * as Immutable from 'immutable';

import * as React from 'react';

import { Atom, F, Lens } from '@grammarly/focal';

import * as MDXHAST from '../parse/mdxhast';
import * as AcornJsxAst from '../parse/acornJsxAst';
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

    // TODO(jaked)
    // figure out the rules on when this is needed
    this.renderAttributes = this.renderAttributes.bind(this);
    this.renderElement = this.renderElement.bind(this);
    this.renderFromJsx = this.renderFromJsx.bind(this);
    this.renderFromMdx = this.renderFromMdx.bind(this);
  }

  static immutableMapLens<T>(key: string): Lens<Immutable.Map<string, T>, T> {
    return Lens.create(
      (map: Immutable.Map<string, T>) => map.get<any>(key, null),
      (t: T, map: Immutable.Map<string, T>) => map.set(key, t)
    )
  }

  private renderAttributes(attributes: Array<AcornJsxAst.JSXAttribute>) {
    const attrObjs = attributes.map(({ name, value }) => {
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
              throw 'unexpected AST ' + (expression as any).type;
            }
          break;
        case 'Literal':
          attrValue = value.value;
          break;
        default:
          throw 'unexpected AST ' + (value as any).type;
      }
      return { [name.name]: attrValue };
    });
    return Object.assign({}, ...attrObjs);
  }

  private renderElement(name: string) {
    if (STARTS_WITH_CAPITAL_LETTER.test(name)) {
      // TODO(jaked) lift non-intrinsic components
      switch (name) {
        case 'Tweet':
          return TwitterTweetEmbed;
        case 'YouTube':
          return YouTube;
        default:
          throw 'unexpected element ' + name;
      }
    } else {
      return F[name] || name;
    }
  }

  private renderFromJsx(ast: AcornJsxAst.JSXElement): React.ReactNode {
    const attrs = this.renderAttributes(ast.openingElement.attributes);
    const elem = this.renderElement(ast.openingElement.name.name);
    const children = ast.children.map(child => {
      switch (child.type) {
        case 'JSXElement': return this.renderFromJsx(child);
        case 'JSXText': return child.value;
      }
    });

    // TODO(jaked) for what elements does this make sense? only input?
    if (attrs.id) {
      const atom =
        this.props.state.lens(Display.immutableMapLens(attrs.id))
      attrs.onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        atom.set(e.currentTarget.value);
      }
    }

    return React.createElement(elem, attrs, ...children);
  }

  private renderFromMdx(ast: MDXHAST.Node): React.ReactNode {
    switch (ast.type) {
      case 'root':
        return React.createElement(
          'div',
          {},
          ...ast.children.map(this.renderFromMdx)
        );

      case 'element':
        return React.createElement(
          ast.tagName,
          ast.properties,
          ...ast.children.map(this.renderFromMdx)
        );

      case 'text':
        // TODO(jaked) handle interpolation
        return ast.value;

      case 'jsx':
        if (ast.jsxElement) {
          return this.renderFromJsx(ast.jsxElement)
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
      return this.renderFromMdx(ast);
    }
  }
}
