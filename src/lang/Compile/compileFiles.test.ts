import * as Immutable from 'immutable';
import Signal from '../../util/Signal';
import Trace from '../../util/Trace';
import Type from '../Type';
import { bug } from '../../util/bug';
import * as data from '../../data';
import { compileFiles } from './index';

const trace = new Trace();
const updateFile = (s: string, b: Buffer) => {}
const setSelected = (s: string) => {}

it('compiles mdx', () => {
  const files = Signal.ok(Immutable.Map({
    'foo.mdx': new data.File(
      'foo.mdx',
      Signal.cellOk(Buffer.from("foo"))
    )
  }));
  const { compiledNotes } = compileFiles(trace, files, updateFile, setSelected);
  compiledNotes.reconcile(trace, 1);
  const foo = compiledNotes.get().get('foo');
  if (!foo) bug('expected foo');
  foo.problems.reconcile(trace, 1);
  expect(foo.problems.get()).toBeFalsy();
});

it('compiles json', () => {
  const files = Signal.ok(Immutable.Map({
    'foo.json': new data.File(
      'foo.json',
      Signal.cellOk(Buffer.from("{ }"))
    )
  }));
  const { compiledNotes } = compileFiles(trace, files,  updateFile, setSelected);
  compiledNotes.reconcile(trace, 1);
  const foo = compiledNotes.get().get('foo');
  if (!foo) bug('expected foo');
  foo.problems.reconcile(trace, 1);
  expect(foo.problems.get()).toBeFalsy();
});

it('compiles meta', () => {
  const files = Signal.ok(Immutable.Map({
    'foo.meta': new data.File(
      'foo.meta',
      Signal.cellOk(Buffer.from("{ }"))
    )
  }));
  const { compiledNotes } = compileFiles(trace, files, updateFile, setSelected);
  compiledNotes.reconcile(trace, 1);
  const foo = compiledNotes.get().get('foo');
  if (!foo) bug('expected foo');
  foo.problems.reconcile(trace, 1);
  expect(foo.problems.get()).toBeFalsy();
});

it('compiles table', () => {
  const files = Signal.ok(Immutable.Map({
    'cats/index.meta': new data.File(
      'cats/index.meta',
      Signal.cellOk(Buffer.from(`
        {
          dirMeta: {
            dataType: '{ name: string, breed: string }'
          }
        }
      `))
    ),
    'cats/index.table': new data.File(
      'cats/index.table',
      Signal.cellOk(Buffer.from(`
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
      `))
    ),
    'cats/smokey.json': new data.File(
      'cats/smokey.json',
      Signal.cellOk(Buffer.from(`
        {
          name: 'Smokey',
          breed: 'Ocicat',
        }
      `)),
    ),
    'cats/danny.json': new data.File(
      'cats/danny.json',
      Signal.cellOk(Buffer.from(`
        {
          name: 'Danny',
          breed: 'American shorthair',
        }
      `)),
    ),
  }));
  const { compiledNotes } = compileFiles(trace, files, updateFile, setSelected);
  compiledNotes.reconcile(trace, 1);
  const cats = compiledNotes.get().get('cats');
  if (!cats) bug('expected cats');
  cats.problems.reconcile(trace, 1);
  expect(cats.problems.get()).toBeFalsy();
});

it('compiles mdx + json + meta', () => {
  const files = Signal.ok(Immutable.Map({
    'foo.mdx': new data.File(
      'foo.mdx',
      Signal.cellOk(Buffer.from("foo <>data.bar</>"))
    ),
    'foo.meta': new data.File(
      'foo.meta',
      Signal.cellOk(Buffer.from(`{ dataType: '{ bar: number }' }`))
    ),
    'foo.json': new data.File(
      'foo.json',
      Signal.cellOk(Buffer.from(`{ bar: 7 }`))
    )
  }));
  const { compiledNotes } = compileFiles(trace, files, updateFile, setSelected);
  compiledNotes.reconcile(trace, 1);
  const foo = compiledNotes.get().get('foo');
  if (!foo) bug('expected foo');
  foo.problems.reconcile(trace, 1);
  expect(foo.problems.get()).toBeFalsy();
  foo.meta.reconcile(trace, 1);
  expect(foo.meta.get().dataType).toBeTruthy();
  expect(foo.meta.get().title).toBe('foo');
  foo.exportType.reconcile(trace, 1);
  expect(foo.exportType.get().getFieldType('default'))
    .toEqual(Type.object({ bar: Type.number }));
});

// TODO(jaked)
// test updateFile / setSelected
