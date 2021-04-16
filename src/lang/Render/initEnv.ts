import * as Parse from '../Parse';
import Type from '../Type';

import * as Immutable from 'immutable';

import 'regenerator-runtime/runtime'; // required for react-inspector
import { Inspector } from 'react-inspector';

import { TwitterTweetEmbed } from 'react-twitter-embed';
import YouTube from 'react-youtube';
import { VictoryBar, VictoryChart } from 'victory';
import ReactTable from 'react-table';
import Gist from 'react-gist';
import { InlineMath, BlockMath } from 'react-katex';

import HighlightedCode from '../HighlightedCode';

import Signal from '../../util/Signal';

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
const styleType = Type.undefinedOr(Type.object({
  background: Type.undefinedOrString,
  backgroundColor: Type.undefinedOrString,
  borderRadius: Type.undefinedOrString,
  borderStyle: Type.undefinedOrString,
  borderTop: Type.undefinedOrString,
  borderWidth: Type.undefinedOrString,
  boxShadow: Type.undefinedOrString,
  color: Type.undefinedOrString,
  float: Type.undefinedOr(Type.enumerate('left', 'right', 'inherit', 'none')),
  font: Type.undefinedOrString,
  fontSize: Type.undefinedOrString,
  fontWeight: Type.undefinedOrString,
  height: Type.undefinedOrString,
  lineHeight: Type.undefinedOrString,
  margin: Type.undefinedOrString,
  marginBottom: Type.undefinedOrString,
  marginLeft: Type.undefinedOrString,
  marginRight: Type.undefinedOrString,
  marginTop: Type.undefinedOrString,
  maxWidth: Type.undefinedOrString,
  minWidth: Type.undefinedOrString,
  objectFit: Type.undefinedOr(Type.enumerate('contain')),
  padding: Type.undefinedOrString,
  position: Type.undefinedOr(Type.enumerate('static', 'relative', 'fixed', 'absolute', 'sticky')),
  textAlign: Type.undefinedOr(Type.enumerate('left', 'right', 'center', 'justify', 'initial', 'inherit')),
  textRendering: Type.undefinedOr(Type.enumerate('auto', 'optimizeSpeed', 'optimizeLegibility', 'geometricPrecision')),
  top: Type.undefinedOr(Type.union(Type.string, Type.number)),
  left: Type.undefinedOr(Type.union(Type.string, Type.number)),
  bottom: Type.undefinedOr(Type.union(Type.string, Type.number)),
  right: Type.undefinedOr(Type.union(Type.string, Type.number)),
  userSelect: Type.undefinedOr(Type.enumerate('all', 'auto', 'contain', 'inherit', 'initial', 'none', 'text', 'unset')),
  width: Type.undefinedOrString,
  zIndex: Type.undefinedOrString,
}));

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

  // TODO(jaked)
  // this is an MDX thing, I think it can be removed
  'inlineCode': {
    type: componentType({}),
    value: 'inlineCode',
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

  'Tweet': {
    type: componentType({ tweetId: Type.string }),
    value: TwitterTweetEmbed,
    dynamic: false
  },

  'YouTube': {
    type: componentType({ videoId: Type.string }),
    value: YouTube,
    dynamic: false
  },

  'Gist': {
    type: componentType({ id: Type.string }),
    value: Gist,
    dynamic: false
  },

  // TODO(jaked) tighten this up. need a type parameter for data
  'VictoryBar': {
    type: componentType({
      data: Type.unknown,
      x: Type.string,
      y: Type.string,
    }),
    value: VictoryBar,
    dynamic: false
  },

  'VictoryChart': {
    type: componentType({
      domainPadding: Type.undefinedOrNumber,
    }),
    value: VictoryChart,
    dynamic: false
  },

  'Inspector': {
    type: componentType({ data: Type.unknown }),
    value: Inspector,
    dynamic: false
  },

  'Table': {
    type: componentType({
      data: Type.array(Type.object({})),
      // TODO(jaked)
      // column accessor types depend on data type (for Victory too)
      // can we express this with a type parameter?
      columns: Type.array(Type.object({
        Header: Type.string,
        accessor: Type.string,
      })),
      pageSize: Type.number,
    }),
    value: ReactTable,
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
