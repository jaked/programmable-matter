import * as Immutable from 'immutable';

import * as React from 'react';

import { Atom, F, Lens, ReadOnlyAtom } from '@grammarly/focal';

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
    this.renderExpression = this.renderExpression.bind(this);
    this.evaluateExpression = this.evaluateExpression.bind(this);
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

  private renderExpression(ast: AcornJsxAst.Expression) {
    const names = new Set<string>();
    const evaluatedAst = this.evaluateExpression(ast, { names })
    if (evaluatedAst.type === 'Literal') {
      return evaluatedAst.value;
    } else {
      // TODO(jaked) how do I map over a Set to get an array?
      const atoms: Array<ReadOnlyAtom<any>> = [];
      names.forEach(name => {
        // TODO(jaked) we can't check for the existence
        // of a name at compile time, unless we make compilation
        // a reaction to change of the doc state?
        atoms.push(this.props.state.lens(Display.immutableMapLens(name)));
      });
      const self = this; // bleargh
      const combineFn = function (...values: Array<any>) {
        const env = new Map<string, any>();
        let i = 0;
        names.forEach(name => env.set(name, values[i++]));
        const evaluatedAst2 = self.evaluateExpression(evaluatedAst, { env: env });
        if (evaluatedAst2.type === 'Literal') {
          return evaluatedAst2.value;
        } else {
          throw 'expected fully-evaluated expression'
        }
      }
      // TODO(jaked) it doesn't seem to be possible to call the N-arg version of combine,
      // even though all the K-arg versions are alternate signatures for it.
      const combine = Atom.combine as (...args: any) => ReadOnlyAtom<any>
      return combine(...[...atoms, combineFn]);
    }
  }

  static makeLiteral(ast: AcornJsxAst.Expression, value: any) {
    return Object.assign({}, ast, { type: 'Literal', value });
  }

  // evaluate an expression
  //  - when `names` is passed, leave identifiers unevaluated but add them to `names`
  //  - when `env` is passed, look up identifiers in `env`
  // so we can use this function both in compilation and at runtime
  private evaluateExpression(ast: AcornJsxAst.Expression, opts: { names?: Set<string>, env?: Map<string, any> }): AcornJsxAst.Expression {
    switch (ast.type) {
      case 'Literal': return ast;

      case 'Identifier':
        if (opts.names) {
          opts.names.add(ast.name);
          return ast;
        } else if (opts.env) {
          return Display.makeLiteral(ast, opts.env.get(ast.name));
        } else {
          throw 'expected `names` or `env` argument';
        }

      case 'JSXElement':
        // we don't need to recurse into JSXElements;
        // focal handles reaction inside nested elements
        return Display.makeLiteral(ast, this.renderFromJsx(ast));

      case 'BinaryExpression':
        const left = this.evaluateExpression(ast.left, opts);
        const right = this.evaluateExpression(ast.right, opts);
        if (left.type === 'Literal' && right.type === 'Literal') {
          const lv = left.value;
          const rv = right.value;
          let v;
          switch (ast.operator) {
            case '+': v = lv + rv; break;
            case '-': v = lv - rv; break;
            case '*': v = lv * rv; break;
            case '/': v = lv / rv; break;
            case '**': v = lv ** rv; break;
            case '%': v = lv % rv; break;
            case '==': v = lv == rv; break;
            case '!=': v = lv != rv; break;
            case '===': v = lv === rv; break;
            case '!==': v = lv !== rv; break;
            case '<': v = lv < rv; break;
            case '<=': v = lv <= rv; break;
            case '>': v = lv > rv; break;
            case '>=': v = lv >= rv; break;
            case '||': v = lv || rv; break;
            case '&&': v = lv && rv; break;
            case '|': v = lv | rv; break;
            case '&': v = lv & rv; break;
            case '^': v = lv ^ rv; break;
            case '<<': v = lv << rv; break;
            case '>>': v = lv >> rv; break;
            case '>>>': v = lv >>> rv; break;
          }
          return Display.makeLiteral(ast, v);
        } else {
          return Object.assign({}, ast, { left, right });
        }

      case 'ObjectExpression':
        const properties = ast.properties.map(prop => {
          const value = this.evaluateExpression(prop.value, opts);
          return Object.assign({}, prop, { value })
        });
        if (properties.every((prop) => prop.value.type === 'Literal')) {
          return Display.makeLiteral(
            ast,
            Object.assign({}, ...properties.map(prop =>
              ({ [prop.key.name]: (prop.value as AcornJsxAst.Literal).value })
            )));
        } else {
          return Object.assign({}, ast, { properties });
        }

      default:
        throw 'unexpected AST ' + (ast as any).type;
    }
  }

  private renderAttributes(attributes: Array<AcornJsxAst.JSXAttribute>) {
    const attrObjs = attributes.map(({ name, value }) => {
      let attrValue;
      switch (value.type) {
        case 'JSXExpressionContainer':
          attrValue = this.renderExpression(value.expression);
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
        case 'JSXElement':
          return this.renderFromJsx(child);
        case 'JSXText':
          return child.value;
        case 'JSXExpressionContainer':
          return this.renderExpression(child.expression);
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
