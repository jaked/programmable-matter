import * as Parse from '../parse';
import Type from '../type';

import * as Immutable from 'immutable';

import { Inspector } from 'react-inspector';

import * as Plot from '@observablehq/plot';
import { PlotFigure } from 'plot-react';

import HighlightedCode from '../lang/HighlightedCode';

import Signal from '../util/Signal';

// TODO(jaked) clean these up somewhere
const now = Signal.cellOk(Date.now());
setInterval(() => { now.setOk(Date.now()) }, 50);

// updated by onmousemove handler in DisplayPane
// TODO(jaked) should go elsewhere
export const mouse = Signal.cellOk({ clientX: 0, clientY: 0 });

// updated by onscroll / onresize handler in DisplayPane
// TODO(jaked) should go elsewhere
export const window = Signal.cellOk({ innerWidth: 0, innerHeight: 0, scrollX: 0, scrollY: 0 })

// TODO(jaked) move to Typecheck?
function componentType(props: { [f: string]: Type }): Type {
  return Type.abstract('React.Component', Type.object(props));
}

// TODO(jaked) need a way to translate TypeScript types
const styleType = Parse.parseType(`
  undefined |
  {
    alignSelf: undefined | 'stretch' | 'center' | 'start' | 'end',
    background: undefined | string,
    backgroundColor: undefined | string,
    borderRadius: undefined | string,
    borderStyle: undefined | string,
    borderTop: undefined | string,
    borderWidth: undefined | string,
    boxShadow: undefined | string,
    color: undefined | string,
    display: undefined | 'none' | 'grid' | 'flex',
    float: undefined | 'left' | 'right' | 'inherit' | 'none',
    font: undefined | string,
    fontSize: undefined | string,
    fontWeight: undefined | string,
    gridTemplateRows: undefined | string,
    gridTemplateColumns: undefined | string,
    height: undefined | string,
    justifySelf: undefined | 'stretch' | 'center' | 'start' | 'end' | 'left' | 'right',
    lineHeight: undefined | string,
    margin: undefined | string,
    marginBottom: undefined | string,
    marginLeft: undefined | string,
    marginRight: undefined | string,
    marginTop: undefined | string,
    maxWidth: undefined | string,
    minWidth: undefined | string,
    objectFit: undefined | 'contain',
    padding: undefined | string,
    paddingTop: undefined | string,
    paddingLeft: undefined | string,
    paddingBottom: undefined | string,
    paddingTop: undefined | string,
    position: undefined | 'static' | 'relative' | 'fixed' | 'absolute' | 'sticky',
    textAlign: undefined | 'left' | 'right' | 'center' | 'justify' | 'initial' | 'inherit',
    textRendering: undefined | 'auto' | 'optimizeSpeed' | 'optimizeLegibility' | 'geometricPrecision',
    top: undefined | string | number,
    left: undefined | string | number,
    bottom: undefined | string | number,
    right: undefined | string | number,
    userSelect: undefined | 'all' | 'auto' | 'contain' | 'inherit' | 'initial' | 'none' | 'text' | 'unset',
    width: undefined | string,
    zIndex: undefined | string,
  }
`);

