import * as Immutable from 'immutable';
import Signal from '../../util/Signal';
import * as Parse from '../Parse';
import Type from '../Type';
import Typecheck from '../Typecheck';
import * as Evaluate from '../Evaluate';
import { Content, CompiledFile, Meta } from '../../data';

// TODO(jaked)
// make Type part of the type system and convert?
function convertMeta(obj: any): Meta {
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

  return Meta({ ...obj, ...dataType, ...dirMeta });
}

export default function compileFileMeta(
  file: Content,
): Signal<CompiledFile> {
  const ast = file.content.map(c => Parse.parseExpression(c as string));

  return ast.liftToTry().map(astTry => {
    switch (astTry.type) {
      case 'ok': {
        const ast = astTry.ok;
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
        return {
          exportType,
          exportValue,
          rendered,
          astAnnotations: annots,
          problems,
          ast: astTry
        };
      }
      // TODO(jaked) consolidate with compileMeta error case
      case 'err': {
        return {
          exportType: Type.module({}),
          exportValue: { default: Signal.ok(Meta({})) },
          rendered: Signal.constant(astTry),
          problems: true,
          ast: astTry
        }
      }
    }
  });
}
