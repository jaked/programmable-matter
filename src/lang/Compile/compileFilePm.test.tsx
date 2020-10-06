import React from 'react';
import * as PMAST from '../../PMAST';
import File from '../../files/File';

import compileFilePm from './compileFilePm';

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
    React.createElement('p', {}, 'foo')
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
