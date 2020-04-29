import * as Immutable from 'immutable';
import React from 'react';
import Signal from '../../util/Signal';
import Try from '../../util/Try';
import Trace from '../../util/Trace';
import Type from '../Type';
import * as data from '../../data';

import compileFileMdx from './compileFileMdx';

const trace = new Trace();
const setSelected = (s: string) => {}

it('compiles', () => {
  const compiled = compileFileMdx(
    trace,
    new data.File(
      'foo.mdx',
      Signal.cellOk(Buffer.from(`foo`))
    ),
    Signal.ok(Immutable.Map()),
    Signal.ok(Immutable.Map()),
    setSelected
  );
  compiled.reconcile(trace, 1);
  expect(compiled.get().problems).toBeFalsy();

  compiled.get().rendered.reconcile(trace, 1);
  expect(compiled.get().rendered.get()).toEqual(
    [
      null, null, null, null, // TODO(jaked) not sure where these come from
      React.createElement('p', {}, 'foo')
    ]
  );
});

it('compiles referencing data / table', () => {
  const compiled = compileFileMdx(
    trace,
    new data.File(
      'foo.mdx',
      Signal.cellOk(Buffer.from(`foo <>{data.bar}</> <>{table.baz}</>`))
    ),
    Signal.ok(Immutable.Map({
      'foo.json': Signal.ok({
        exportType: Type.module({ mutable: Type.object({ bar: Type.string }) }),
        exportValue: { mutable: Signal.ok({ bar: 'bar' }) },
        rendered: Signal.ok(null),
        problems: false,
        ast: Try.err(new Error(`unimplemented`))
      }),
      'foo.table': Signal.ok({
        exportType: Type.module({ default: Type.object({ baz: Type.number }) }),
        exportValue: { default: Signal.ok({ baz: 7 }) },
        rendered: Signal.ok(null),
        problems: false,
        ast: Try.err(new Error(`unimplemented`))
      })
    })),
    Signal.ok(Immutable.Map()),
    setSelected
  );
  compiled.reconcile(trace, 1);
  expect(compiled.get().problems).toBeFalsy();

  compiled.get().rendered.reconcile(trace, 1);
  expect(compiled.get().rendered.get()).toEqual(
    [
      null, null, null, null,
      React.createElement('p', {}, 'foo ', [ 'bar' ], ' ', [ 7 ])
    ]
  );
});