import * as JS from '@babel/types';

import { bug } from '../../util/bug';
import Try from '../../util/Try';
import Signal from '../../util/Signal';
import * as PMAST from '../../model/PMAST';
import * as ESTree from '../ESTree';
import { Interface, InterfaceMap } from '../../model';
import * as Parse from '../Parse';
import Type from '../Type';
import Typecheck from '../Typecheck';
import * as Render from '../Render';
import * as Generate from './index';
import expectGenerate from './expectGenerate';

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

function expectGenerateCode(
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
  expectGenerateCode(nodes, '');
});

it('generates export for doc with export', () => {
  const nodes: PMAST.Node[] = [
    { type: 'code', children: [ { text: 'export const x = 7' } ] },
  ];
  expectGenerateCode(nodes, 'export const x = 7;');
});

it('generates React hydrate for doc with dynamic node', () => {
  const nodes: PMAST.Node[] = [
    { type: 'code', children: [ { text: 'now' } ] },
  ];
  expectGenerateCode(
    nodes,
    `ReactDOM.hydrate(Signal.node(Runtime.now), document.getElementById("__root0"));`
  );
});

describe('literals', () => {
  it('numbers', () => {
    expectGenerate({ expr: '7', value: 7 });
  });

  it('booleans', () => {
    expectGenerate({ expr: 'true', value: true });
  });

  it('strings', () => {
    expectGenerate({ expr: `'foo'`, value: 'foo' });
  });
});

describe('unary expressions', () => {
  it('!', () => {
    expectGenerate({ expr: '!false', value: true });
    expectGenerate({
      expr: '!x',
      tenv: { x: Try.ok({ type: Type.boolean, dynamic: true }) },
      venv: { x: Signal.ok(true) },
      value: false
    });
  });

  it('typeof', () => {
    expectGenerate({ expr: `typeof 'foo'`, value: 'string' });
  });
});

describe('logical expressions', () => {
  it('&&', () => {
    const tenv = {
      seven: Try.ok({ type: Type.number, dynamic: true }),
      nine: Try.ok({ type: Type.number, dynamic: true }),
    };
    const venv = {
      seven: Signal.ok(7),
      nine: Signal.ok(9),
    };

    expectGenerate({ expr: `true && false`, value: false });
    expectGenerate({ expr: `7 && 9`, value: 9 });
    expectGenerate({ expr: `seven && 9`, tenv, venv, value: 9 });
    expectGenerate({ expr: `7 && nine`, tenv, venv, value: 9 });
    expectGenerate({ expr: `seven && nine`, tenv, venv, value: 9 });
  });

  it('||', () => {
    expectGenerate({ expr: `7 || false`, value: 7 });
    expectGenerate({ expr: `0 || 9`, value: 9 });
  });

  it('??', () => {
    expectGenerate({ expr: `undefined ?? 9`, value: 9 });
    expectGenerate({ expr: `7 ?? 9`, value: 7 });
  });
});

describe('binary expressions', () => {
  it('+', () => {
    expectGenerate({ expr: '1 + 2', value: 3 });
    expectGenerate({ expr: 'x + 2', value: 2 });
    expectGenerate({ expr: '1 + y', value: 1 });
    expectGenerate({ expr: 'x + y', value: undefined });
  });

  it('===', () => {
    expectGenerate({ expr: '7 === 7', value: true });
    expectGenerate({ expr: '7 === 9', value: false });
    expectGenerate({ expr: '7 === x', value: false });
    expectGenerate({ expr: 'x === 7', value: false });
    expectGenerate({ expr: 'x === y', value: false });
  });

  it('!==', () => {
    expectGenerate({ expr: '7 !== 7', value: false });
    expectGenerate({ expr: '7 !== 9', value: true });
    expectGenerate({ expr: '7 !== x', value: true });
    expectGenerate({ expr: 'x !== 7', value: true });
    expectGenerate({ expr: 'x !== y', value: true });
  });
});
