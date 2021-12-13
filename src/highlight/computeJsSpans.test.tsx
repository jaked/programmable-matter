import * as React from 'react';
import { InterfaceMap } from '../model';
import * as Parse from '../parse';
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
  boolean: component('boolean'),
  number: component('number'),
  string: component('string'),
  keyword: component('keyword'),
  definition: component('definition'),
  variable: component('variable'),
  property: component('property'),
  link: component('link'),
}

// render the text and spans into a tree of nodes
// to make writing test cases easier
// assume spans are well-nested, outer spans before inner spans
function renderSpans(text: string, spans: Span[]) {
  spans = [
    ...spans,
    // sentinel so open spans are closed at end
    { start: text.length, end: text.length, tokenType: 'default' as const }
  ]

  let stack: { span: Span, children: React.ReactNode[] }[] = [];
  stack.push({
    // dummy root, not closed by sentinel
    span: { start: 0, end: text.length + 1, tokenType: 'default' },
    children: []
  });
  let top = stack[stack.length - 1];

  let textOffset = 0;

  for (const span of spans) {
    // close open spans that don't enclose the current span
    while (top.span.end <= span.start) {
      if (textOffset < top.span.end) {
        top.children.push(text.slice(textOffset, top.span.end));
        textOffset = top.span.end;
      }
      stack.pop();
      const newTop = stack[stack.length - 1];
      newTop.children.push(
        React.createElement(
          H[top.span.tokenType],
          { status: top.span.status, link: top.span.link },
          ...top.children
        )
      );
      top = newTop;
    }

    if (textOffset < span.start) {
      top.children.push(text.slice(textOffset, span.start));
      textOffset = span.start;
    }

    stack.push({ span, children: [] });
    top = stack[stack.length - 1];
  }

  return React.createElement(React.Fragment, undefined, ...stack[0].children);
}

function expectHighlightExpr(
  expr: string,
  expected: React.ReactNode,
) {
  // TODO(jaked) this is a lot of setup
  const ast = Parse.parseExpression(expr);
  const env = Typecheck.env();
  const interfaceMap: InterfaceMap = new Map();
  Typecheck.synth(ast, env, interfaceMap);

  const spans: Span[] = [];
  computeJsSpans(ast, interfaceMap, spans);
  const rendered = renderSpans(expr, spans);
  expect(rendered).toEqual(expected);
}

describe('objects', () => {
  it('highlights duplicate property name', () => {
    expectHighlightExpr(
      `{ foo: 7, foo: 9 }`,
      <>
        {'{ ' }
        <H.definition>foo</H.definition>
        {': '}
        <H.number>7</H.number>
        {', '}
        <H.default status="duplicate property name 'foo'">
          <H.definition>foo</H.definition>
        </H.default>
        {': '}
        <H.number>9</H.number>
        {' }'}
      </>
    );
  });

  it('highlights shorthand property on error', () => {
    expectHighlightExpr(
      `{ foo }`,
      <>
        {'{ '}
        <H.default status="unbound identifier 'foo'">
          <H.definition>foo</H.definition>
        </H.default>
        {' }'}
      </>
    );
  });
});

describe('types', () => {
  it('highlights unknown types', () => {
    expectHighlightExpr(
      `x as foo`,
      <>
        <H.default status="unbound identifier 'x'">
          <H.default status="unbound identifier 'x'">
            <H.variable>x</H.variable>
          </H.default>
          {' as '}
          <H.default status="unknown abstract type 'foo'">
            <H.variable>foo</H.variable>
          </H.default>
        </H.default>
      </>
    );
  });
});
