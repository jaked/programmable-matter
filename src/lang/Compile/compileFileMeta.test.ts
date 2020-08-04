import File from '../../files/File';

import compileFileMeta from './compileFileMeta';

it('compiles', () => {
  const compiled = compileFileMeta(
    new File(
      'foo.meta',
      Buffer.from(`{ }`),
    ),
  );
  compiled.reconcile(1);
  expect(compiled.get().problems).toBeFalsy();
});

it('succeeds with syntax error', () => {
  const compiled = compileFileMeta(
    new File(
      'foo.meta',
      Buffer.from(`#Q(*&#$)`),
    ),
  );
  compiled.reconcile(1);
  expect(compiled.get().problems).toBeTruthy();
});

it('succeeds with type error', () => {
  console.log = jest.fn();
  const compiled = compileFileMeta(
    new File(
      'foo.meta',
      Buffer.from(`{ foo: 7 }`),
    ),
  );
  compiled.reconcile(1);
  expect(compiled.get().problems).toBeTruthy();
});
