import * as Immutable from 'immutable';
import * as React from 'react';
import { Interface } from '../model';
import * as Parse from '../Parse';
import * as ESTree from '../estree';
import Typecheck from '../typecheck';
import { Span } from './types';
import { computeJsSpans } from './computeJsSpans';
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
function expectHighlightExpr(
  expr: string,
  expected: React.ReactNode,
) {
  // TODO(jaked) this is a lot of setup
  const ast = Parse.parseExpression(expr);
  const interfaceEnv = Immutable.Map<string, Interface>();
  const interfaceMap = new Map<ESTree.Node, Interface>();
  Typecheck.synth(ast, interfaceEnv, interfaceMap);

  const spans: Span[] = [];
  computeJsSpans(ast, interfaceMap, spans);
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

describe('types', () => {
  it('highlights unknown types', () => {
    expectHighlightExpr(
      `x as foo`,
      [
        <H.variable status="unknown abstract type 'foo'">x</H.variable>,
        ' as ',
        <H.variable status="unknown abstract type 'foo'">foo</H.variable>
      ]
    );
  });
});
