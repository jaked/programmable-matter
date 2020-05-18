import * as Immutable from 'immutable';
import Signal from '../../util/Signal';
import Trace from '../../util/Trace';
import Try from '../../util/Try';
import Type from '../Type';
import * as data from '../../data';

import compileFileJson from './compileFileJson';

const trace = new Trace();
const updateFile = (s: string, b: Buffer) => {}

it('compiles', () => {
  const compiled = compileFileJson(
    trace,
    new data.File(
      'foo.json',
      Signal.cellOk(Buffer.from(`{ foo: 7 }`)),
    ),
    Signal.ok(Immutable.Map()),
    updateFile
  );
  compiled.reconcile(trace, 1);
  expect(compiled.get().problems).toBeFalsy();
});

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

it('compiles with meta', () => {
  const compiled = compileFileJson(
    trace,
    new data.File(
      'foo.json',
      Signal.cellOk(Buffer.from(`{ foo: 7 }`)),
    ),
    Signal.ok(Immutable.Map({
      'foo.meta': Signal.ok({
        exportType: Type.module({ }),
        exportValue: {
          default: Signal.ok({
            dataType: Type.object({ foo: Type.number })
          })
        },
        rendered: Signal.ok(null),
        problems: false,
        ast: Try.ok(null),
      })
    })),
    updateFile
  );
  compiled.reconcile(trace, 1);
  expect(compiled.get().problems).toBeFalsy();
});

it('succeeds with meta error', () => {
  const compiled = compileFileJson(
    trace,
    new data.File(
      'foo.json',
      Signal.cellOk(Buffer.from(`{ foo: 7 }`)),
    ),
    Signal.ok(Immutable.Map({
      'foo.meta': Signal.ok({
        exportType: Type.module({ }),
        exportValue: { default: Signal.err(new Error('bad meta')) },
        rendered: Signal.ok(null),
        problems: false,
        ast: Try.ok(null),
      })
    })),
    updateFile
  );
  compiled.reconcile(trace, 1);
  expect(compiled.get().problems).toBeFalsy();
});

it('succeeds with type error', () => {
  console.log = jest.fn();
  const compiled = compileFileJson(
    trace,
    new data.File(
      'foo.json',
      Signal.cellOk(Buffer.from(`{ foo: 7 }`)),
    ),
    Signal.ok(Immutable.Map({
      'foo.meta': Signal.ok({
        exportType: Type.module({ }),
        exportValue: {
          default: Signal.ok({
            dataType: Type.object({ foo: Type.string })
          })
        },
        rendered: Signal.ok(null),
        problems: false,
        ast: Try.ok(null),
      })
    })),
    updateFile
  );
  compiled.reconcile(trace, 1);
  expect(compiled.get().problems).toBeTruthy();
});
