import Try from '../../util/Try';
import Type from '../Type';
import * as Parse from '../Parse';
import Typecheck from './index';
import expectSynth from './expectSynth';

const error = new Error('error');
const env = Typecheck.env({
  error: Try.err(error),
  object: Try.ok({ type: Parse.parseType('{ foo: boolean, bar: number }'), dynamic: false }),
  array: Try.ok({ type: Parse.parseType('number[]'), dynamic: false }),
  tuple: Try.ok({ type: Parse.parseType('[ boolean, number ]'), dynamic: false }),
  numberUnion: Try.ok({ type: Parse.parseType('0 | 1'), dynamic: false }),
  stringUnion: Try.ok({ type: Parse.parseType(`'foo' | 'bar'`), dynamic: false }),
  objInt: Try.ok({ type: Parse.parseType('(() => boolean) & { bar: number }'), dynamic: false }),
  objectCell: Try.ok({ type: Parse.parseType('{ foo: boolean, bar: number }'), dynamic: false, mutable: 'Code' }),
});

it('property names', () => {
  expectSynth({
    expr: 'object.foo',
    env,
    type: 'boolean',
  });
});

it('error in target propagates', () => {
  expectSynth({
    expr: 'error.foo',
    env,
    type: Type.error(error),
  });
});

it('error in object property propagates', () => {
  expectSynth({
    expr: 'object[error]',
    env,
    type: Type.error(error),
  });
});

it('error in array property is undefined', () => {
  expectSynth({
    expr: 'array[error]',
    env,
    type: 'undefined',
  });
});

it('string index', () => {
  expectSynth({
    expr: 'object["foo"]',
    env,
    type: 'boolean'
  });
});

it('number index in array', () => {
  expectSynth({
    expr: 'array[0]',
    env,
    type: 'undefined | number',
  });
});

it('number index in tuple', () => {
  expectSynth({
    expr: 'tuple[0]',
    env,
    type: 'boolean',
  });
});

it('multiple number indexes in tuple', () => {
  expectSynth({
    expr: 'tuple[numberUnion]',
    env,
    type: 'boolean | number',
  });
});

it('multiple string indexes in object', () => {
  expectSynth({
    expr: 'object[stringUnion]',
    env,
    type: 'boolean | number',
  });
});

it('error on string index to array', () => {
  expectSynth({
    expr: 'array["xyzzy"]',
    error: true,
  });
});

it('error on tuple index out of range', () => {
  expectSynth({
    expr: 'tuple[2]',
    error: true,
  });
});

it('error on unknown object index', () => {
  expectSynth({
    expr: 'object["quux"]',
    error: true,
  });
});

it('error on unknown object property', () => {
  expectSynth({
    expr: 'object.quux',
    error: true,
  });
});

it('intersections', () => {
  expectSynth({
    expr: 'objInt.bar',
    env,
    type: 'number',
    error: false,
  });
});

it('member inside cell', () => {
  expectSynth({
    expr: 'objectCell.foo',
    env,
    type: 'boolean',
  });
});

it('computed member inside cell', () => {
  expectSynth({
    expr: `objectCell['foo']`,
    env,
    type: 'boolean',
  });
});

it('consume value of member inside cell', () => {
  expectSynth({
    expr: 'objectCell.bar + 1',
    env,
    type: 'number',
  });
});
