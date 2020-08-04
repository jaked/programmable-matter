import * as Immutable from 'immutable';
import Signal from '../../util/Signal';
import Try from '../../util/Try';
import * as ESTree from '../ESTree';
import * as Parse from '../Parse';
import Type from '../Type';
import Typecheck from '../Typecheck';
import * as Evaluate from '../Evaluate';
import File from '../../files/File';
import * as data from '../../data';

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

  return data.Meta({ ...obj, ...dataType, ...dirMeta });
}

function compileMeta(
  ast: ESTree.Expression
): data.Compiled {
  const annots = new Map<unknown, Type>();
  const error = Typecheck.check(ast, Typecheck.env(), Type.metaType, annots);
  const problems = [...annots.values()].some(t => t.kind === 'Error');

  const value =
    error.kind === 'Error' ?
      Signal.err(error.err) :
      Signal.ok(convertMeta(Evaluate.evaluateExpression(ast, annots, Immutable.Map())));

  const exportType = Type.module({ default: Type.metaType });
  const exportValue = { default: value }
  const rendered = Signal.ok(null);
  return { exportType, exportValue, rendered, astAnnotations: annots, problems };
}

export default function compileFileMeta(
  file: File,
): Signal<data.CompiledFile> {
  const ast = file.content.map(Parse.parseExpression);

  return ast.liftToTry().map(astTry => {
    switch (astTry.type) {
      case 'ok': {
        const compiled = compileMeta(astTry.ok);
        return { ...compiled, ast: astTry };
      }
      // TODO(jaked) consolidate with compileMeta error case
      case 'err': {
        return {
          exportType: Type.module({}),
          exportValue: { default: Signal.ok(data.Meta({})) },
          rendered: Signal.constant(astTry),
          problems: true,
          ast: astTry
        }
      }
    }
  });
}
