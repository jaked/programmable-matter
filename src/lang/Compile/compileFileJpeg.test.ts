/**
 * @jest-environment jsdom
 */

import Signal from '../../util/Signal';
import Trace from '../../util/Trace';
import * as data from '../../data';

import compileFileJpeg from './compileFileJpeg';

const trace = new Trace();

const jpeg = Buffer.from(`oh yeah`);

it('compiles', () => {
  // see https://github.com/jsdom/jsdom/issues/1721
  window.URL.createObjectURL = () => '';

  const compiled = compileFileJpeg(
    trace,
    new data.File(
      'foo.jpeg',
      Signal.cellOk(jpeg),
    ),
  );
  compiled.reconcile(trace, 1);
  expect(compiled.get().problems).toBeFalsy();

  const buffer = compiled.get().exportValue.buffer;
  buffer.reconcile(trace, 1);
  expect(buffer.get()).toBe(jpeg);
});
