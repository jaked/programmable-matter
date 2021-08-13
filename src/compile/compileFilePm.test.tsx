import React from 'react';
import TestRenderer from 'react-test-renderer';

import { Interface } from '../model';
import Signal from '../util/Signal';
import { bug } from '../util/bug';
import Try from '../util/Try';
import Type from '../type';
import compileFilePm from './compileFilePm';

const intfType = (intf: Interface) =>
  intf.type === 'ok' ? intf.ok.type : Type.error(intf.err);

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
      children: [
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
      children: [
        {
          type: 'liveCode',
          children: [
            { text: 'export const foo = 7' }
          ]
        }
      ]
    }),
  });
  expect(compiled.problems.get()).toBeFalsy();
  expect(intfType(compiled.exportInterface.get().get('foo') ?? bug(`expected foo`))).toEqual(Type.singleton(7));
  expect(compiled.exportValue.get().get('foo')).toEqual(7);
});

it('reports errors', () => {
  const compiled = compileFilePm({
    type: 'pm',
    path: '/foo.pm',
    mtimeMs: Signal.ok(0),
    content: Signal.cellOk({
      meta: {},
      children: [
        {
          type: 'liveCode',
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
    children: [
      {
        type: 'inlineLiveCode',
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
    children: [
      {
        type: 'inlineLiveCode',
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
      children: [
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
      children: [
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
      children: [
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
      children: [
        { type: 'liveCode', children: [
          { text: 'const foo = 7' }
        ]},
        { type: 'p', children: [
          { text: 'foo is '},
          { type: 'inlineLiveCode', children: [
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
        children: [
          { type: 'liveCode', children: [
            { text: `import { bar } from '/baz'` }
          ]},
          { type: 'p', children: [
            { text: 'bar is '},
            { type: 'inlineLiveCode', children: [
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
        exportInterface: Signal.ok(new Map([[ 'bar', Try.ok({ type: Type.number, dynamic: false }) ]])),
        exportValue: Signal.ok(new Map([[ 'bar', 9 ]])),
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
        children: [
          { type: 'p', children: [
            { text: 'foo ' },
           { type: 'inlineLiveCode', children: [{ text: 'data.bar' }]},
            { text: ' ' },
           { type: 'inlineLiveCode', children: [{ text: 'table.baz' }]},
          ]},
        ]
      })
    },
    Signal.ok(new Map([
      ['/foo.json', {
        exportInterface: Signal.ok(new Map([[
          'mutable', Try.ok({ type: Type.object({ bar: Type.string }), dynamic: false })
        ]])),
        exportValue: Signal.ok(new Map([[ 'mutable', { bar: 'bar' } ]])),
        rendered: Signal.ok(null),
        problems: Signal.ok(false),
        ast: Signal.err(new Error(`unimplemented`))
      }],
      ['/foo.table', {
        exportInterface: Signal.ok(new Map([[
          'default', Try.ok({ type: Type.object({ baz: Type.number }), dynamic: false })
        ]])),
        exportValue: Signal.ok(new Map([[ 'default', { baz: 7 } ]])),
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
        children: [
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
        exportInterface: Signal.ok(new Map([[
          'default', Try.ok({ type: Type.layoutFunctionType, dynamic: false }),
        ]])),
        exportValue: Signal.ok(new Map([[
          'default', (props: { children: React.ReactNode, meta: {} }) =>
            React.createElement('div', {}, props.children)
        ]])),
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

it('identifier uses itself in initializer with dynamic value', () => {
  const compiled = compileFilePm(
    {
      type: 'pm',
      path: '/foo.pm',
      mtimeMs: Signal.ok(0),
      content: Signal.cellOk({
        meta: {},
        children: [
          { type: 'liveCode', children: [
            // use of foo is an error,
            // skip over it but don't blow up
            { text: `import { bar } from '/bar'; const foo = bar + foo` }
          ]},
          { type: 'p', children: [
            { text: 'foo is '},
            { type: 'inlineLiveCode', children: [
              { text: 'foo' }
            ]},
          ]}
        ]
      }),
    },
    Signal.ok(new Map()),
    Signal.ok(new Map([[
      '/bar', {
        name: '/bar',
        type: 'pm',
        meta: Signal.ok({}),
        files: {},
        problems: Signal.ok(false),
        rendered: Signal.ok(null),
        exportInterface: Signal.ok(new Map([[
          'bar', Try.ok({ type: Type.number, dynamic: true }),
        ]])),
        exportValue: Signal.ok(new Map([[
          'bar', Signal.ok(7)
        ]])),
      }
    ]])),
  );
  expect(compiled.problems.get()).toBeTruthy();
  expectRenderEqual(
    compiled.rendered.get(),
    // TODO(jaked) strip out the React root elements somehow
    <>
      <p><span>foo is </span><span id="__root0">7</span></p>
    </>
  );
});
