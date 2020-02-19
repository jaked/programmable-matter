import * as Immutable from 'immutable';
import * as ESTree from './ESTree';
import * as Parse from './Parse';
import * as Evaluator from './Evaluator';

describe('evaluateExpression', () => {
  function expectEval(
    exprOrString: ESTree.Expression | string,
    value: any,
    env: Evaluator.Env = Immutable.Map()
  ) {
    const expr =
      (typeof exprOrString === 'string') ? Parse.parseExpression(exprOrString)
      : exprOrString;
    expect(Evaluator.evaluateExpression(expr, env)).toEqual(value)
  }

  describe('conditional expressions', () => {
    it('true', () => {
      expectEval(`true ? 1 : 2`, 1);
    });

    it('false', () => {
      expectEval(`false ? 1 : 2`, 2);
    });
  });

  describe('unary expressions', () => {
    it('!', () => {
      expectEval('!false', true);
    });

    it('typeof', () => {
      expectEval('typeof 7', 'number');
    });
  });
});
