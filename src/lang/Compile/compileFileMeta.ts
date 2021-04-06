import * as Immutable from 'immutable';
import Signal from '../../util/Signal';
import * as Parse from '../Parse';
import * as ESTree from '../ESTree';
import Type from '../Type';
import Typecheck from '../Typecheck';
import * as Evaluate from '../Evaluate';
import { Content, CompiledFile } from '../../model';
import * as Meta from '../../model/Meta';

const exportType = Signal.ok(Type.module({ default: Type.metaType }));
const exportDynamic = Signal.ok(new Map([[ 'default', false ]]));
const rendered = Signal.ok(null);

export default function compileFileMeta(
  file: Content,
): CompiledFile {
  const compiled = file.content.map(content => {
    const ast = Parse.parseExpression(content as string);
    const typeMap = new Map<ESTree.Node, Type>();
    const error = Typecheck.check(ast, Typecheck.env(), Type.metaType, typeMap);
    const problems = [...typeMap.values()].some(t => t.kind === 'Error');
    const value = error.kind === 'Error' ?
      error.err :
      Meta.validate(Evaluate.evaluateExpression(ast, typeMap, Immutable.Map()));
    const exportValue = new Map([[ 'default', value ]]);
    return {
      ast,
      typeMap,
      problems,
      exportValue,
    }
  });
  return {
    ast: compiled.map(({ ast }) => ast),
    exportType,
    typeMap: compiled.map(({ typeMap }) => typeMap),
    problems: compiled.liftToTry().map(compiled =>
      compiled.type === 'ok' ? compiled.ok.problems : true
    ),
    exportValue: compiled.map(({ exportValue }) => exportValue),
    exportDynamic,
    rendered
  };
}
