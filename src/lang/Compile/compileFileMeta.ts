import * as Immutable from 'immutable';
import Signal from '../../util/Signal';
import * as Parse from '../Parse';
import Type from '../Type';
import Typecheck from '../Typecheck';
import * as Evaluate from '../Evaluate';
import { Content, CompiledFile } from '../../data';
import * as Meta from '../../Meta';

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
      Signal.ok(Meta.validate(Evaluate.evaluateExpression(ast, annots, Immutable.Map())));
    const exportValue = new Map([[ 'default', value ]]);
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
