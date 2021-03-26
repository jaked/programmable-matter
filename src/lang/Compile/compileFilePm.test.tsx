import React from 'react';
import TestRenderer from 'react-test-renderer';

import Signal from '../../util/Signal';
import Type from '../Type';
import compileFilePm from './compileFilePm';

// TODO(jaked)
// we should test styles / handlers; find a better way to deal with this
const stripProps = ['className', 'onClick', 'style'];
function stripRendered(node: any) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach(stripRendered);
  }
  if ('props' in node) {
    const props = node.props;
    stripProps.forEach(prop => {
      if (prop in props) {
        delete props[prop];
      }
    });
  }
  if ('children' in node) {
    node.children.forEach(stripRendered);
  }
}

function expectRenderEqual(
  a: React.ReactNode, // TODO(jaked) fix in `rendered` API
  b: React.ReactElement,
) {
  const aRendered = TestRenderer.create(a as React.ReactElement).toJSON();
  stripRendered(aRendered);
  const bRendered = TestRenderer.create(b).toJSON();
  expect(aRendered).toEqual(bRendered);
}

it('compiles', () => {
  const compiled = compileFilePm({
    type: 'pm',
    path: '/foo.pm',
    mtimeMs: Signal.ok(0),
    content: Signal.cellOk({
      meta: {},
      nodes: [
        {
          type: 'p',
          children: [
            { text: 'foo' }
          ]
        }
      ]
    }),
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
    content: Signal.cellOk({
      meta: {},
      nodes: [
        {
          type: 'code',
          children: [
            { text: 'export const foo = 7' }
          ]
        }
      ]
    }),
  });
  expect(compiled.problems.get()).toBeFalsy();
  expect(compiled.exportType.get().getFieldType('foo')).toEqual(Type.singleton(7));
  expect(compiled.exportValue.get().get('foo')).toEqual(7);
});

it('reports errors', () => {
  const compiled = compileFilePm({
    type: 'pm',
    path: '/foo.pm',
    mtimeMs: Signal.ok(0),
    content: Signal.cellOk({
      meta: {},
      nodes: [
        {
          type: 'code',
          children: [
            { text: 'x' }
          ]
        }
      ]
    }),
  });
  expect(compiled.problems.get()).toBeTruthy();
});

it('recovers from fixed errors in inline code', () => {
  const content = Signal.cellOk({
    meta: {},
    nodes: [
      {
        type: 'inlineCode',
        children: [
          { text: 'x' }
        ]
      }
    ]
  });
  const compiled = compileFilePm({
    type: 'pm',
    path: '/foo.pm',
    mtimeMs: Signal.ok(0),
    content
  });
  expect(compiled.problems.get()).toBeTruthy();
  content.setOk({
    meta: {},
    nodes: [
      {
        type: 'inlineCode',
        children: [
          { text: '7' }
        ]
      }
    ]
  })
  expect(compiled.problems.get()).toBeFalsy();
});

