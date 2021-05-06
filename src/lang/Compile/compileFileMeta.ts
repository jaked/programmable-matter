import * as Immutable from 'immutable';
import Signal from '../../util/Signal';
import * as Parse from '../Parse';
import * as ESTree from '../ESTree';
import Type from '../Type';
import Typecheck from '../Typecheck';
import * as Dyncheck from '../Dyncheck';
import * as Evaluate from '../Evaluate';
import { Interface, Content, CompiledFile } from '../../model';
import * as Meta from '../../model/Meta';

const exportType = Signal.ok(Type.module({ default: Type.metaType }));
const exportDynamic = Signal.ok(new Map([[ 'default', false ]]));
const rendered = Signal.ok(null);

export default function compileFileMeta(
  file: Content,
): CompiledFile {
  const compiled = file.content.map(content => {
    const ast = Parse.parseExpression(content as string);
    const interfaceMap = new Map<ESTree.Node, Interface>();
    const intf = Typecheck.check(ast, Typecheck.env(), Type.metaType, interfaceMap);
    const dynamicMap = new Map<ESTree.Node, boolean>();
    Dyncheck.expression(ast, interfaceMap, Immutable.Map(), dynamicMap);
    const problems = [...interfaceMap.values()].some(intf => intf.type.kind === 'Error');
    const value = intf.type.kind === 'Error' ?
      intf.type.err :
      Meta.validate(Evaluate.evaluateExpression(ast, interfaceMap, dynamicMap, Immutable.Map()));
    const exportValue = new Map([[ 'default', value ]]);
    return {
      ast,
      interfaceMap,
      problems,
      exportValue,
    }
  });
  return {
    ast: compiled.map(({ ast }) => ast),
    exportType,
    interfaceMap: compiled.map(({ interfaceMap }) => interfaceMap),
    problems: compiled.liftToTry().map(compiled =>
      compiled.type === 'ok' ? compiled.ok.problems : true
    ),
    exportValue: compiled.map(({ exportValue }) => exportValue),
    exportDynamic,
    rendered
  };
}
