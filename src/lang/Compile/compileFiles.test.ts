import * as Immutable from 'immutable';
import Signal from '../../util/Signal';
import Trace from '../../util/Trace';
import { bug } from '../../util/bug';
import * as data from '../../data';
import { compileFiles } from './index';

it('compiles mdx', () => {
  const trace = new Trace();
  const files = Signal.ok(Immutable.Map({
    'foo.mdx': new data.File(
      'foo.mdx',
      Signal.cellOk(Buffer.from("foo"))
    )
  }));
  const compiled = compileFiles(trace, files);
  compiled.reconcile(trace, 1);
  const foo = compiled.get().get('foo');
  if (!foo) bug('expected foo');
  foo.problems.reconcile(trace, 1);
  expect(foo.problems.get()).toBeFalsy();
});

it('compiles json', () => {
  const trace = new Trace();
  const files = Signal.ok(Immutable.Map({
    'foo.json': new data.File(
      'foo.json',
      Signal.cellOk(Buffer.from("{ }"))
    )
  }));
  const compiled = compileFiles(trace, files);
  compiled.reconcile(trace, 1);
  const foo = compiled.get().get('foo');
  if (!foo) bug('expected foo');
  foo.problems.reconcile(trace, 1);
  expect(foo.problems.get()).toBeFalsy();
});

it('compiles meta', () => {
  const trace = new Trace();
  const files = Signal.ok(Immutable.Map({
    'foo.meta': new data.File(
      'foo.meta',
      Signal.cellOk(Buffer.from("{ }"))
    )
  }));
  const compiled = compileFiles(trace, files);
  compiled.reconcile(trace, 1);
  const foo = compiled.get().get('foo');
  if (!foo) bug('expected foo');
  foo.problems.reconcile(trace, 1);
  expect(foo.problems.get()).toBeFalsy();
});

it('compiles json with meta', () => {
  const trace = new Trace();
  const files = Signal.ok(Immutable.Map({
    'foo.meta': new data.File(
      'foo.meta',
      Signal.cellOk(Buffer.from('{ dataType: "{ foo: number }" }'))
    ),
    'foo.json': new data.File(
      'foo.json',
      Signal.cellOk(Buffer.from('{ foo: 7 }'))
    ),
  }));
  const compiled = compileFiles(trace, files);
  compiled.reconcile(trace, 1);
  const foo = compiled.get().get('foo');
  if (!foo) bug('expected foo');
  foo.problems.reconcile(trace, 1);
  expect(foo.problems.get()).toBeFalsy();
});
