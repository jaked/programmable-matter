import Type from '../Type';
import Typecheck from './index';
import expectSynth from './expectSynth';

const error = new Error('error');
const env = Typecheck.env({
  error: Type.error(error),
  number: Type.number,
  string: Type.string,
  cellNumber: 'Code<number>',
});

it(`ok`, () => {
  expectSynth({
    expr: 'cellNumber = 7',
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
