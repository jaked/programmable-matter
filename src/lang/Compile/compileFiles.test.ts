import Signal from '../../util/Signal';
import { bug } from '../../util/bug';
import { compileFiles } from './index';
import { WritableContents } from '../../model';

it('compiles json', () => {
  const files = Signal.ok<WritableContents>(new Map([[
    'foo.json', {
      type: 'json',
      path: 'foo.json',
      mtimeMs: Signal.ok(0),
      content: Signal.cellOk('{ }'),
    }
  ]]));
  const { compiledNotes } = compileFiles(files);
  const foo = compiledNotes.get().get('foo');
  if (!foo) bug('expected foo');
  expect(foo.problems.get()).toBeFalsy();
});

it('compiles meta', () => {
  const files = Signal.ok<WritableContents>(new Map([[
    'foo.meta', {
      type: 'meta',
      path: 'foo.meta',
      mtimeMs: Signal.ok(0),
      content: Signal.cellOk('{ }'),
    }
  ]]));
  const { compiledNotes } = compileFiles(files);
  const foo = compiledNotes.get().get('foo');
  if (!foo) bug('expected foo');
  expect(foo.problems.get()).toBeFalsy();
});

it('compiles table', () => {
  const files = Signal.ok<WritableContents>(new Map([
    ['cats/index.meta', {
      type: 'meta',
      path: 'cats/index.meta',
      mtimeMs: Signal.ok(0),
      content: Signal.cellOk(`
        {
          dirMeta: {
            dataType: '{ name: string, breed: string }'
          }
        }
      `),
    }],
    ['cats/index.table', {
      type: 'table',
      path: 'cats/index.table',
      mtimeMs: Signal.ok(0),
      content: Signal.cellOk(`
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
    }],
    ['cats/smokey.json', {
      type: 'json',
      path: 'cats/smokey.json',
      mtimeMs: Signal.ok(0),
      content: Signal.cellOk(`
        {
          name: 'Smokey',
          breed: 'Ocicat',
        }
      `),
    }],
    ['cats/danny.json', {
      type: 'json',
      path: 'cats/danny.json',
      mtimeMs: Signal.ok(0),
      content: Signal.cellOk(`
        {
          name: 'Danny',
          breed: 'American shorthair',
        }
      `),
    }],
  ]));
  const { compiledNotes } = compileFiles(files);
  const cats = compiledNotes.get().get('cats/index');
  if (!cats) bug('expected cats');
  expect(cats.problems.get()).toBeFalsy();
});

// TODO(jaked)
// test updateFile / setSelected
