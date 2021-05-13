import { bug } from '../../util/bug';
import * as PMAST from '../../model/PMAST';
import * as ESTree from '../ESTree';
import { Interface, InterfaceMap } from '../../model';
import * as Parse from '../Parse';
import Type from '../Type';
import Typecheck from '../Typecheck';
import * as Render from '../Render';
import * as Generate from './index';

// duplicates some of compileFilePm but without Signals
function typecheckNodes(
  nodes: PMAST.Node[],
) {
  const codeNodes: PMAST.Code[] = [];
  const inlineCodeNodes: PMAST.InlineCode[] = [];
  function walkNodes(node: PMAST.Node) {
    if (PMAST.isCode(node)) codeNodes.push(node);
    else if (PMAST.isInlineCode(node)) inlineCodeNodes.push(node);
    else if (PMAST.isElement(node)) node.children.forEach(walkNodes);
  }
  nodes.forEach(walkNodes);

  const moduleTypeEnv: Map<string, Map<string, Interface>> = new Map();
  const moduleDynamicEnv: Map<string, Map<string, boolean>> = new Map();
  let interfaceEnv = Render.initInterfaceEnv;
  const interfaceMap: InterfaceMap = new Map();

  codeNodes.forEach(node => {
    const code = Parse.parseCodeNode(node);
    code.forEach(code => {
      interfaceEnv = Typecheck.synthProgram(
        moduleTypeEnv,
        code,
        interfaceEnv,
        interfaceMap
      );
    });
  });

  inlineCodeNodes.forEach(node => {
    const code = Parse.parseInlineCodeNode(node);
    code.forEach(code => {
      Typecheck.check(
        code,
        interfaceEnv,
        Type.reactNodeType,
        interfaceMap
      );
    })
  });

  return { interfaceMap };
}

function expectGenerate(
  nodes: PMAST.Node[],
  expected: string
) {
  const { interfaceMap } = typecheckNodes(nodes);
  const js =
    Generate.generatePm(
      nodes,
      (e: ESTree.Expression) => interfaceMap.get(e) ?? bug(`expected type`),
      false
    );
  expect(js.trim()).toBe(expected.trim());
}

it('generates nothing for static doc with no exports', () => {
  const nodes: PMAST.Node[] = [
    { type: 'code', children: [ { text: 'const x = 7' } ] },
  ];
  expectGenerate(nodes, '');
});

it('generates export for doc with export', () => {
  const nodes: PMAST.Node[] = [
    { type: 'code', children: [ { text: 'export const x = 7' } ] },
  ];
  expectGenerate(nodes, 'export const x = 7;');
});

it('generates React hydrate for doc with dynamic node', () => {
  const nodes: PMAST.Node[] = [
    { type: 'code', children: [ { text: 'now' } ] },
  ];
  expectGenerate(
    nodes,
    `ReactDOM.hydrate(Signal.node(Runtime.now), document.getElementById("__root0"));`
  );
});
