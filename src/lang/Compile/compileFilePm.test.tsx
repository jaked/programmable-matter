import * as Immutable from 'immutable';
import React from 'react';
import TestRenderer from 'react-test-renderer';

import Signal from '../../util/Signal';
import Type from '../Type';
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

it('compiles', () => {
  const compiled = compileFilePm({
    type: 'pm',
    path: '/foo.pm',
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

it('compiles exports', () => {
  const compiled = compileFilePm({
    type: 'pm',
    path: '/foo.pm',
    mtimeMs: Signal.ok(0),
    content: Signal.ok([
      {
        type: 'code',
        children: [
          { text: 'export const foo = 7' }
        ]
      }
    ]),
  });
  expect(compiled.problems.get()).toBeFalsy();
  expect(compiled.exportType.get().getFieldType('foo')).toEqual(Type.singleton(7));
  expect(compiled.exportValue.get()['foo'].get()).toEqual(7);
});

it('reports errors', () => {
  const compiled = compileFilePm({
    type: 'pm',
    path: '/foo.pm',
    mtimeMs: Signal.ok(0),
    content: Signal.ok([
      {
        type: 'code',
        children: [
          { text: 'x' }
        ]
      }
    ]),
  });
  expect(compiled.problems.get()).toBeTruthy();
});

it('renders marks', () => {
  const compiled = compileFilePm({
    type: 'pm',
    path: '/foo.pm',
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
    path: '/foo.pm',
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
    path: '/foo.pm',
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

it('compiles code', () => {
  const compiled = compileFilePm({
    type: 'pm',
    path: '/foo.pm',
    mtimeMs: Signal.ok(0),
    content: Signal.ok([
      { type: 'code', children: [
        { text: 'export const foo = 7' }
      ]},
      { type: 'p', children: [
        { text: 'foo is '},
        { type: 'inlineCode', children: [
          { text: 'foo' }
        ]},
      ]}
    ]),
  });
  expect(compiled.problems.get()).toBeFalsy();
  expectRenderEqual(
    compiled.rendered.get(),
    <>
      <p><span>foo is </span>7</p>
    </>
  );
});

it('compiles with import', () => {
  const compiled = compileFilePm(
    {
      type: 'pm',
      path: '/foo.pm',
      mtimeMs: Signal.ok(0),
      content: Signal.ok([
        { type: 'code', children: [
          { text: `import { bar } from '/baz'` }
        ]},
        { type: 'p', children: [
          { text: 'bar is '},
          { type: 'inlineCode', children: [
            { text: 'bar' }
          ]},
        ]}
      ])
    },
    Signal.ok(Immutable.Map()),
    Signal.ok(Immutable.Map({
      '/baz': {
        name: '/baz',
        meta: Signal.err(new Error('meta')),
        files: {},
        problems: Signal.err(new Error('problems')),
        rendered: Signal.err(new Error('rendered')),
        publishedType: Signal.err(new Error('publishedType')),
        exportType: Signal.ok(Type.module({ bar: Type.number })),
        exportValue: Signal.ok({ bar: Signal.ok(9) }),
      },
    })),
  );
  expect(compiled.problems.get()).toBeFalsy();
  expectRenderEqual(
    compiled.rendered.get(),
    <>
      <p><span>bar is </span>9</p>
    </>
  );
});

it('compiles referencing data / table', () => {
  const compiled = compileFilePm(
    {
      type: 'pm',
      path: '/foo.pm',
      mtimeMs: Signal.ok(0),
      content: Signal.ok([
        { type: 'p', children: [
          { text: 'foo ' },
          { type: 'inlineCode', children: [{ text: 'data.bar' }]},
          { text: ' ' },
          { type: 'inlineCode', children: [{ text: 'table.baz' }]},
        ]},
      ])
    },
    Signal.ok(Immutable.Map({
      '/foo.json': {
        exportType: Signal.ok(Type.module({ mutable: Type.object({ bar: Type.string }) })),
        exportValue: Signal.ok({ mutable: Signal.ok({ bar: 'bar' }) }),
        rendered: Signal.ok(null),
        problems: Signal.ok(false),
        ast: Signal.err(new Error(`unimplemented`))
      },
      '/foo.table': {
        exportType: Signal.ok(Type.module({ default: Type.object({ baz: Type.number }) })),
        exportValue: Signal.ok({ default: Signal.ok({ baz: 7 }) }),
        rendered: Signal.ok(null),
        problems: Signal.ok(false),
        ast: Signal.err(new Error(`unimplemented`))
      }
    })),
  );
  expect(compiled.problems.get()).toBeFalsy();
  expectRenderEqual(
    compiled.rendered.get(),
    <>
      <p><span>foo </span>bar<span> </span>7</p>
    </>
  );
});
