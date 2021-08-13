import Type from '../type';
import Typecheck from './index';
import expectSynth from './expectSynth';

const error = new Error('error');
const env = Typecheck.env({
  error: Type.error(error),
  number: Type.number,
  string: Type.string,
});

describe('+', () => {
  it('literal number + literal number', () => {
    expectSynth({
      expr: '1 + 2',
      type: 'number',
    });
  });

  it('error + literal number', () => {
    expectSynth({
      expr: 'error + 2',
      type: '2',
    });
  });

  it('literal number + error', () => {
    expectSynth({
      expr: '1 + error',
      type: '1',
    });
  });

  it('literal string + literal string', () => {
    expectSynth({
      expr: '"foo" + "bar"',
      type: `string`,
    });
  });

  it('number + number', () => {
    expectSynth({
      expr: 'number + number',
      env,
      type: 'number',
    });
  });

  it('error + number', () => {
    expectSynth({
      expr: 'error + number',
      env,
      type: 'number',
    });
  });

  it('number + error', () => {
    expectSynth({
      expr: 'error + number',
      env,
      type: 'number',
    });
  });

  it('string + string', () => {
    expectSynth({
      expr: 'string + string',
      env,
      type: 'string',
    });
  });
});

describe('=== / !==', () => {
  it('literal string === literal string', () => {
    expectSynth({
      expr: '"foo" === "bar"',
      type: 'false',
    });
  });

  it('literal string !== literal string', () => {
    expectSynth({
      expr: '"foo" !== "bar"',
      type: 'true',
    });
  });

  it('string === string', () => {
    expectSynth({
      expr: 'string === string',
      env,
      type: 'boolean',
    });
  });

  it('string !== string', () => {
    expectSynth({
      expr: 'string !== string',
      env,
      type: 'boolean',
    });
  });

  it('error === string', () => {
    expectSynth({
      expr: 'error === string',
      type: 'false',
    });
  });

  it('error !== string', () => {
    expectSynth({
      expr: 'error !== string',
      type: 'true',
    });
  });
});
