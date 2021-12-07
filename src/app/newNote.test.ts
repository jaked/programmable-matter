import Signal from '../util/Signal';
import mkNewNote from './newNote';

const mk = (args: {
  fsUpdate?: (fn: string, buffer: Buffer) => Promise<void>,
  notes?: Map<string, unknown>,
  focusDir?: string | null,
  callback?: (name: string) => void,
} = {}) => {
  const newNote = mkNewNote({
    fsUpdate: args.fsUpdate ?? (() => Promise.resolve()),
    notes: Signal.ok(args.notes ?? new Map()),
    focusDir: Signal.ok(args.focusDir ?? null),
    callback: args.callback ?? (() => {}),
  })
  return (name: string) => newNote.get()(name);
}

it('updates fs, calls callback', done => {
  let fsUpdateCall = undefined as undefined | { fn: string, buffer: Buffer };
  const fsUpdate = (fn: string, buffer: Buffer) => {
    fsUpdateCall = { fn, buffer };
    return Promise.resolve();
  };

  const callback = (name: string) => {
    expect(name).toBe('/foo');
    done();
  }

  const newNote = mk({
    fsUpdate,
    callback,
  })

  expect(newNote('foo')).toBe('/foo');
  expect(fsUpdateCall && fsUpdateCall.fn).toBe('/foo.pm');
});

it('trims whitespace', () => {
  const newNote = mk();
  expect(newNote('  foo  ')).toBe('/foo');
});

it('empty name becomes `untitled`', () => {
  const newNote = mk();
  expect(newNote('')).toBe('/untitled');
});

it('normalizes name', () => {
  const newNote = mk();
  expect(newNote('//foo//')).toBe('/foo');
});

it('prefixes focus dir', () => {
  const newNote = mk({ focusDir: '/foo' });
  expect(newNote('bar')).toBe('/foo/bar');
});

it('renames collisions', () => {
  const newNote = mk({ notes: new Map([['/foo', {}]]) });
  expect(newNote('foo')).toBe('/foo (1)');
});

it('renames collisions of renames', () => {
  const newNote = mk({ notes: new Map([['/foo', {}], ['/foo (1)', {}]]) });
  expect(newNote('foo')).toBe('/foo (2)');
});
