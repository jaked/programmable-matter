import Signal from '../../util/Signal';
import Type from '../Type';

import compileFileJson from './compileFileJson';

it('compiles', () => {
  const compiled = compileFileJson(
    {
      type: 'json',
      path: 'foo.json',
      mtimeMs: Signal.ok(0),
      content: Signal.ok(`{ foo: 7 }`),
    },
  );
  expect(compiled.problems.get()).toBeFalsy();
});

it('succeeds with syntax error', () => {
  const compiled = compileFileJson(
    {
      type: 'json',
      path: 'foo.json',
      mtimeMs: Signal.ok(0),
      content: Signal.ok(`#Q(*&#$)`),
    },
  );
  expect(compiled.problems.get()).toBeTruthy();
});

it('compiles with meta', () => {
  const compiled = compileFileJson(
    {
      type: 'json',
      path: 'foo.json',
      mtimeMs: Signal.ok(0),
      content: Signal.ok(`{ foo: 7 }`),
    },
    Signal.ok(new Map([[
      'foo.meta', {
        exportType: Signal.ok(Type.module({ })),
        exportValue: Signal.ok({
          default: Signal.ok({
            dataType: Type.object({ foo: Type.number })
          })
        }),
        rendered: Signal.ok(null),
        problems: Signal.ok(false),
        ast: Signal.ok(null),
      }
    ]])),
  );
  expect(compiled.problems.get()).toBeFalsy();
});

it('succeeds with meta error', () => {
  const compiled = compileFileJson(
    {
      type: 'json',
      path: 'foo.json',
      mtimeMs: Signal.ok(0),
      content: Signal.ok(`{ foo: 7 }`),
    },
    Signal.ok(new Map([[
      'foo.meta', {
        exportType: Signal.ok(Type.module({ })),
        exportValue: Signal.ok({ default: Signal.err(new Error('bad meta')) }),
        rendered: Signal.ok(null),
        problems: Signal.ok(false),
        ast: Signal.ok(null),
      }
    ]])),
  );
  expect(compiled.problems.get()).toBeFalsy();
});

it('succeeds with type error', () => {
  console.log = jest.fn();
  const compiled = compileFileJson(
    {
      type: 'json',
      path: 'foo.json',
      mtimeMs: Signal.ok(0),
      content: Signal.ok(`{ foo: 7 }`),
    },
    Signal.ok(new Map([[
      'foo.meta', {
        exportType: Signal.ok(Type.module({ })),
        exportValue: Signal.ok({
          default: Signal.ok({
            dataType: Type.object({ foo: Type.string })
          })
        }),
        rendered: Signal.ok(null),
        problems: Signal.ok(false),
        ast: Signal.ok(null),
      }
    ]])),
  );
  expect(compiled.problems.get()).toBeTruthy();
});
