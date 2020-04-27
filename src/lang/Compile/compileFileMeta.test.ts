import Signal from '../../util/Signal';
import Trace from '../../util/Trace';
import * as data from '../../data';

import compileFileMeta from './compileFileMeta';

const trace = new Trace();

it('compiles', () => {
  const compiled = compileFileMeta(
    trace,
    new data.File(
      'foo.meta',
      Signal.cellOk(Buffer.from(`{ }`)),
    ),
  );
  compiled.reconcile(trace, 1);
  expect(compiled.get().problems).toBeFalsy();
});

it('succeeds with syntax error', () => {
  const compiled = compileFileMeta(
    trace,
    new data.File(
      'foo.meta',
      Signal.cellOk(Buffer.from(`#Q(*&#$)`)),
    ),
  );
  compiled.reconcile(trace, 1);
  expect(compiled.get().problems).toBeTruthy();
});

it('succeeds with type error', () => {
  const compiled = compileFileMeta(
    trace,
    new data.File(
      'foo.meta',
      Signal.cellOk(Buffer.from(`{ foo: 7 }`)),
    ),
  );
  compiled.reconcile(trace, 1);
  expect(compiled.get().problems).toBeTruthy();
});
