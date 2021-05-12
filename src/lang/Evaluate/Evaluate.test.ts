import * as Immutable from 'immutable';
import Try from '../../util/Try';
import Type from '../Type';
import Typecheck from '../Typecheck';
import expectEval from './expectEval';

const error = new Error('error');
const tenv = Typecheck.env({
  error: Try.err(error),
  bug: Try.ok({ type: Type.functionType([], Type.never), dynamic: false }),
});
const denv = Immutable.Map({
  error: false,
  bug: false,
})
const venv = Immutable.Map({
  error: error,
  bug: () => { throw 'bug' },
});

describe('unary expressions', () => {
  describe('!', () => {
    it('!false', () => {
      expectEval({
        expr: '!false',
        value: true,
      });
    });

    it('!error', () => {
      expectEval({
        expr: '!error',
        value: true,
      });
    });
  })

  describe('typeof', () => {
    it('typeof 7', () => {
      expectEval({
        expr: 'typeof 7',
        value: 'number',
      });
    });

    it('typeof error', () => {
      expectEval({
        expr: 'typeof error',
        value: 'error',
      });
    });
  });
});

describe('logical expressions', () => {
  it('short-circuit &&', () => {
    expectEval({
      expr: 'false && bug()',
      value: false,
      tenv,
      denv,
      venv,
    });
  });

  // TODO(jaked)
  // this doesn't actually execute the &&
  // because the return type is already Error
  it('short-circuit error &&', () => {
    expectEval({
      expr: 'error && bug()',
      value: undefined,
      tenv,
      denv,
      venv,
    });
  });

  it('short-circuit ||', () => {
    expectEval({
      expr: 'true || bug()',
      value: true,
      tenv,
      denv,
      venv,
    });
  });

  it('error is falsy in ||', () => {
    expectEval({
      expr: 'error || true',
      value: true,
      tenv,
      denv,
      venv,
    });
  });
});

describe('binary expressions', () => {
  describe('+', () => {
    it('number + error', () => {
      expectEval({
        expr: `7 + error`,
        value: 7,
        tenv,
        denv,
        venv,
      });
    });

    it('error + number', () => {
      expectEval({
        expr: `error + 7`,
        value: 7,
        tenv,
        denv,
        venv,
      });
    });
  });
});

describe('member expressions', () => {
  const tenv = Typecheck.env({
    error: Type.error(error),
    object: '{ foo: boolean }',
    array: 'number[]',
  });
  const denv = Immutable.Map({
    error: false,
    object: false,
    array: false,
  });
  const venv = Immutable.Map({
    error: error,
    object: { foo: true },
    array: [ 1, 2, 3 ],
  });

  it('error in target propagates', () => {
    expectEval({
      expr: `error.foo`,
      value: undefined,
      tenv,
      denv,
      venv,
    });
  });

  it('error in object property propagates', () => {
    expectEval({
      expr: `object[error]`,
      value: undefined,
      tenv,
      denv,
      venv,
    });
  });

  it('error in array property is undefined', () => {
    expectEval({
      expr: `array[error]`,
      value: undefined,
      tenv,
      denv,
      venv,
    });
  });
});

describe('conditional expressions', () => {
  it('true', () => {
    expectEval({
      expr: `true ? 1 : 2`,
      value: 1,
    });
  });

  it('false', () => {
    expectEval({
      expr: `false ? 1 : 2`,
      value: 2,
    });
  });

  it('error', () => {
    expectEval({
      expr: `error ? 1 : 2`,
      value: 2,
    });
  });
});

describe('call expressions', () => {
  const tenv = Typecheck.env({
    error: Type.error(error),
    g: '(a: undefined | boolean, b: boolean, c: undefined | boolean) => boolean',
  });
  const denv = Immutable.Map({
    error: false,
    g: false,
  });
  const venv = Immutable.Map({
    error: error,
    g: (a, b, c) => a || b || c
  });

  it('survives missing trailing args when arg can be undefined', () => {
    expectEval({
      expr: `g(false, true)`,
      value: true,
      tenv,
      denv,
      venv,
    });
  });

  it('survives erroneous args when arg can be undefined', () => {
    expectEval({
      expr: `g(error, false, false)`,
      value: false,
      tenv,
      denv,
      venv,
    });
  });
});

describe('JSX', () => {
  const tenv = Typecheck.env({
    Foo: '(o: { bar: boolean }) => boolean',
    Bar: 'React.FC<{ baz: undefined | string }>',
    Baz: 'React.FC<{ quux: string }>',
  });
  const denv = Immutable.Map({
    Foo: false,
    Bar: false,
  });
  const venv = Immutable.Map({
    Foo: ({ bar }) => bar,
    Bar: ({ children, baz }) => baz ? [ baz, ...children] : children,
  });

  // TODO(jaked)
  // these tests depend on Evaluate hack that applies Foo
/*
  it('attr with no value', () => {
    expectEval({
      expr: '<Foo bar={false} />',
      value: false,
      tenv,
      venv,
    });
    expectEval({
      expr: '<Foo bar />',
      value: true,
      tenv,
      venv,
    });
  });

  it('survives children with type errors', () => {
    expectEval({
      expr: `<Bar>this<Baz quux={7} />that</Bar>`,
      value: ['this', undefined, 'that'],
      tenv,
      venv,
    });
  });

  it('survives attrs with type errors if attr can be undefined', () => {
    expectEval({
      expr: `<Bar>this<Bar baz={7} />that</Bar>`,
      value: ['this', [], 'that'],
      tenv,
      venv,
    });
  });
*/
});

describe('Map#filter', () => {
  it('works', () => {
    expectEval({
      expr: `foo.filter((v, k) => k === 'bar').size`,
      value: 1,
      tenv: { foo: Type.map(Type.string, Type.number) },
      denv: { foo: false },
      venv: {
        foo: Immutable.Map({
          bar: 7,
          baz: 9,
        })
      },
    });
  });
});
