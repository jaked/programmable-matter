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

it('generates export for doc with let export', () => {
  const nodes: PMAST.Node[] = [
    { type: 'code', children: [ { text: 'export let x: Session<number> = 7' } ] },
  ];
  expectGenerateCode(nodes, 'export const x = Signal.cellOk(7);');
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


// TODO(jaked)
// it would be cool to run the same tests on both Evaluate and Generate

describe('identifiers', () => {
  it('immutable', () => {
    expectGenerate({
      expr: 'foo',
      tenv: { foo: Try.ok({ type: Type.number, dynamic: false }) },
      venv: { foo: 7 },
      value: 7
    })
  });

  it('mutable', () => {
    expectGenerate({
      expr: 'foo',
      tenv: { foo: Try.ok({ type: Type.number, dynamic: false, mutable: 'Code' }) },
      venv: { foo: Signal.ok(7) },
      value: 7
    })
  });
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
  const tenv = {
    seven: Try.ok({ type: Type.number, dynamic: true }),
    nine: Try.ok({ type: Type.number, dynamic: true }),
  };
  const venv = {
    seven: Signal.ok(7),
    nine: Signal.ok(9),
  };

  it('+', () => {
    expectGenerate({ expr: '1 + 2', value: 3 });
    expectGenerate({ expr: 'x + 2', value: 2 });
    expectGenerate({ expr: '1 + y', value: 1 });
    expectGenerate({ expr: 'x + y', value: undefined });

    expectGenerate({ expr: '7 + nine', tenv, venv, value: 16 });
    expectGenerate({ expr: 'seven + 9', tenv, venv, value: 16 });
    expectGenerate({ expr: 'seven + nine', tenv, venv, value: 16 });
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

describe('sequence expressions',  () => {
  const tenv = {
    seven: Try.ok({ type: Type.number, dynamic: true }),
    nine: Try.ok({ type: Type.number, dynamic: true }),
  };
  const venv = {
    seven: Signal.ok(7),
    nine: Signal.ok(9),
  };

  it('ok', () => {
    expectGenerate({ expr: '7, 9', value: 9 });
    expectGenerate({ expr: 'x, 9', value: 9 });

    expectGenerate({ expr: 'seven, 9', tenv, venv, value: 9 });
    expectGenerate({ expr: '7, nine', tenv, venv, value: 9 });
  });
});

describe('member expressions', () => {
  const tenv = {
    array: Try.ok({ type: Type.array(Type.number), dynamic: false }),
    dynamicArray: Try.ok({ type: Type.array(Type.number), dynamic: true }),
    object: Try.ok({ type: Type.object({ x: Type.number, y: Type.number }), dynamic: false }),
    dynamicObject: Try.ok({ type: Type.object({ x: Type.number, y: Type.number }), dynamic: true }),
    one: Try.ok({ type: Type.number, dynamic: true }),
    x: Try.ok({ type: Type.singleton('x'), dynamic: true }),
    module: Try.ok({
      type: Type.module({
        static: Try.ok({ type: Type.number, dynamic: false }),
        dynamic: Try.ok({ type: Type.number, dynamic: true }),
        cell: Try.ok({ type: Type.number, dynamic: false, mutable: 'Code' }),
      }),
      dynamic: false,
    }),
  };
  const venv = {
    array: [1, 2, 3],
    dynamicArray: Signal.ok([1, 2, 3]),
    object: { x: 7, y: 9 },
    dynamicObject: Signal.ok({ x: 7, y: 9 }),
    one: Signal.ok(1),
    x: Signal.ok('x'),
    module: {
      static: 7,
      dynamic: Signal.ok(9),
      cell: Signal.cellOk(11),
    }
  };

  it('arrays', () => {
    expectGenerate({ expr: 'z[1]', value: undefined });
    expectGenerate({ expr: '[1, 2, 3][z]', value: undefined });

    expectGenerate({ expr: 'array[1]', tenv, venv, value: 2 });
    expectGenerate({ expr: 'array[one]', tenv, venv, value: 2 });
    expectGenerate({ expr: 'dynamicArray[1]', tenv, venv, value: 2 });
    expectGenerate({ expr: 'dynamicArray[one]', tenv, venv, value: 2 });
  });

  it('objects', () => {
    expectGenerate({ expr: 'z.foo', value: undefined });
    expectGenerate({ expr: 'object.z', value: undefined });

    expectGenerate({ expr: 'object.x', tenv, venv, value: 7 });
    expectGenerate({ expr: `object['x']`, tenv, venv, value: 7 });
    expectGenerate({ expr: `object[x]`, tenv, venv, value: 7 });
    expectGenerate({ expr: 'dynamicObject.x', tenv, venv, value: 7 });
    expectGenerate({ expr: `dynamicObject['x']`, tenv, venv, value: 7 });
    expectGenerate({ expr: `dynamicObject[x]`, tenv, venv, value: 7 });
  });

  it('modules', () => {
    expectGenerate({ expr: 'module.static', tenv, venv, value: 7 });
    expectGenerate({ expr: 'module.dynamic', tenv, venv, value: 9 });
    expectGenerate({ expr: 'module.cell', tenv, venv, value: 11 });
  });
});

describe('call expressions', () => {
  const tenv = {
    f: Try.ok({ type: Type.functionType([Type.undefinedOrNumber], Type.string), dynamic: false }),
    dynamicF: Try.ok({ type: Type.functionType([Type.undefinedOrNumber], Type.string), dynamic: true }),
    g: Try.ok({ type: Type.functionType([Type.number], Type.string), dynamic: false }),
    seven: Try.ok({ type: Type.number, dynamic: true }),
  };
  const venv = {
    f: () => 'f',
    dynamicF: Signal.ok(() => 'f'),
    g: () => 'g',
    seven: Signal.ok(7),
  };

  it('ok', () => {
    expectGenerate({ expr: 'g(1)', value: undefined });
    expectGenerate({ expr: 'f(7)', tenv, venv, value: 'f' });
    expectGenerate({ expr: 'f()', tenv, venv, value: 'f' });
    expectGenerate({ expr: 'f(x)', tenv, venv, value: 'f' });
    expectGenerate({ expr: 'g(7)', tenv, venv, value: 'g' });
    expectGenerate({ expr: 'g()', tenv, venv, value: undefined });
    expectGenerate({ expr: 'g(x)', tenv, venv, value: undefined });

    expectGenerate({ expr: 'dynamicF(7)', tenv, venv, value: 'f' });
    expectGenerate({ expr: 'f(seven)', tenv, venv, value: 'f' });
    expectGenerate({ expr: 'dynamicF(seven)', tenv, venv, value: 'f' });
  });
});

describe('object expressions', () => {
  const tenv = {
    seven: Try.ok({ type: Type.number, dynamic: true }),
    nine: Try.ok({ type: Type.number, dynamic: true }),
  };
  const venv = {
    seven: Signal.ok(7),
    nine: Signal.ok(9),
  };

  it('ok', () => {
    expectGenerate({ expr: '{ x: 7, y: 9 }', value: { x: 7, y: 9 } });
    expectGenerate({ expr: '{ x: seven, y: 9 }', tenv, venv, value: { x: 7, y: 9 } });
    expectGenerate({ expr: '{ x: seven, y: nine }', tenv, venv, value: { x: 7, y: 9 } });
  });
});

describe('array expressions', () => {
  const tenv = {
    seven: Try.ok({ type: Type.number, dynamic: true }),
    nine: Try.ok({ type: Type.number, dynamic: true }),
  };
  const venv = {
    seven: Signal.ok(7),
    nine: Signal.ok(9),
  };

  it('ok', () => {
    expectGenerate({ expr: '[ 7, 9 ]', value: [ 7, 9 ] });
    expectGenerate({ expr: '[ seven, 9 ]', tenv, venv, value: [ 7, 9 ] });
    expectGenerate({ expr: '[ seven, nine ]', tenv, venv, value: [ 7, 9 ] });
  });
});

describe('function expressions', () => {
  const tenv = {
    seven: Try.ok({ type: Type.number, dynamic: true }),
  };
  const venv = {
    seven: Signal.ok(7),
  };

  // TODO(jaked)
  // test that dynamic functions are actually dynamic
  it('ok', () => {
    expectGenerate({ expr: '(() => 7)()', value: 7 });
    expectGenerate({ expr: '(() => seven)()', tenv, venv, value: 7 });
  });
});

describe('conditional expressions', () => {
  const tenv = {
    seven: Try.ok({ type: Type.number, dynamic: true }),
    nine: Try.ok({ type: Type.number, dynamic: true }),
    zero: Try.ok({ type: Type.number, dynamic: true }),
  };
  const venv = {
    seven: Signal.ok(7),
    nine: Signal.ok(9),
    zero: Signal.ok(false),
  };

  it('ok', () => {
    expectGenerate({ expr: '7 ? 9 : 7', value: 9 });
    expectGenerate({ expr: '0 ? 9 : 7', value: 7 });
    expectGenerate({ expr: '7 ? nine : 7', tenv, venv, value: 9 });
    expectGenerate({ expr: '0 ? nine : 7', tenv, venv, value: 7 });
    expectGenerate({ expr: '7 ? nine : seven', tenv, venv, value: 9 });
    expectGenerate({ expr: '0 ? nine : seven', tenv, venv, value: 7 });
    expectGenerate({ expr: '7 ? 9 : seven', tenv, venv, value: 9 });
    expectGenerate({ expr: '0 ? 9 : seven', tenv, venv, value: 7 });
    expectGenerate({ expr: 'seven ? 9 : 7', tenv, venv, value: 9 });
    expectGenerate({ expr: 'zero ? 9 : 7', tenv, venv, value: 7 });
    expectGenerate({ expr: 'seven ? nine : 7', tenv, venv, value: 9 });
    expectGenerate({ expr: 'zero ? nine : 7', tenv, venv, value: 7 });
    expectGenerate({ expr: 'seven ? nine : seven', tenv, venv, value: 9 });
    expectGenerate({ expr: 'zero ? nine : seven', tenv, venv, value: 7 });
    expectGenerate({ expr: 'seven ? 9 : seven', tenv, venv, value: 9 });
    expectGenerate({ expr: 'zero ? 9 : seven', tenv, venv, value: 7 });
  });
});

describe('template literal expressions', () => {
  it('ok', () => {
    expectGenerate({ expr: '`foo`', value: 'foo' });
  });
});

describe('assignment expressions', () => {
  it('direct', () => {
    const tenv = {
      x: Try.ok({ type: Type.number, dynamic: false, mutable: 'Session' as const })
    }
    const venv = {
      x: Signal.cellOk(7)
    }
    expectGenerate({ expr: 'x = 9', tenv, venv, value: 9 });
    expect(venv.x.get()).toBe(9);
  });

  it('object', () => {
    const tenv = {
      object: Try.ok({ type: Parse.parseType('{ x: number, y: number }'), dynamic: false, mutable: 'Session' as const })
    }
    const venv = {
      object: Signal.cellOk({ x: 7, y: 9 }),
    }
    expectGenerate({ expr: 'object.x = 11', tenv, venv, value: 11 });
    expect(venv.object.get().x).toBe(11);
  });

  it('array', () => {
    const tenv = {
      array: Try.ok({ type: Parse.parseType('number[]'), dynamic: false, mutable: 'Session' as const })
    }
    const venv = {
      array: Signal.cellOk([ 7, 9 ])
    }
    expectGenerate({ expr: 'array[0] = 11', tenv, venv, value: 11 });
    expect(venv.array.get()[0]).toBe(11);
  });
});

describe('as expression', () => {
  it('ok', () => {
    expectGenerate({ expr: '7 as number', value: 7 });
  });
});
