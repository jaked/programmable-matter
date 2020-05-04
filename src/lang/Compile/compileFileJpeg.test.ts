import Signal from '../../util/Signal';
import Trace from '../../util/Trace';
import * as data from '../../data';

import compileFileJpeg from './compileFileJpeg';

const trace = new Trace();

const jpeg = `oh yeah`;

it('compiles', () => {
  const compiled = compileFileJpeg(
    trace,
    new data.File(
      'foo.jpeg',
      Signal.cellOk(Buffer.from(jpeg)),
    ),
  );
  compiled.reconcile(trace, 1);
  expect(compiled.get().problems).toBeFalsy();

  const buffer = compiled.get().exportValue.buffer;
  buffer.reconcile(trace, 1);
  expect(buffer).toBe(jpeg);
});
