import * as Immutable from 'immutable';
import React from 'react';
import TestRenderer from 'react-test-renderer';

import Signal from '../../util/Signal';
import Type from '../Type';
import * as data from '../../data';

import compileFileMdx from './compileFileMdx';

const setSelected = (s: string) => {}

console.error = jest.fn(); // suppress React warning about key props

function expectRenderEqual(
  a: React.ReactNode, // TODO(jaked) fix in `rendered` API
  b: React.ReactElement,
) {
  const aRendered = TestRenderer.create(a as React.ReactElement).toJSON();
  const bRendered = TestRenderer.create(b).toJSON();
  expect(aRendered).toEqual(bRendered);
}

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
  expect(compiled.problems.get()).toBeFalsy();
  expectRenderEqual(
    compiled.rendered.get(),
    <p>foo</p>
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
  expect(compiled.problems.get()).toBeFalsy();
  expectRenderEqual(
    compiled.rendered.get(),
    <a href='foo'>bar</a>
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
      'foo.json': {
        exportType: Signal.ok(Type.module({ mutable: Type.object({ bar: Type.string }) })),
        exportValue: Signal.ok({ mutable: Signal.ok({ bar: 'bar' }) }),
        rendered: Signal.ok(null),
        problems: Signal.ok(false),
        ast: Signal.err(new Error(`unimplemented`))
      },
      'foo.table': {
        exportType: Signal.ok(Type.module({ default: Type.object({ baz: Type.number }) })),
        exportValue: Signal.ok({ default: Signal.ok({ baz: 7 }) }),
        rendered: Signal.ok(null),
        problems: Signal.ok(false),
        ast: Signal.err(new Error(`unimplemented`))
      }
    })),
    Signal.ok(Immutable.Map()),
    setSelected
  );
  expect(compiled.problems.get()).toBeFalsy();
  // TODO(jaked) I don't understand why it's necessary to split up the rendering
  expectRenderEqual(
    compiled.rendered.get(),
    <p>foo {'bar'} {7}</p>
  );
});

it('compiles with layout', () => {
  const compiled = compileFileMdx(
    {
      type: 'mdx',
      path: 'foo.mdx',
      mtimeMs: Signal.ok(0),
      content: Signal.ok(`foo`)
    },
    Signal.ok(Immutable.Map({
      'foo.meta': {
        exportType: Signal.ok(Type.module({ })),
        exportValue: Signal.ok({ default: Signal.ok({ layout: 'layout' }) }),
        rendered: Signal.ok(null),
        problems: Signal.ok(false),
        ast: Signal.err(new Error(`unimplemented`))
      },
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
  expect(compiled.problems.get()).toBeFalsy();
  expectRenderEqual(
    compiled.rendered.get(),
    <div><p>foo</p></div>
  );
});
