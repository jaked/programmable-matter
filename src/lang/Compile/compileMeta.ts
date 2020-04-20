import * as Immutable from 'immutable';
import Signal from '../../util/Signal';
import Try from '../../util/Try';
import * as ESTree from '../ESTree';
import Type from '../Type';
import Typecheck from '../Typecheck';
import * as Evaluate from '../Evaluate';
import * as data from '../../data';

const metaType =
  Type.object({
    dataType: Type.undefinedOrString,
    dirMeta: Type.undefinedOr(Type.object({
      dataType: Type.undefinedOrString,
    })),
  });

export default function compileMeta(
  ast: ESTree.Expression
): data.Compiled {
  const astAnnotations = new Map<unknown, Try<Type>>();
  let problems = false;
  let error;
  try {
    Typecheck.check(ast, Typecheck.env(), metaType, astAnnotations);
  } catch (e) {
    error = e;
    problems = true;
  }

  const value =
    problems ?
      Signal.err(error) :
      Signal.ok(Evaluate.evaluateExpression(ast, Immutable.Map()));

  const exportType = Type.module({ default: metaType });
  const exportValue = { default: value }
  const rendered = Signal.ok(null);
  return { exportType, exportValue, rendered, astAnnotations, problems };
}
