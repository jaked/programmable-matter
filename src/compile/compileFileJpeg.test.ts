/**
 * @jest-environment jsdom
 */
'use strict'; // otherwise tsc inserts it above the @jest-environment comment and jest doesn't use it
import Signal from '../util/Signal';
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

  const buffer = compiled.exportValue.get().get('buffer');
  expect(buffer).toBe(jpeg);
});