it('renders marks', () => {
  console.error = jest.fn(); // suppress React warning about keys
  const compiled = compileFilePm({
    type: 'pm',
    path: '/foo.pm',
    mtimeMs: Signal.ok(0),
    content: Signal.cellOk({
      meta: {},
      nodes: [
        {
          type: 'p',
          children: [
            { text: 'foo' },
            { text: 'bar', bold: true },
            { text: 'baz', underline: true },
            { text: 'quux', bold: true, italic: true },
          ]
        }
      ]
    }),
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
    content: Signal.cellOk({
      meta: {},
      nodes: [
        { type: 'p', children: [{ text: 'foo' }] },
        { type: 'h1', children: [{ text: 'bar' }] },
        { type: 'ul', children: [
          { type: 'li', children: [{ text: 'baz', bold: true }] }
        ] },
      ]
    }),
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
    content: Signal.cellOk({
      meta: {},
      nodes: [
        { type: 'p', children: [
          { type: 'a', href: 'https://foo.bar', children: [
            { text: 'foo' }
          ] },
        ]},
      ]
    }),
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
    content: Signal.cellOk({
      meta: {},
      nodes: [
        { type: 'code', children: [
          { text: 'const foo = 7' }
        ]},
        { type: 'p', children: [
          { text: 'foo is '},
          { type: 'inlineCode', children: [
            { text: 'foo' }
          ]},
        ]}
      ]
    }),
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
      content: Signal.cellOk({
        meta: {},
        nodes: [
          { type: 'code', children: [
            { text: `import { bar } from '/baz'` }
          ]},
          { type: 'p', children: [
            { text: 'bar is '},
            { type: 'inlineCode', children: [
              { text: 'bar' }
            ]},
          ]}
        ]
      })
    },
    Signal.ok(new Map()),
    Signal.ok(new Map([[
      '/baz', {
        name: '/baz',
        type: 'pm',
        meta: Signal.err(new Error('meta')),
        files: {},
        problems: Signal.err(new Error('problems')),
        rendered: Signal.err(new Error('rendered')),
        exportType: Signal.ok(Type.module({ bar: Type.number })),
        exportValue: Signal.ok(new Map([[ 'bar', 9 ]])),
        exportDynamic: Signal.ok(new Map([[ 'bar', false ]])),
      },
    ]])),
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
      content: Signal.cellOk({
        meta: {},
        nodes: [
          { type: 'p', children: [
            { text: 'foo ' },
           { type: 'inlineCode', children: [{ text: 'data.bar' }]},
            { text: ' ' },
           { type: 'inlineCode', children: [{ text: 'table.baz' }]},
          ]},
        ]
      })
    },
    Signal.ok(new Map([
      ['/foo.json', {
        exportType: Signal.ok(Type.module({ mutable: Type.object({ bar: Type.string }) })),
        exportValue: Signal.ok(new Map([[ 'mutable', { bar: 'bar' } ]])),
        exportDynamic: Signal.ok(new Map([[ 'mutable', false ]])),
        rendered: Signal.ok(null),
        problems: Signal.ok(false),
        ast: Signal.err(new Error(`unimplemented`))
      }],
      ['/foo.table', {
        exportType: Signal.ok(Type.module({ default: Type.object({ baz: Type.number }) })),
        exportValue: Signal.ok(new Map([[ 'default', { baz: 7 } ]])),
        exportDynamic: Signal.ok(new Map([[ 'default', false ]])),
        rendered: Signal.ok(null),
        problems: Signal.ok(false),
        ast: Signal.err(new Error(`unimplemented`))
      }]
    ])),
  );
  expect(compiled.problems.get()).toBeFalsy();
  expectRenderEqual(
    compiled.rendered.get(),
    <>
      <p><span>foo </span>bar<span> </span>7</p>
    </>
  );
});

it('compiles with layout', () => {
  const compiled = compileFilePm(
    {
      type: 'pm',
      path: '/foo.pm',
      mtimeMs: Signal.ok(0),
      content: Signal.cellOk({
        meta: { layout: '/layout' },
        nodes: [
          { type: 'p', children: [ { text: 'foo' } ]}
        ]
      })
    },
    Signal.ok(new Map()),
    Signal.ok(new Map([[
      '/layout', {
        name: '/layout',
        type: 'pm',
        meta: Signal.ok({}),
        files: {},
        problems: Signal.ok(false),
        rendered: Signal.ok(null),
        exportType: Signal.ok(Type.module({
          default: Type.layoutFunctionType,
        })),
        exportValue: Signal.ok(new Map([[
          'default', (props: { children: React.ReactNode, meta: {} }) =>
            React.createElement('div', {}, props.children)
        ]])),
        exportDynamic: Signal.ok(new Map([[ 'default', false ]])),
      }
    ]])),
  );
  expect(compiled.problems.get()).toBeFalsy();
  expectRenderEqual(
    compiled.rendered.get(),
    <>
      <div>
        <p><span>foo</span></p>
      </div>
    </>
  );
});
