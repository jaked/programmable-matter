import * as Immutable from 'immutable';
import Signal from '../../util/Signal';
import Type from '../Type';
import * as data from '../../data';

import compileFileTable from './compileFileTable';

const setSelected = (s: string) => {}
const updateFile = (s: string, b: Buffer) => {}
const deleteFile = (s: string) => {}

it('succeeds with syntax error', () => {
  console.log = jest.fn();
  const compiled = compileFileTable(
    {
      type: 'table',
      path: 'foo.table',
      mtimeMs: Signal.ok(0),
      content: Signal.ok(`#Q(*&#$)`),
    },
    Signal.ok(Immutable.Map()),
    Signal.ok(Immutable.Map()),
    setSelected,
    updateFile,
    deleteFile,
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
    Signal.ok(Immutable.Map()),
    Signal.ok(Immutable.Map()),
    setSelected,
    updateFile,
    deleteFile,
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
    Signal.ok(Immutable.Map()),
    Signal.ok(Immutable.Map()),
    setSelected,
    updateFile,
    deleteFile,
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
    Signal.ok(Immutable.Map()),
    Signal.ok(Immutable.Map({
      '/foo/bar': {
        name: '/foo/bar',
        meta: Signal.ok(data.Meta()),
        files: {},
        problems: Signal.ok(false),
        rendered: Signal.ok(null),
        publishedType: Signal.ok('html' as const),
        exportType: Signal.ok(Type.module({})),
        exportValue: Signal.ok({}),
      }
    })),
    setSelected,
    updateFile,
    deleteFile,
  );
  expect(() => compiled.rendered.get()).not.toThrow();
});
