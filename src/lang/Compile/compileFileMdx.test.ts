import * as Immutable from 'immutable';
import React from 'react';
import Signal from '../../util/Signal';
import Try from '../../util/Try';
import Type from '../Type';
import * as data from '../../data';

import compileFileMdx from './compileFileMdx';

const setSelected = (s: string) => {}

it('compiles', () => {
  const compiled = compileFileMdx(
    new data.File(
      'foo.mdx',
      Signal.cellOk(Buffer.from(`foo`))
    ),
    Signal.ok(Immutable.Map()),
    Signal.ok(Immutable.Map()),
    setSelected
  );
  compiled.reconcile(1);
  expect(compiled.get().problems).toBeFalsy();

  compiled.get().rendered.reconcile(1);
  expect(compiled.get().rendered.get()).toEqual(
    [
      null, null, null, null, // TODO(jaked) not sure where these come from
      React.createElement('p', {}, 'foo')
    ]
  );
});

it('compiles `a` tag', () => {
  const compiled = compileFileMdx(
    new data.File(
      'foo.mdx',
      Signal.cellOk(Buffer.from(`<a href='foo'>bar</a>`))
    ),
    Signal.ok(Immutable.Map()),
    Signal.ok(Immutable.Map()),
    setSelected
  );
  compiled.reconcile(1);
  expect(compiled.get().problems).toBeFalsy();

  compiled.get().rendered.reconcile(1);
  expect(compiled.get().rendered.get()).toEqual(
    [
      null, null, null, null, // TODO(jaked) not sure where these come from
      React.createElement('a', { href: 'foo' }, 'bar')
    ]
  );
});

it('compiles referencing data / table', () => {
  const compiled = compileFileMdx(
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
  compiled.reconcile(1);
  expect(compiled.get().problems).toBeFalsy();

  compiled.get().rendered.reconcile(1);
  expect(compiled.get().rendered.get()).toEqual(
    [
      null, null, null, null,
      React.createElement('p', {}, 'foo ', [ 'bar' ], ' ', [ 7 ])
    ]
  );
});

it('compiles with layout', () => {
  console.error = jest.fn(); // suppress React warning about key props

  const compiled = compileFileMdx(
    new data.File(
      'foo.mdx',
      Signal.cellOk(Buffer.from(`foo`))
    ),
    Signal.ok(Immutable.Map({
      'foo.meta': Signal.ok({
        exportType: Type.module({ }),
        exportValue: { default: Signal.ok({ layout: 'layout' }) },
        rendered: Signal.ok(null),
        problems: false,
        ast: Try.err(new Error(`unimplemented`))
      }),
    })),
    Signal.ok(Immutable.Map({
      'layout': {
        name: 'layout',
        isIndex: false,
        meta: Signal.ok(data.Meta({})),
        files: {},
        problems: Signal.ok(false),
        rendered: Signal.ok(null),
        publishedType: Signal.ok('html' as const),
        exportType: Signal.ok(Type.module({
          default: Type.layoutFunctionType,
        })),
        exportValue: Signal.ok({
          default: Signal.ok((props: { children: React.ReactNode, meta: data.Meta }) =>
            React.createElement('div', {}, props.children)
          )
        })
      }
    })),
    setSelected
  );
  compiled.reconcile(1);
  expect(compiled.get().problems).toBeFalsy();

  compiled.get().rendered.reconcile(1);
  expect(compiled.get().rendered.get()).toEqual(
    React.createElement('div', {},
      null, null, null, null,
      React.createElement('p', {}, 'foo')
    )
  );
});

