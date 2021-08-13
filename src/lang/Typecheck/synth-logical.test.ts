import Type from '../../type';
import Typecheck from './index';
import expectSynth from './expectSynth';

const error = new Error('error');
const env = Typecheck.env({
  error: Type.error(error),
  number: Type.number,
  string: Type.string,
  undefinedOrNumber: Type.undefinedOrNumber,
});

describe('&&', () => {
  it('truthy && unknown', () => {
    expectSynth({
      expr: '"foo" && number',
      env,
      type: 'number',
    });
  });

  it('falsy && unknown', () => {
    expectSynth({
      expr: '0 && string',
      env,
      type: '0',
    });
  });

  it('error && unknown', () => {
    expectSynth({
      expr: 'error && string',
      env,
      type: Type.error(error),
    });
  });

  it('unknown && unknown', () => {
    expectSynth({
      expr: 'number && string',
      env,
      type: '0 | string',
    });
  });
});

describe('||', () => {
  it('truthy || unknown', () => {
    expectSynth({
      expr: '"foo" || number',
      env,
      type: `'foo'`,
    });
  });

  it('falsy || unknown', () => {
    expectSynth({
      expr: '0 || string',
      env,
      type: 'string',
    });
  });

  it('error || unknown', () => {
    expectSynth({
      expr: 'error || string',
      env,
      type: 'string',
    });
  });

  it('unknown || unknown', () => {
    expectSynth({
      expr: 'number || string',
      env,
      type: 'number | string'
    });
  });
});

describe('??', () => {
  it('defined || unknown', () => {
    expectSynth({
      expr: '"foo" ?? number',
      env,
      type: `'foo'`,
    });
  });

  it('undefined ?? unknown', () => {
    expectSynth({
      expr: 'undefined ?? string',
      env,
      type: 'string',
    });
  });

  it('error ?? unknown', () => {
    expectSynth({
      expr: 'error ?? string',
      env,
      type: 'string',
    });
  });

  it('unknown ?? unknown', () => {
    expectSynth({
      expr: 'undefinedOrNumber ?? string',
      env,
      type: 'string | number' // TODO(jaked) why are these switched?
    });
  });
});

describe('narrowing', () => {
  it('&& narrows to non-falsy on rhs', () => {
    expectSynth({
      expr: 's && s.length',
      env: { s: 'undefined | { length: number }' },
      type: 'undefined | number',
    });
  });

  it('|| narrows to non-truthy on rhs', () => {
    expectSynth({
      expr: 's === null || s.length',
      env: { s: 'null | { length : number }' },
      // TODO(jaked) boolean & not(false) === true
      type: 'boolean | number',
    });
  });

  it('narrowed && narrows both sides when true', () => {
    expectSynth({
      expr: 'foo && foo.bar && foo.bar.baz',
      env: { foo: 'undefined | { bar: undefined | { baz: number } }' },
      type: 'undefined | number',
    });
  });
});
