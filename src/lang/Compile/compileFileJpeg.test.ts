/**
 * @jest-environment jsdom
 */

import Signal from '../../util/Signal';
import compileFileJpeg from './compileFileJpeg';

const jpeg = Buffer.from(`oh yeah`);

it('compiles', () => {
  // see https://github.com/jsdom/jsdom/issues/1721
  window.URL.createObjectURL = () => '';

  const compiled = compileFileJpeg({
    type: 'jpeg',
    path: 'foo.jpeg',
    mtimeMs: Signal.ok(0),
    content: Signal.ok(jpeg),
  });
  expect(compiled.problems.get()).toBeFalsy();

  const buffer = compiled.exportValue.get().buffer;
  expect(buffer.get()).toBe(jpeg);
});
