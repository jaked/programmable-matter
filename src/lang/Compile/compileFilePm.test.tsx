import React from 'react';
import * as PMAST from '../../PMAST';
import File from '../../files/File';

import compileFilePm from './compileFilePm';

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
    expect(compiled.get().rendered.get()).toEqual([
      <p>foo</p>
    ]);
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
    expect(compiled.get().rendered.get()).toEqual([
      <p>
        foo
        <strong>bar</strong>
        <u>baz</u>
        <em><strong>quux</strong></em>
      </p>
    ]);
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
    expect(compiled.get().rendered.get()).toEqual([
      <p>foo</p>,
      <h1>bar</h1>,
      <h2><strong>baz</strong></h2>,
    ]);
  });
});
