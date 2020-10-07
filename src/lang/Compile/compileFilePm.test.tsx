import React from 'react';
import TestRenderer from 'react-test-renderer';
import * as PMAST from '../../PMAST';
import File from '../../files/File';

import compileFilePm from './compileFilePm';

function expectRenderEqual(
  a: React.ReactNode, // TODO(jaked) fix in `rendered` API
  b: React.ReactElement,
) {
  const aRendered = TestRenderer.create(a as React.ReactElement).toJSON();
  const bRendered = TestRenderer.create(b).toJSON();
  expect(aRendered).toEqual(bRendered);
}

describe('compileFilePm', () => {
  it('compiles', () => {
    const compiled = compileFilePm(
      new File(
        'foo.pm',
        Buffer.from(PMAST.stringify([
          {
            type: 'p',
            children: [
              { text: 'foo' }
            ]
          }
        ])),
      ),
    );
    compiled.reconcile();
    expect(compiled.get().problems).toBeFalsy();

    compiled.get().rendered.reconcile();
    expectRenderEqual(
      compiled.get().rendered.get(),
      <p><span>foo</span></p>,
    );
  });

  it('renders marks', () => {
    const compiled = compileFilePm(
      new File(
        'foo.pm',
        Buffer.from(PMAST.stringify([
          {
            type: 'p',
            children: [
              { text: 'foo' },
              { text: 'bar', bold: true },
              { text: 'baz', underline: true },
              { text: 'quux', bold: true, italic: true },
            ]
          }
        ])),
      ),
    );
    compiled.reconcile();
    expect(compiled.get().problems).toBeFalsy();

    compiled.get().rendered.reconcile();
    expectRenderEqual(
      compiled.get().rendered.get(),
      <p>
        <span>foo</span>
        <span><strong>bar</strong></span>
        <span><u>baz</u></span>
        <span><em><strong>quux</strong></em></span>
      </p>
    );
  });

  it('renders headers', () => {
    const compiled = compileFilePm(
      new File(
        'foo.pm',
        Buffer.from(PMAST.stringify([
          { type: 'p', children: [{ text: 'foo' }] },
          { type: 'h1', children: [{ text: 'bar' }] },
          { type: 'h2', children: [{ text: 'baz', bold: true }] },
        ])),
      ),
    );
    compiled.reconcile();
    expect(compiled.get().problems).toBeFalsy();

    compiled.get().rendered.reconcile();
    expectRenderEqual(
      compiled.get().rendered.get(),
      <>
        <p><span>foo</span></p>
        <h1><span>bar</span></h1>
        <h2><span><strong>baz</strong></span></h2>
      </>
    );
  });
});
