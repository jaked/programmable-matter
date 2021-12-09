import Signal from '../util/Signal';
import Type from '../type';

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
        ast: Signal.ok(null),
        interfaceMap: Signal.ok(new Map()),
        rendered: Signal.ok(null),
        problems: Signal.ok(false),
        exportInterface: Signal.ok(new Map()),
        exportValue: Signal.ok(new Map([[
          'default', {
            dataType: Type.object({ foo: Type.number })
          }
        ]])),
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
        ast: Signal.ok(null),
        interfaceMap: Signal.ok(new Map()),
        problems: Signal.ok(false),
        rendered: Signal.ok(null),
        exportInterface: Signal.ok(new Map()),
        exportValue: Signal.ok(new Map([[ 'default', new Error('bad meta') ]])),
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
        ast: Signal.ok(null),
        interfaceMap: Signal.ok(new Map()),
        problems: Signal.ok(false),
        rendered: Signal.ok(null),
        exportInterface: Signal.ok(new Map()),
        exportValue: Signal.ok(new Map([[
          'default', {
            dataType: Type.object({ foo: Type.string })
          }
        ]])),
      }
    ]])),
  );
  expect(compiled.problems.get()).toBeTruthy();
});
