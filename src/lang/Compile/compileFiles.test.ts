import * as Immutable from 'immutable';
import React from 'react';
import Signal from '../../util/Signal';
import Trace from '../../util/Trace';
import { bug } from '../../util/bug';
import * as data from '../../data';
import { compileFiles } from './index';

const trace = new Trace();
const updateFile = (s: string, b: Buffer) => {}
const setSelected = (s: string) => {}

it('compiles mdx', () => {
  const files = Signal.ok(Immutable.Map({
    'foo.mdx': new data.File(
      'foo.mdx',
      Signal.cellOk(Buffer.from("foo"))
    )
  }));
  const { compiledNotes } = compileFiles(trace, files, updateFile, setSelected);
  compiledNotes.reconcile(trace, 1);
  const foo = compiledNotes.get().get('foo');
  if (!foo) bug('expected foo');
  foo.problems.reconcile(trace, 1);
  expect(foo.problems.get()).toBeFalsy();
});

it('compiles json', () => {
  const files = Signal.ok(Immutable.Map({
    'foo.json': new data.File(
      'foo.json',
      Signal.cellOk(Buffer.from("{ }"))
    )
  }));
  const { compiledNotes } = compileFiles(trace, files,  updateFile, setSelected);
  compiledNotes.reconcile(trace, 1);
  const foo = compiledNotes.get().get('foo');
  if (!foo) bug('expected foo');
  foo.problems.reconcile(trace, 1);
  expect(foo.problems.get()).toBeFalsy();
});

it('compiles meta', () => {
  const files = Signal.ok(Immutable.Map({
    'foo.meta': new data.File(
      'foo.meta',
      Signal.cellOk(Buffer.from("{ }"))
    )
  }));
  const { compiledNotes } = compileFiles(trace, files, updateFile, setSelected);
  compiledNotes.reconcile(trace, 1);
  const foo = compiledNotes.get().get('foo');
  if (!foo) bug('expected foo');
  foo.problems.reconcile(trace, 1);
  expect(foo.problems.get()).toBeFalsy();
});

it('compiles json with meta', () => {
  const metaFile = new data.File(
    'foo.meta',
    Signal.cellOk(Buffer.from('{ dataType: "{ foo: number }" }'))
  );
  const jsonFile = new data.File(
    'foo.json',
    Signal.cellOk(Buffer.from('{ foo: 7 }'))
  );
  const files = Signal.ok(Immutable.Map({
    'foo.meta': metaFile,
    'foo.json': jsonFile,
  }));
  const { compiledNotes } = compileFiles(trace, files, updateFile, setSelected);
  compiledNotes.reconcile(trace, 1);
  const foo = compiledNotes.get().get('foo');
  if (!foo) bug('expected foo');

  foo.problems.reconcile(trace, 1);
  expect(foo.problems.get()).toBeFalsy();
});

it('compiles mdx with meta', () => {
  const metaFile = new data.File(
    'foo.meta',
    Signal.cellOk(Buffer.from('{ }'))
  );
  const mdxFile = new data.File(
    'foo.mdx',
    Signal.cellOk(Buffer.from('foo'))
  );
  const files = Signal.ok(Immutable.Map({
    'foo.meta': metaFile,
    'foo.mdx': mdxFile,
  }));
  const { compiledNotes } = compileFiles(trace, files, updateFile, setSelected);
  compiledNotes.reconcile(trace, 1);
  const foo = compiledNotes.get().get('foo');
  if (!foo) bug('expected foo');

  foo.problems.reconcile(trace, 1);
  expect(foo.problems.get()).toBeFalsy();

  foo.rendered.reconcile(trace, 1);
  expect(foo.rendered.get()).toEqual(
    [
      null, null, null, null, // TODO(jaked) not sure where these come from
      React.createElement('p', {}, 'foo')
    ]
  );
});

// TODO(jaked)
// test updateFile / setSelected