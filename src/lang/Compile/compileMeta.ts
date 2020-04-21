import * as Immutable from 'immutable';
import Signal from '../../util/Signal';
import Try from '../../util/Try';
import * as ESTree from '../ESTree';
import * as Parse from '../Parse';
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

// TODO(jaked)
// make Type part of the type system and convert?
function convertMeta(obj: any): data.Meta {
  let dataType = {}
  if (typeof obj.dataType === 'string') {
    try {
      dataType = { dataType: Parse.parseType(obj.dataType) }
    } catch (e) {
      // TODO(jaked) how to surface these?
      console.log(e)
    }
  }

  const dirMeta =
    typeof obj.dirMeta === 'object' ?
    { dirMeta: convertMeta(obj.dirMeta) } : {};

  return { ...obj, ...dataType, ...dirMeta };
}

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
      Signal.ok(convertMeta(Evaluate.evaluateExpression(ast, Immutable.Map())));

  const exportType = Type.module({ default: metaType });
  const exportValue = { default: value }
  const rendered = Signal.ok(null);
  return { exportType, exportValue, rendered, astAnnotations, problems };
}
