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
  compiled.get().problems.reconcile();
  expect(compiled.get().problems.get()).toBeFalsy();
});

it('succeeds with syntax error', () => {
  const compiled = compileFileMeta({
    type: 'meta',
    path: 'foo.meta',
    mtimeMs: Signal.ok(0),
    content: Signal.ok(`#Q(*&#$)`),
  });
  compiled.reconcile();
  compiled.get().problems.reconcile();
  expect(compiled.get().problems.get()).toBeTruthy();
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
  compiled.get().problems.reconcile();
  expect(compiled.get().problems.get()).toBeTruthy();
});
