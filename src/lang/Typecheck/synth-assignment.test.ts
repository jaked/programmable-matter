import Try from '../../util/Try';
import * as Parse from '../Parse';
import Type from '../../type';
import Typecheck from './index';
import expectSynth from './expectSynth';

const error = new Error('error');
const env = Typecheck.env({
  error: Try.err(error),
  number: Try.ok({ type: Type.number, dynamic: false }),
  string: Try.ok({ type: Type.string, dynamic: false }),
  cellNumber: Try.ok({ type: Type.number, dynamic: false, mutable: 'Code' }),
  cellObject: Try.ok({ type: Parse.parseType('{ x: number, y: number }'), dynamic: false, mutable: 'Code' }),
  cellArray: Try.ok({ type: Parse.parseType('number[]'), dynamic: false, mutable: 'Code' }),
  moduleCell: Try.ok({
    type: Type.module({ cell: Try.ok({ type: Type.number, dynamic: false, mutable: 'Code' }) }),
    dynamic: false
  }),
});

it(`ok`, () => {
  expectSynth({
    expr: 'cellNumber = 7',
    type: '7',
    env
  });
});

it(`ok object`, () => {
  expectSynth({
    expr: 'cellObject.x = 7',
    type: '7',
    env
  });
});

it(`ok array`, () => {
  expectSynth({
    expr: 'cellArray[0] = 7',
    type: '7',
    env
  });
});

it(`ok module`, () => {
  expectSynth({
    expr: 'moduleCell.cell = 7',
    type: '7',
    env
  });
});

it(`not a cell`, () => {
  expectSynth({
    expr: 'number = 7',
    env,
    error: true
  });
});

it(`wrong value assigned to cell`, () => {
  expectSynth({
    expr: `cellNumber = 'foo'`,
    env,
    error: true
  });
});
