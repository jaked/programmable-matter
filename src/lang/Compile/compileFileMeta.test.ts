import Signal from '../../util/Signal';

import compileFileMeta from './compileFileMeta';

it('compiles', () => {
  const compiled = compileFileMeta({
    type: 'meta',
    path: 'foo.meta',
    mtimeMs: Signal.ok(0),
    content: Signal.ok(`{ }`),
  });
  compiled.reconcile();
  expect(compiled.get().problems).toBeFalsy();
});

it('succeeds with syntax error', () => {
  const compiled = compileFileMeta({
    type: 'meta',
    path: 'foo.meta',
    mtimeMs: Signal.ok(0),
    content: Signal.ok(`#Q(*&#$)`),
  });
  compiled.reconcile();
  expect(compiled.get().problems).toBeTruthy();
});

it('succeeds with type error', () => {
  console.log = jest.fn();
  const compiled = compileFileMeta({
    type: 'meta',
    path: 'foo.meta',
    mtimeMs: Signal.ok(0),
    content: Signal.ok(`{ foo: 7 }`),
  });
  compiled.reconcile();
  expect(compiled.get().problems).toBeTruthy();
});
