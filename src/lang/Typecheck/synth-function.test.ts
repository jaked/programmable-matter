import Type from '../../type';
import Typecheck from './index';
import expectSynth from './expectSynth';

const error = new Error('error');
const env = Typecheck.env({
  error: Type.error(error),
  number: Type.number,
  string: Type.string,
});
it('ok', () => {
  expectSynth({
    expr: '() => 7',
    type: '() => 7',
  });
});

it('ok with params', () => {
  expectSynth({
    expr: '(x: number, y: 7) => x + y',
    type: '(n: number, s: 7) => number',
  });
});

it('ok with block body', () => {
  expectSynth({
    expr: '(x: number, y: 7) => { x + y }',
    type: '(n: number, s: 7) => number',
  });
});

it('ok with empty block body', () => {
  expectSynth({
    expr: '(x: number, y: 7) => { }',
    type: '(n: number, s: 7) => undefined',
  });
});

it('erroneous return', () => {
  expectSynth({
    expr: '(x: number) => error',
    env,
    type: Type.functionType([ Type.number ], Type.error(error)),
  })
});

it('missing param type', () => {
  expectSynth({
    expr: '(x) => x',
    env,
    type: Type.functionType(
      [ Type.unknown ],
      Type.error(new Error('function parameter must have a type'))
    ),
  })
});

it('missing param type with pattern', () => {
  expectSynth({
    expr: '({ x }) => x',
    env,
    type: Type.functionType(
      [ Type.object({ x: Type.unknown }) ],
      Type.error(new Error('function parameter must have a type'))
    ),
  })
});
