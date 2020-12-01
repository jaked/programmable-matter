import React from 'react';
import TestRenderer from 'react-test-renderer';

import Signal from '../../util/Signal';
import compileFilePm from './compileFilePm';

// TODO(jaked)
// we might want to test styles; find a better way to handle this
function stripStyles(node: any) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach(stripStyles);
  }
  if ('props' in node) {
    const props = node.props;
    if ('style' in props) {
      delete props.style;
    }
  }
  if ('children' in node) {
    node.children.forEach(stripStyles);
  }
}

function expectRenderEqual(
  a: React.ReactNode, // TODO(jaked) fix in `rendered` API
  b: React.ReactElement,
) {
  const aRendered = TestRenderer.create(a as React.ReactElement).toJSON();
  stripStyles(aRendered);
  const bRendered = TestRenderer.create(b).toJSON();
  expect(aRendered).toEqual(bRendered);
}

describe('compileFilePm', () => {
  it('compiles', () => {
    const compiled = compileFilePm({
      type: 'pm',
      path: 'foo.pm',
      mtimeMs: Signal.ok(0),
      content: Signal.ok([
        {
          type: 'p',
          children: [
            { text: 'foo' }
          ]
        }
      ]),
    });
    expect(compiled.problems.get()).toBeFalsy();
    expectRenderEqual(
      compiled.rendered.get(),
      <p><span>foo</span></p>,
    );
  });

  it('renders marks', () => {
    const compiled = compileFilePm({
      type: 'pm',
      path: 'foo.pm',
      mtimeMs: Signal.ok(0),
      content: Signal.ok([
        {
          type: 'p',
          children: [
            { text: 'foo' },
            { text: 'bar', bold: true },
            { text: 'baz', underline: true },
            { text: 'quux', bold: true, italic: true },
          ]
        }
      ]),
    });
    expect(compiled.problems.get()).toBeFalsy();
    expectRenderEqual(
      compiled.rendered.get(),
      <p>
        <span>foo</span>
        <span><strong>bar</strong></span>
        <span><u>baz</u></span>
        <span><em><strong>quux</strong></em></span>
      </p>
    );
  });

  it('renders elements', () => {
    const compiled = compileFilePm({
      type: 'pm',
      path: 'foo.pm',
      mtimeMs: Signal.ok(0),
      content: Signal.ok([
        { type: 'p', children: [{ text: 'foo' }] },
        { type: 'h1', children: [{ text: 'bar' }] },
        { type: 'ul', children: [
          { type: 'li', children: [{ text: 'baz', bold: true }] }
        ] },
      ]),
    });
    expect(compiled.problems.get()).toBeFalsy();
    expectRenderEqual(
      compiled.rendered.get(),
      <>
        <p><span>foo</span></p>
        <h1><span>bar</span></h1>
        <ul><li><span><strong>baz</strong></span></li></ul>
      </>
    );
  });

  it('renders links', () => {
    const compiled = compileFilePm({
      type: 'pm',
      path: 'foo.pm',
      mtimeMs: Signal.ok(0),
      content: Signal.ok([
        { type: 'p', children: [
          { type: 'a', href: 'https://foo.bar', children: [
            { text: 'foo' }
          ] },
        ]},
      ]),
    });
    expect(compiled.problems.get()).toBeFalsy();
    expectRenderEqual(
      compiled.rendered.get(),
      <>
        <p><a href='https://foo.bar'><span>foo</span></a></p>
      </>
    );
  });
});
