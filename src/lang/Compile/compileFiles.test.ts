import * as Immutable from 'immutable';
import Signal from '../../util/Signal';
import Type from '../Type';
import { bug } from '../../util/bug';
import File from '../../files/File';
import { compileFiles } from './index';

const updateFile = (s: string, b: Buffer) => {}
const deleteFile = (s: string) => {}
const setSelected = (s: string) => {}

it('compiles mdx', () => {
  const files = Signal.ok(Immutable.Map({
    'foo.mdx': new File(
      'foo.mdx',
      Buffer.from("foo")
    )
  }));
  const { compiledNotes } = compileFiles(files, updateFile, deleteFile, setSelected);
  compiledNotes.reconcile();
  const foo = compiledNotes.get().get('foo');
  if (!foo) bug('expected foo');
  foo.problems.reconcile();
  expect(foo.problems.get()).toBeFalsy();
});

it('compiles json', () => {
  const files = Signal.ok(Immutable.Map({
    'foo.json': new File(
      'foo.json',
      Buffer.from("{ }")
    )
  }));
  const { compiledNotes } = compileFiles(files,  updateFile, deleteFile, setSelected);
  compiledNotes.reconcile();
  const foo = compiledNotes.get().get('foo');
  if (!foo) bug('expected foo');
  foo.problems.reconcile();
  expect(foo.problems.get()).toBeFalsy();
});

it('compiles meta', () => {
  const files = Signal.ok(Immutable.Map({
    'foo.meta': new File(
      'foo.meta',
      Buffer.from("{ }")
    )
  }));
  const { compiledNotes } = compileFiles(files, updateFile, deleteFile, setSelected);
  compiledNotes.reconcile();
  const foo = compiledNotes.get().get('foo');
  if (!foo) bug('expected foo');
  foo.problems.reconcile();
  expect(foo.problems.get()).toBeFalsy();
});

it('compiles table', () => {
  const files = Signal.ok(Immutable.Map({
    'cats/index.meta': new File(
      'cats/index.meta',
      Buffer.from(`
        {
          dirMeta: {
            dataType: '{ name: string, breed: string }'
          }
        }
      `)
    ),
    'cats/index.table': new File(
      'cats/index.table',
      Buffer.from(`
        {
          fields: [
            {
              kind: 'data',
              name: 'name',
              label: 'Name',
              type: 'string'
            },
            {
              kind: 'data',
              name: 'breed',
              label: 'Breed',
              type: 'string'
            },
          ]
        }
      `)
    ),
    'cats/smokey.json': new File(
      'cats/smokey.json',
      Buffer.from(`
        {
          name: 'Smokey',
          breed: 'Ocicat',
        }
      `),
    ),
    'cats/danny.json': new File(
      'cats/danny.json',
      Buffer.from(`
        {
          name: 'Danny',
          breed: 'American shorthair',
        }
      `),
    ),
  }));
  const { compiledNotes } = compileFiles(files, updateFile, deleteFile, setSelected);
  compiledNotes.reconcile();
  const cats = compiledNotes.get().get('cats/index');
  if (!cats) bug('expected cats');
  cats.problems.reconcile();
  expect(cats.problems.get()).toBeFalsy();
});

it('compiles mdx + json + meta', () => {
  const files = Signal.ok(Immutable.Map({
    'foo.mdx': new File(
      'foo.mdx',
      Buffer.from("foo <>data.bar</>")
    ),
    'foo.meta': new File(
      'foo.meta',
      Buffer.from(`{ dataType: '{ bar: number }' }`)
    ),
    'foo.json': new File(
      'foo.json',
      Buffer.from(`{ bar: 7 }`)
    )
  }));
  const { compiledNotes } = compileFiles(files, updateFile, deleteFile, setSelected);
  compiledNotes.reconcile();
  const foo = compiledNotes.get().get('foo');
  if (!foo) bug('expected foo');
  foo.problems.reconcile();
  expect(foo.problems.get()).toBeFalsy();
  foo.meta.reconcile();
  expect(foo.meta.get().dataType).toBeTruthy();
  expect(foo.meta.get().title).toBe('foo');
  foo.exportType.reconcile();
  expect(foo.exportType.get().getFieldType('default'))
    .toEqual(Type.object({ bar: Type.number }));
});

// TODO(jaked)
// test updateFile / setSelected
