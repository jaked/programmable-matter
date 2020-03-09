import Signal from '../../util/Signal';
import Try from '../../util/Try';
import * as ESTree from '../ESTree';
import Type from '../Type';
import Typecheck from '../Typecheck';
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
  try {
    Typecheck.check(ast, Typecheck.env(), metaType, astAnnotations);
  } catch (e) {
    problems = true;
  }

  const exportType = Type.module({ });
  const exportValue = { }
  const rendered = Signal.ok(undefined);
  return { exportType, exportValue, rendered, astAnnotations, problems };
}
