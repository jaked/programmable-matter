import Signal from '../../util/Signal';
import Trace from '../../util/Trace';
import * as data from '../../data';

import compileFileMeta from './compileFileMeta';

const trace = new Trace();

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
