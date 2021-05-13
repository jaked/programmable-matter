import * as Immutable from 'immutable';
import Signal from '../../util/Signal';
import Try from '../../util/Try';
import * as Parse from '../Parse';
import * as ESTree from '../ESTree';
import Type from '../Type';
import Typecheck from '../Typecheck';
import * as Evaluate from '../Evaluate';
import { Interface, Content, CompiledFile } from '../../model';
import * as Meta from '../../model/Meta';

const exportInterface = Signal.ok(new Map([[ 'default', Try.ok({ type: Type.metaType, dynamic: false }) ]]));
const rendered = Signal.ok(null);

export default function compileFileMeta(
  file: Content,
): CompiledFile {
  const compiled = file.content.map(content => {
    const ast = Parse.parseExpression(content as string);
    const interfaceMap = new Map<ESTree.Node, Interface>();
    const intf = Typecheck.check(ast, Typecheck.env(), Type.metaType, interfaceMap);
    const problems = [...interfaceMap.values()].some(intf => intf.type === 'err');
    const value = intf.type === 'err' ?
      intf.err :
      Meta.validate(Evaluate.evaluateExpression(ast, interfaceMap, Immutable.Map()));
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
    exportInterface,
    interfaceMap: compiled.map(({ interfaceMap }) => interfaceMap),
    problems: compiled.liftToTry().map(compiled =>
      compiled.type === 'ok' ? compiled.ok.problems : true
    ),
    exportValue: compiled.map(({ exportValue }) => exportValue),
    rendered
  };
}
