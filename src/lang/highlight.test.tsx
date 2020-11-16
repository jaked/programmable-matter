import * as Immutable from 'immutable';
import * as React from 'react';
import * as Parse from '../lang/Parse';
import Type from '../lang/Type';
import Typecheck from '../lang/Typecheck';
import { computeJsSpans, computeMdxSpans, Span } from './highlight';
import { bug } from '../util/bug';

// dummy components; we compare React trees but don't render them
function component(name: string) {
  // set the function name, for debugging
  const obj = {
    [name]: (props) => bug('unimplemented')
  };
  return obj[name];
}

export const H = {
  default: component('default'),
  atom: component('atom'),
  number: component('number'),
  string: component('string'),
  keyword: component('keyword'),
  definition: component('definition'),
  variable: component('variable'),
  property: component('property'),
  link: component('link'),
}

// render the text and spans into a list of nodes
// to make writing test cases easier
function renderSpans(text: string, spans: Span[]) {
  let nodes: React.ReactNode[] = [];
  let lastOffset = 0;

  for (const span of spans) {
    if (lastOffset < span.start) {
      nodes.push(text.slice(lastOffset, span.start))
    }
    nodes.push(
      React.createElement(
        H[span.tag],
        { 'status': span.status, 'link': span.link},
        text.slice(span.start, span.end)
      )
    );
    lastOffset = span.end
  }
  if (lastOffset < text.length) {
    nodes.push(text.slice(lastOffset));
  }
  return nodes;
}

describe('highlight', () => {
  function expectHighlightMdx(
    mdx: string,
    moduleTypeEnv: Immutable.Map<string, Type.ModuleType> = Immutable.Map(),
    expected: React.ReactNode,
  ) {
    // TODO(jaked) this is a lot of setup
    const ast = Parse.parse(mdx);
    const typeEnv = Immutable.Map<string, Type>();
    const exportTypes: { [s: string]: Type } = {};
    const annots = new Map<unknown, Type>();
    Typecheck.synthMdx('mdx', ast, moduleTypeEnv, typeEnv, exportTypes, annots);

    const spans: Span[] = [];
    computeMdxSpans(ast, annots, spans);
    const rendered = renderSpans(mdx, spans);
    expect(rendered).toEqual(expected);
  }

  function expectHighlightExpr(
    expr: string,
    expected: React.ReactNode,
  ) {
    // TODO(jaked) this is a lot of setup
    const ast = Parse.parseExpression(expr);
    const typeEnv = Immutable.Map<string, Type>();
    const annots = new Map<unknown, Type>();
    Typecheck.synth(ast, typeEnv, annots);

    const spans: Span[] = [];
    computeJsSpans(ast, annots, spans);
    const rendered = renderSpans(expr, spans);
    expect(rendered).toEqual(expected);
  }

  describe('objects', () => {
    it('highlights duplicate property name', () => {
      expectHighlightExpr(
        `{ foo: 7, foo: 9 }`,
        [
          <H.default>{'{'}</H.default>,
          ' ',
          <H.definition>foo</H.definition>,
          ': ',
          <H.number>7</H.number>,
          ', ',
          <H.definition status="duplicate property name 'foo'">foo</H.definition>,
          ': ',
          <H.number>9</H.number>,
          ' ',
          <H.default>{'}'}</H.default>
        ]
      );
    });

    it('highlights shorthand property on error', () => {
      expectHighlightExpr(
        `{ foo }`,
        [
          <H.default>{'{'}</H.default>,
          ' ',
          <H.definition status="unbound identifier 'foo'">foo</H.definition>,
          ' ',
          <H.default>{'}'}</H.default>,
        ]
      );
    });
  });

  describe('imports', () => {
    it('highlights module for missing module', () => {
      expectHighlightMdx(
        `import Foo from '/foo'`,
        Immutable.Map({ }),
        [
          <H.keyword>import</H.keyword>,
          ' ',
          <H.definition>Foo</H.definition>,
          ' from ',
          <H.link link='/foo' status="no module '/foo'">'/foo'</H.link>,
        ],
      );
    });

    it('highlights local name for missing default import', () => {
      expectHighlightMdx(
        `import Foo from '/foo'`,
        Immutable.Map({
          '/foo': Type.module({ })
        }),
        [
          <H.keyword>import</H.keyword>,
          ' ',
          <H.definition status="no default export on '/foo'">Foo</H.definition>,
          ' from ',
          <H.link link='/foo'>'/foo'</H.link>,
        ]
      );
    });

    it('highlights local name for missing named import without `as`', () => {
      expectHighlightMdx(
        `import { Foo } from '/foo'`,
        Immutable.Map({
          '/foo': Type.module({ })
        }),
        [
          <H.keyword>import</H.keyword>,
          ' { ',
          <H.definition status="no exported member 'Foo' on '/foo'">Foo</H.definition>,
          ' } from ',
          <H.link link='/foo'>'/foo'</H.link>,
        ],
      );
    });
  });

  describe('imports', () => {
    it('highlights identifier with erroneous initializer', () => {
      expectHighlightMdx(
        `export const f = g`,
        undefined,
        [
          <H.keyword>export</H.keyword>,
          ' ',
          <H.keyword>const</H.keyword>,
          ' ',
          <H.definition status="unbound identifier 'g'">f</H.definition>,
          ' = ',
          <H.variable status="unbound identifier 'g'">g</H.variable>,
        ],
      )
    });
  })

  describe('functions', () => {
    it(`highlights types in function definitions`, () => {
      expectHighlightMdx(
        `export const f = (x: boolean) => x`,
        undefined,
        [
          <H.keyword>export</H.keyword>,
          ' ',
          <H.keyword>const</H.keyword>,
          ' ',
          <H.definition>f</H.definition>,
          ' = (',
          <H.definition>x</H.definition>,
          ': ',
          <H.variable>boolean</H.variable>,
          ') => ',
          <H.variable>x</H.variable>,
        ],
      );
    });

    it(`highlights unknown types in function definitions`, () => {
      expectHighlightMdx(
        `export const f = (x: xyzzy) => x`,
        undefined,
        [
          <H.keyword>export</H.keyword>,
          ' ',
          <H.keyword>const</H.keyword>,
          ' ',
          <H.definition>f</H.definition>,
          ' = (',
          <H.definition>x</H.definition>,
          ': ',
          <H.variable status="unknown type">xyzzy</H.variable>,
          ') => ',
          <H.variable>x</H.variable>,
        ]
      );
    });
  });
});
