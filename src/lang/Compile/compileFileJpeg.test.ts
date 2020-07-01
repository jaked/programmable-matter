/**
 * @jest-environment jsdom
 */

import Signal from '../../util/Signal';
import * as data from '../../data';

import compileFileJpeg from './compileFileJpeg';

const jpeg = Buffer.from(`oh yeah`);

it('compiles', () => {
  // see https://github.com/jsdom/jsdom/issues/1721
  window.URL.createObjectURL = () => '';

  const compiled = compileFileJpeg(
    new data.File(
      'foo.jpeg',
      Signal.cellOk(jpeg),
    ),
  );
  compiled.reconcile(1);
  expect(compiled.get().problems).toBeFalsy();

  const buffer = compiled.get().exportValue.buffer;
  buffer.reconcile(1);
  expect(buffer.get()).toBe(jpeg);
});
