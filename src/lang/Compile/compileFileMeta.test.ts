import Signal from '../../util/Signal';
import * as data from '../../data';

import compileFileMeta from './compileFileMeta';

it('compiles', () => {
  const compiled = compileFileMeta(
    new data.File(
      'foo.meta',
      Signal.cellOk(Buffer.from(`{ }`)),
    ),
  );
  compiled.reconcile(1);
  expect(compiled.get().problems).toBeFalsy();
});

it('succeeds with syntax error', () => {
  const compiled = compileFileMeta(
    new data.File(
      'foo.meta',
      Signal.cellOk(Buffer.from(`#Q(*&#$)`)),
    ),
  );
  compiled.reconcile(1);
  expect(compiled.get().problems).toBeTruthy();
});

it('succeeds with type error', () => {
  console.log = jest.fn();
  const compiled = compileFileMeta(
    new data.File(
      'foo.meta',
      Signal.cellOk(Buffer.from(`{ foo: 7 }`)),
    ),
  );
  compiled.reconcile(1);
  expect(compiled.get().problems).toBeTruthy();
});
