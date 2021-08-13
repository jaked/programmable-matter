import * as Immutable from 'immutable';
import Try from '../util/Try';
import Type from '../type';
import Typecheck from '../typecheck';
import expectEval from './expectEval';

const error = new Error('error');
const tenv = Typecheck.env({
  error: Try.err(error),
  bug: Try.ok({ type: Type.functionType([], Type.never), dynamic: false }),
});
const venv = Immutable.Map({
  error: error,
  bug: () => { throw 'bug' },
});

it('short-circuit &&', () => {
  expectEval({
    expr: 'false && bug()',
    value: false,
    tenv,
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
    venv,
  });
});

it('short-circuit ||', () => {
  expectEval({
    expr: 'true || bug()',
    value: true,
    tenv,
    venv,
  });
});

it('error is falsy in ||', () => {
  expectEval({
    expr: 'error || true',
    value: true,
    tenv,
    venv,
  });
});
