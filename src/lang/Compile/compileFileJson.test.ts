import * as Immutable from 'immutable';
import Signal from '../../util/Signal';
import Trace from '../../util/Trace';
import * as data from '../../data';

import compileFileJson from './compileFileJson';

const trace = new Trace();
const updateFile = (s: string, b: Buffer) => {}

it('succeeds with syntax error', () => {
  const compiled = compileFileJson(
    trace,
    new data.File(
      'foo.json',
      Signal.cellOk(Buffer.from(`#Q(*&#$)`)),
    ),
    Signal.ok(Immutable.Map()),
    updateFile
  );
  compiled.reconcile(trace, 1);
  expect(compiled.get().problems).toBeTruthy();
});
