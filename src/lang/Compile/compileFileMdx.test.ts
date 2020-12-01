import * as Immutable from 'immutable';
import React from 'react';
import Signal from '../../util/Signal';
import Type from '../Type';
import * as data from '../../data';

import compileFileMdx from './compileFileMdx';

const setSelected = (s: string) => {}

it('compiles', () => {
  const compiled = compileFileMdx(
    {
      type: 'mdx',
      path: 'foo.mdx',
      mtimeMs: Signal.ok(0),
      content: Signal.ok(`foo`)
    },
    Signal.ok(Immutable.Map()),
    Signal.ok(Immutable.Map()),
    setSelected
  );
  compiled.reconcile();
  compiled.get().problems.reconcile();
  expect(compiled.get().problems.get()).toBeFalsy();

  compiled.get().rendered.reconcile();
  expect(compiled.get().rendered.get()).toEqual(
    [
      null, null, null, null, // TODO(jaked) not sure where these come from
      React.createElement('p', {}, 'foo')
    ]
  );
});

it('compiles `a` tag', () => {
  const compiled = compileFileMdx(
    {
      type: 'mdx',
      path: 'foo.mdx',
      mtimeMs: Signal.ok(0),
      content: Signal.ok(`<a href='foo'>bar</a>`)
    },
    Signal.ok(Immutable.Map()),
    Signal.ok(Immutable.Map()),
    setSelected
  );
  compiled.reconcile();
  compiled.get().problems.reconcile();
  expect(compiled.get().problems.get()).toBeFalsy();

  compiled.get().rendered.reconcile();
  expect(compiled.get().rendered.get()).toEqual(
    [
      null, null, null, null, // TODO(jaked) not sure where these come from
      React.createElement('a', { href: 'foo' }, 'bar')
    ]
  );
});

it('compiles referencing data / table', () => {
  const compiled = compileFileMdx(
    {
      type: 'mdx',
      path: 'foo.mdx',
      mtimeMs: Signal.ok(0),
      content: Signal.ok(`foo <>{data.bar}</> <>{table.baz}</>`)
    },
    Signal.ok(Immutable.Map({
      'foo.json': Signal.ok({
        exportType: Signal.ok(Type.module({ mutable: Type.object({ bar: Type.string }) })),
        exportValue: Signal.ok({ mutable: Signal.ok({ bar: 'bar' }) }),
        rendered: Signal.ok(null),
        problems: Signal.ok(false),
        ast: Signal.err(new Error(`unimplemented`))
      }),
      'foo.table': Signal.ok({
        exportType: Signal.ok(Type.module({ default: Type.object({ baz: Type.number }) })),
        exportValue: Signal.ok({ default: Signal.ok({ baz: 7 }) }),
        rendered: Signal.ok(null),
        problems: Signal.ok(false),
        ast: Signal.err(new Error(`unimplemented`))
      })
    })),
    Signal.ok(Immutable.Map()),
    setSelected
  );
  compiled.reconcile();
  compiled.get().problems.reconcile();
  expect(compiled.get().problems.get()).toBeFalsy();

  compiled.get().rendered.reconcile();
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
    {
      type: 'mdx',
      path: 'foo.mdx',
      mtimeMs: Signal.ok(0),
      content: Signal.ok(`foo`)
    },
    Signal.ok(Immutable.Map({
      'foo.meta': Signal.ok({
        exportType: Signal.ok(Type.module({ })),
        exportValue: Signal.ok({ default: Signal.ok({ layout: 'layout' }) }),
        rendered: Signal.ok(null),
        problems: Signal.ok(false),
        ast: Signal.err(new Error(`unimplemented`))
      }),
    })),
    Signal.ok(Immutable.Map({
      'layout': {
        name: 'layout',
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
  compiled.reconcile();
  compiled.get().problems.reconcile();
  expect(compiled.get().problems.get()).toBeFalsy();

  compiled.get().rendered.reconcile();
  expect(compiled.get().rendered.get()).toEqual(
    React.createElement('div', {},
      null, null, null, null,
      React.createElement('p', {}, 'foo')
    )
  );
});

