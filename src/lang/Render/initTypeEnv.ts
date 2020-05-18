import Type from '../Type';
import Typecheck from '../Typecheck';

// TODO(jaked) move to Typecheck?
function componentType(props: { [f: string]: Type }): Type {
  return Type.abstract('React.Component', Type.object(props));
}

// TODO(jaked) need a way to translate TypeScript types
const styleType = Type.undefinedOr(Type.object({
  backgroundColor: Type.undefinedOrString,
  float: Type.undefinedOr(Type.enumerate('left', 'right', 'inherit', 'none')),
  fontSize: Type.undefinedOrString,
  height: Type.undefinedOrString,
  margin: Type.undefinedOrString,
  marginBottom: Type.undefinedOrString,
  marginLeft: Type.undefinedOrString,
  marginRight: Type.undefinedOrString,
  marginTop: Type.undefinedOrString,
  maxWidth: Type.undefinedOrString,
  objectFit: Type.undefinedOr(Type.enumerate('contain')),
  padding: Type.undefinedOrString,
}));

// TODO(jaked) full types for components
// TODO(jaked) types for HTML elements
export const initTypeEnv = Typecheck.env({
  // TODO(jaked)
  // fill out all of HTML, figure out a scheme for common attributes

  'a': componentType({
    href: Type.undefinedOrString,
    className: Type.undefinedOrString,
  }),

  'body': componentType({}),

  'button': componentType({
    className: Type.undefinedOrString,
  }),

  'code': componentType({
    // TODO(jaked) handle className prop
  }),

  'div': componentType({
    className: Type.undefinedOrString,
    style: styleType
  }),

  'ellipse': componentType({
    fill: Type.undefinedOrString,
    stroke: Type.undefinedOrString,
    cx: Type.numberOrString,
    cy: Type.numberOrString,
    rx: Type.numberOrString,
    ry: Type.numberOrString,
  }),

  'h1': componentType({
    style: styleType,
  }),

  'head': componentType({}),

  'header': componentType({
    className: Type.undefinedOrString,
    style: styleType
  }),

  'html': componentType({}),

  'footer': componentType({
    className: Type.undefinedOrString,
  }),

  'img': componentType({
    src: Type.string,
    width: Type.undefinedOrNumber,
    height: Type.undefinedOrNumber,
    style: styleType,
  }),

  'inlineCode': componentType({}),

  'input': componentType({
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
      Type.undefined // TODO(jaked) Type.void?
    )),
    placeholder: Type.undefinedOrString,
    bind: Type.undefinedOr(Type.intersection(
      Type.functionType([], Type.string),
      Type.functionType([Type.string], Type.undefined)
    ))
  }),

  'label': componentType({
    for: Type.undefinedOrString,
  }),

  'li': componentType({
    className: Type.undefinedOrString,
  }),

  'section': componentType({
    className: Type.undefinedOrString,
    style: styleType
  }),

  'span': componentType({
    className: Type.undefinedOrString,
  }),

  'strong': componentType({
  }),

  'style': componentType({
    dangerouslySetInnerHTML: Type.undefinedOr(Type.object({ __html: Type.string })),
  }),

  'svg': componentType({
    width: Type.numberOrString,
    height: Type.numberOrString,
  }),

  'title': componentType({}),

  'ul': componentType({
    className: Type.undefinedOrString,
  }),

  'Link': componentType({ to: Type.string }),

  'Tweet': componentType({ tweetId: Type.string }),
  'YouTube': componentType({ videoId: Type.string }),
  'Gist': componentType({ id: Type.string }),

  // TODO(jaked) tighten this up. need a type parameter for data
  'VictoryBar': componentType({
    data: Type.unknown,
    x: Type.string,
    y: Type.string,
  }),
  'VictoryChart': componentType({
    domainPadding: Type.undefinedOrNumber,
  }),

  'Inspector': componentType({ data: Type.unknown }),

  'Table': componentType({
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

  'HighlightedCode': componentType({
    // TODO(jaked) need a way to translate TypeScript types
    // theme: PrismTheme

    // TODO(jaked) enumerate supported languages
    language: Type.undefinedOr(Type.singleton('typescript')),

    style: styleType,
    inline: Type.undefinedOr(Type.boolean),
  }),

  'parseInt':
    Type.functionType([ Type.string ], Type.number),
});
