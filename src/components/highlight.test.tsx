import * as Immutable from 'immutable';
import * as React from 'react';
import Trace from '../util/trace';
import Try from '../util/Try';
import * as Parse from '../lang/Parse';
import Type from '../lang/Type';
import Typecheck from '../lang/Typecheck';
import highlight from './highlight';
import { bug } from '../util/bug';

// dummy components; we compare React trees but don't render them
function component(name: string) {
  // set the function name, for debugging
  const obj = {
    [name]: (props) => bug('unimplemented')
  };
  return obj[name];
}

const ok =
{
  default: component('ok.default'),
  atom: component('ok.atom'),
  number: component('ok.number'),
  string: component('ok.string'),
  keyword: component('ok.keyword'),
  definition: component('ok.definition'),
  variable: component('ok.variable'),
  property: component('ok.property'),
  link: component('ok.link'),
}

const err =
{
  default: component('err.default'),
  atom: component('err.atom'),
  number: component('err.number'),
  string: component('err.string'),
  keyword: component('err.keyword'),
  definition: component('err.definition'),
  variable: component('err.variable'),
  property: component('err.property'),
  link: component('err.link'),
}

describe('highlight', () => {
  function expectHighlightMdx(
    mdx: string,
    moduleTypeEnv: Immutable.Map<string, Type.ModuleType>,
    expected: React.ReactNode,
  ) {
    // TODO(jaked) this is a lot of setup
    const trace = new Trace();
    const ast = Parse.parse(trace, mdx);
    const typeEnv = Immutable.Map<string, Type>();
    const exportTypes: { [s: string]: Type } = {};
    const annots = new Map<unknown, Type>();
    Typecheck.synthMdx(ast, moduleTypeEnv, typeEnv, exportTypes, annots);

    const highlighted =
      highlight(ok, err, 'mdx', mdx, Try.ok(ast), annots);
    expect(highlighted).toEqual(expected);
  }

  function expectHighlightExpr(
    expr: string,
    expected: React.ReactNode,
  ) {
    // TODO(jaked) this is a lot of setup
    const trace = new Trace();
    const ast = Parse.parseExpression(expr);
    const typeEnv = Immutable.Map<string, Type>();
    const annots = new Map<unknown, Type>();
    Typecheck.synth(ast, typeEnv, annots, trace);

    const highlighted =
      highlight(ok, err, 'json', expr, Try.ok(ast), annots);
    expect(highlighted).toEqual(expected);
  }

  describe('objects', () => {
    it('highlights duplicate property name', () => {
      expectHighlightExpr(
        `{ foo: 7, foo: 9 }`,
        [
          [
            <ok.default>{'{'}</ok.default>,
            ' ',
            <ok.variable>foo</ok.variable>,
            ': ',
            <ok.number>7</ok.number>,
            ', ',
            <err.variable data-status="duplicate property name 'foo'">foo</err.variable>,
            ': ',
            <ok.number>9</ok.number>,
            ' ',
            <ok.default>{'}'}</ok.default>,
          ],
          <br />
        ]
      );
    });

    it('highlights shorthand property on error', () => {
      expectHighlightExpr(
        `{ foo }`,
        [
          [
            <ok.default>{'{'}</ok.default>,
            ' ',
            <err.variable data-status="unbound identifier 'foo'">foo</err.variable>,
            ' ',
            <ok.default>{'}'}</ok.default>,
          ],
          <br />
        ]
      );
    });
  });

  describe('imports', () => {
    it('highlights module for missing module', () => {
      expectHighlightMdx(
        `import Foo from 'foo'`,
        Immutable.Map({ }),
        [
          [
            <ok.keyword>import</ok.keyword>,
            ' ',
            <ok.definition>Foo</ok.definition>,
            ' from ',
            <err.link data-link='foo' data-status="no module 'foo'">'foo'</err.link>,
          ],
          <br />,
        ]
      );
    });

    it('highlights local name for missing default import', () => {
      expectHighlightMdx(
        `import Foo from 'foo'`,
        Immutable.Map({
          foo: Type.module({ })
        }),
        [
          [
            <ok.keyword>import</ok.keyword>,
            ' ',
            <err.definition data-status="no default export on 'foo'">Foo</err.definition>,
            ' from ',
            <ok.link data-link='foo'>'foo'</ok.link>,
          ],
          <br />,
        ]
      );
    });

    it('highlights imported name for missing named import', () => {
      expectHighlightMdx(
        `import { Foo } from 'foo'`,
        Immutable.Map({
          foo: Type.module({ })
        }),
        [
          [
            <ok.keyword>import</ok.keyword>,
            ' { ',
            <err.definition data-status="no exported member 'Foo' on 'foo'">Foo</err.definition>,
            ' } from ',
            <ok.link data-link='foo'>'foo'</ok.link>,
          ],
          <br />,
        ]
      );
    });
  });
});