type Binding = {
  type: Type,
  value: unknown,
  dynamic: boolean
};
// TODO(jaked) full types for components
// TODO(jaked) types for HTML elements
const initEnv: Immutable.Map<string, Binding> = Immutable.Map({
  // TODO(jaked)
  // fill out all of HTML, figure out a scheme for common attributes

  // TODO(jaked)
  // the typechecker treats JSX tags as identifiers and looks them up in the evironment
  // but these identifiers appearing in non-JSX contexts should not be bound
  'a': {
    type: componentType({
      href: Type.undefinedOrString,
      className: Type.undefinedOrString,
      onClick: Type.undefinedOr(Type.functionType(
        [Type.unknown],
        Type.unknown
      )),
    }),
    value: 'a',
    dynamic: false
  },

  'body': {
    type: componentType({
      style: styleType,
    }),
    value: 'body',
    dynamic: false
  },

  'br': {
    type: componentType({
    }),
    value: 'br',
    dynamic: false
  },

  'button': {
    type: componentType({
      className: Type.undefinedOrString,
      onClick: Type.undefinedOr(Type.functionType(
        [Type.unknown],
        Type.unknown
      )),
    }),
    value: 'button',
    dynamic: false
  },

  'circle': {
    type: componentType({
      fill: Type.undefinedOrString,
      stroke: Type.undefinedOrString,
      strokeWidth: Type.undefinedOr(Type.numberOrString),
      cx: Type.numberOrString,
      cy: Type.numberOrString,
      r: Type.numberOrString,
    }),
    value: 'circle',
    dynamic: false,
  },

  'code': {
    type: componentType({
      style: styleType,
      // TODO(jaked) handle className prop
    }),
    value: 'code',
    dynamic: false,
  },

  'div': {
    type: componentType({
      className: Type.undefinedOrString,
      style: styleType
    }),
    value: 'div',
    dynamic: false
  },

  'ellipse': {
    type: componentType({
      fill: Type.undefinedOrString,
      stroke: Type.undefinedOrString,
      strokeWidth: Type.undefinedOr(Type.numberOrString),
      cx: Type.numberOrString,
      cy: Type.numberOrString,
      rx: Type.numberOrString,
      ry: Type.numberOrString,
    }),
    value: 'ellipse',
    dynamic: false
  },

  'footer': {
    type: componentType({
      className: Type.undefinedOrString,
    }),
    value: 'footer',
    dynamic: false
  },

  'g': {
    type: componentType({
      transform: Type.undefinedOrString,
    }),
    value: 'g',
    dynamic: false
  },

  'h1': {
    type: componentType({
      style: styleType,
    }),
    value: 'h1',
    dynamic: false
  },

  'head': {
    type: componentType({}),
    value: 'head',
    dynamic: false
  },

  'header': {
    type: componentType({
      className: Type.undefinedOrString,
      style: styleType
    }),
    value: 'header',
    dynamic: false
  },

  'hr': {
    type: componentType({}),
    value: 'hr',
    dynamic: false
  },

  'html': {
    type: componentType({}),
    value: 'html',
    dynamic: false
  },

  'img': {
    type: componentType({
      src: Type.string,
      width: Type.undefinedOrNumber,
      height: Type.undefinedOrNumber,
      style: styleType,
    }),
    value: 'img',
    dynamic: false
  },

  'input': {
    type: componentType({
      id: Type.undefinedOrString,
      autoFocus: Type.undefinedOr(Type.boolean), // TODO(jaked) handle flag attributes
      checked: Type.undefinedOr(Type.boolean),
      className: Type.undefinedOrString,
      type: Type.enumerate('text', 'range', 'checkbox'), // TODO(jaked) default to text
      min: Type.undefinedOrString,
      max: Type.undefinedOrString,
      value: Type.undefinedOrString,
      onChange: Type.undefinedOr(Type.functionType(
        [Type.object({
          currentTarget: Type.object({ value: Type.string })
        })],
        Type.unknown
      )),
      onInput: Type.undefinedOr(Type.functionType(
        [Type.object({
          currentTarget: Type.object({ value: Type.string })
        })],
        Type.unknown
      )),
      onKeyUp: Type.undefinedOr(Type.functionType(
        [Type.object({ keyCode: Type.number })],
        Type.unknown
      )),
      onClick: Type.undefinedOr(Type.functionType(
        [Type.unknown],
        Type.unknown
      )),
      placeholder: Type.undefinedOrString,
      bind: Type.undefinedOr(Type.intersection(
        Type.functionType([], Type.string),
        Type.functionType([Type.string], Type.undefined)
      ))
    }),
    value: 'input',
    dynamic: false
  },

  'label': {
    type: componentType({
      for: Type.undefinedOrString,
      onClick: Type.undefinedOr(Type.functionType(
        [Type.unknown],
        Type.unknown
      )),
      onDoubleClick: Type.undefinedOr(Type.functionType(
        [Type.unknown],
        Type.unknown
      )),
    }),
    value: 'label',
    dynamic: false
  },

  'li': {
    type: componentType({
      className: Type.undefinedOrString,
    }),
    value: 'li',
    dynamic: false
  },

  'p': {
    type: componentType({
      className: Type.undefinedOrString,
    }),
    value: 'p',
    dynamic: false
  },

  'section': {
    type: componentType({
      className: Type.undefinedOrString,
      style: styleType
    }),
    value: 'section',
    dynamic: false
  },

  'span': {
    type: componentType({
      className: Type.undefinedOrString,
      style: styleType,
      onClick: Type.undefinedOr(Type.functionType(
        [Type.unknown],
        Type.unknown
      )),
    }),
    value: 'span',
    dynamic: false
  },

  'strong': {
    type: componentType({
    }),
    value: 'strong',
    dynamic: false
  },

  'style': {
    type: componentType({
      dangerouslySetInnerHTML: Type.undefinedOr(Type.object({ __html: Type.string })),
    }),
    value: 'style',
    dynamic: false
  },

  'sub': {
    type: componentType({}),
    value: 'sub',
    dynamic: false
  },

  'sup': {
    type: componentType({}),
    value: 'sup',
    dynamic: false
  },

  'svg': {
    type: componentType({
      style: styleType,
      width: Type.numberOrString,
      height: Type.numberOrString,
    }),
    value: 'svg',
    dynamic: false
  },

  'title': {
    type: componentType({}),
    value: 'title',
    dynamic: false
  },

  'ul': {
    type: componentType({
      className: Type.undefinedOrString,
    }),
    value: 'ul',
    dynamic: false
  },

  'Inspector': {
    type: componentType({ data: Type.unknown }),
    value: Inspector,
    dynamic: false
  },

  'HighlightedCode': {
    type: componentType({
      // TODO(jaked) need a way to translate TypeScript types
      // theme: PrismTheme

      // TODO(jaked) enumerate supported languages
      language: Type.undefinedOr(Type.enumerate('typescript', 'markup')),

      style: styleType,
      inline: Type.undefinedOr(Type.boolean),
    }),
    value: HighlightedCode,
    dynamic: false
  },

  'Plot': {
    type: Parse.parseType(`{
      barX: (data: unknown, options: { x: string, y: string }) => unknown,
      barY: (data: unknown, options: { x: string, y: string }) => unknown,
    }`),
    value: Plot,
    dynamic: false
  },

  'PlotFigure': {
    type: componentType({
      options: Parse.parseType(`{
        marks: unknown[],
        height: number,
        width: number,
        marginTop: number,
        marginBottom: number,
      }`)
    }),
    value: PlotFigure,
    dynamic: false
  },

  'parseInt': {
    type: Type.functionType([ Type.string ], Type.number),
    value: (s: string) => parseInt(s),
    dynamic: false
  },

  'undefined': {
    type: Type.undefined,
    value: undefined,
    dynamic: false
  },

  'console': {
    type: Type.object({ log: Type.functionType([Type.string], Type.undefined) }),
    value: console,
    dynamic: false
  },

  'Math': {
    // TODO(jaked) current Babel parser handles this without the argument labels, maybe upgrade?
    type: Parse.parseType(`{
      PI: number,
      sin: (x: number) => number,
      cos: (x: number) => number,
      abs: (x: number) => number,
    }`),
    value: Math,
    dynamic: false
  },

  'now': {
    type: Type.number,
    value: now,
    dynamic: true
  },

  'mouse': {
    type: Parse.parseType('{ clientX: number, clientY: number }'),
    value: mouse,
    dynamic: true
  },

  'window': {
    type: Parse.parseType('{ innerWidth: number, innerHeight: number, scrollX: number, scrollY: number }'),
    value: window,
    dynamic: true
  }
});

export default initEnv;
