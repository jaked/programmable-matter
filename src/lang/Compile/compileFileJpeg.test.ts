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
  compiled.reconcile();
  compiled.get().problems.reconcile();
  expect(compiled.get().problems.get()).toBeFalsy();

  compiled.get().exportValue.reconcile();
  const buffer = compiled.get().exportValue.get().buffer;
  buffer.reconcile();
  expect(buffer.get()).toBe(jpeg);
});
