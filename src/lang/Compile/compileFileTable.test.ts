import Signal from '../../util/Signal';
import Type from '../Type';
import * as data from '../../data';

import compileFileTable from './compileFileTable';

it('succeeds with syntax error', () => {
  console.log = jest.fn();
  const compiled = compileFileTable(
    {
      type: 'table',
      path: 'foo.table',
      mtimeMs: Signal.ok(0),
      content: Signal.ok(`#Q(*&#$)`),
    },
  );
  expect(compiled.problems.get()).toBeTruthy();
});

it('succeeds with type error', () => {
  console.log = jest.fn();
  const compiled = compileFileTable(
    {
      type: 'table',
      path: 'foo.table',
      mtimeMs: Signal.ok(0),
      content: Signal.ok(`{ }`),
    },
  );
  expect(compiled.problems.get()).toBeTruthy();
  const annots = compiled.astAnnotations;
  expect(annots).toBeDefined();
  if (!annots) throw 'bug';
  expect(() => annots.get()).not.toThrow();
});

it('empty table', () => {
  const compiled = compileFileTable(
    {
      type: 'table',
      path: 'foo.table',
      mtimeMs: Signal.ok(0),
      content: Signal.ok(`{
        fields: [
          {
            name: 'foo',
            label: 'Foo',
            kind: 'data',
            type: 'string',
          }
        ]
      }`),
    },
  );
  expect(() => compiled.rendered.get()).not.toThrow();
});

it('non-data note in table dir', () => {
  const compiled = compileFileTable(
    {
      type: 'table',
      path: '/foo/index.table',
      mtimeMs: Signal.ok(0),
      content: Signal.ok(`{
        fields: [
          {
            name: 'foo',
            label: 'Foo',
            kind: 'data',
            type: 'string',
          }
        ]
      }`),
    },
    Signal.ok(new Map()),
    Signal.ok(new Map([[
      '/foo/bar', {
        name: '/foo/bar',
        type: 'meta',
        meta: Signal.ok({}),
        files: {},
        problems: Signal.ok(false),
        rendered: Signal.ok(null),
        publishedType: Signal.ok('html' as const),
        exportType: Signal.ok(Type.module({})),
        exportValue: Signal.ok(new Map()),
      }
    ]])),
  );
  expect(() => compiled.rendered.get()).not.toThrow();
});
