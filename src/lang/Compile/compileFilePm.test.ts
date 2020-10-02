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

it('renders bold mark', () => {
  const compiled = compileFilePm(
    new File(
      'foo.pm',
      Buffer.from(PMAST.stringify([
        {
          type: 'p',
          children: [
            { text: 'foo' },
            { text: 'bar', bold: true },
            { text: 'baz' }
          ]
        }
      ])),
    ),
  );
  compiled.reconcile();
  expect(compiled.get().problems).toBeFalsy();

  compiled.get().rendered.reconcile();
  expect(compiled.get().rendered.get()).toEqual([
    React.createElement('p', {},
      'foo',
      React.createElement('strong', {}, 'bar'),
      'baz',
    )
  ]);
});
