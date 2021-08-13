import Type from '../type';
import Typecheck from './index';
import expectSynth from './expectSynth';

const env = Typecheck.env({
  Component: '(o: { foo: number, bar: undefined | number }) => string',
  FC: 'React.FC<{ foo: number }>',
  Component2: '(o: { baz: undefined | boolean }) => string',
  NotFunction: 'string',
  TooManyParams: '(s: string, n: number) => boolean',
  ParamNotObject: '(s: string) => boolean',
  WrongChildrenType: '(o: { children: number }) => boolean',
});

it('ok', () => {
  // bar may be omitted because the type may be undefined
  expectSynth({
    expr: '<Component foo={7} />',
    env,
    type: 'string',
  });
});

it('ok FC', () => {
  expectSynth({
    expr: '<FC foo={7} />',
    env,
    type: Type.reactNodeType,
  });
});

it('ok no attr value', () => {
  expectSynth({
    expr: '<Component2 baz />',
    env,
    type: 'string',
  });
});

it('error with no attr value of wrong type', () => {
  expectSynth({
    expr: '<Component2 baz={7} />',
    env,
    error: true,
  });
});

it('error when prop is missing', () => {
  expectSynth({
    expr: '<Component />',
    env,
    error: true,
  });
});

it('error when prop has wrong type', () => {
  expectSynth({
    expr: '<Component foo={"bar"} />',
    env,
    error: true,
  });
});

it('error when not a function', () => {
  expectSynth({
    expr: '<NotFunction />',
    env,
    error: true,
  });
});

it('error when too many params', () => {
  expectSynth({
    expr: '<TooManyParams />',
    env,
    error: true,
  });
});

it('error when param is not an object', () => {
  expectSynth({
    expr: '<ParamNotObject />',
    env,
    error: true,
  });
});

it('error when wrong children type', () => {
  expectSynth({
    expr: '<WrongChildrenType />',
    env,
    error: true,
  });
});

it('survives attrs with type errors if attr can be undefined', () => {
  expectSynth({
    expr: `<Component foo={7} bar={'baz'} />`,
    env,
    type: 'string',
    error: true,
  });
});

it('survives children with type errors', () => {
  expectSynth({
    expr: `<FC foo={7}><FC foo={'bar'} /></FC>`,
    env,
    type: Type.reactNodeType,
    error: true,
  });
});
