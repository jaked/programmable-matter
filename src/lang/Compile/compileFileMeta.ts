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

const exportType = Signal.ok(Type.module({ default: Type.metaType }));
const rendered = Signal.ok(null);

export default function compileFileMeta(
  file: Content,
): CompiledFile {
  const compiled = file.content.map(content => {
    const ast = Parse.parseExpression(content as string);
    const annots = new Map<unknown, Type>();
    const error = Typecheck.check(ast, Typecheck.env(), Type.metaType, annots);
    const problems = [...annots.values()].some(t => t.kind === 'Error');
    const value = error.kind === 'Error' ?
      Signal.err(error.err) :
      Signal.ok(convertMeta(Evaluate.evaluateExpression(ast, annots, Immutable.Map())));
    const exportValue = { default: value };
    return {
      ast,
      annots,
      problems,
      exportValue,
    }
  });
  return {
    ast: compiled.map(({ ast }) => ast),
    exportType,
    astAnnotations: compiled.map(({ annots }) => annots),
    problems: compiled.liftToTry().map(compiled =>
      compiled.type === 'ok' ? compiled.ok.problems : true
    ),
    exportValue: compiled.map(({ exportValue }) => exportValue),
    rendered
  };
}
