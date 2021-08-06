import { createHyperscript } from 'slate-hyperscript';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      editor: any;
      anchor: any;
      focus: any;
      cursor: any;
      fragment: any;

      // TODO(jaked)
      // we can't override the React `text` declaration
      // and I can't figure out how to omit it
      // so we use an alternate name
      stext: { children?: any, bold?: boolean };
      liveCode: any;
      inlineLiveCode: any;
    }
  }
}

export const jsx = createHyperscript({
  elements: {
    'p': { type: 'p' },
    'h1': { type: 'h1' },
    'li': { type: 'li' },
    'ol': { type: 'ol' },
    'ul': { type: 'ul' },
    'a': { type: 'a' },
    'code': { type: 'code' },
    'liveCode': { type: 'liveCode' },
    'inlineLiveCode': { type: 'inlineLiveCode' },
    'blockquote': { type: 'blockquote' },
  },
  creators: {
    'stext': (tag, attrs, ...children) => jsx('text', attrs, ...children),
  }
});
