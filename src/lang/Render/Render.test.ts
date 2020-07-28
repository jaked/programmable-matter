import * as Immutable from 'immutable';
import Signal from '../../util/Signal';
import * as Parse from '../Parse';
import Type from '../Type';
import Typecheck from '../Typecheck';
import * as Render from './index';

describe('renderMdx', () => {
  describe('default import', () => {
    function expectOk(
      mdx: string,
      moduleTypeEnv: Immutable.Map<string, Type.ModuleType>,
      moduleValueEnv: Immutable.Map<string, Signal<{ [s: string]: Signal<any> }>>,
    ) {
      // TODO(jaked) this is a lot of setup
      const ast = Parse.parse(mdx);
      const typeEnv = Immutable.Map<string, Type>();
      const exportTypes: { [s: string]: Type } = {};
      const annots = new Map<unknown, Type>();
      Typecheck.synthMdx('mdx', ast, moduleTypeEnv, typeEnv, exportTypes, annots)
      const exportValue: { [s: string]: Signal<any> } = {};
      const valueEnv = Immutable.Map<string, Signal<any>>();

      const [ _, rendered ] = Render.renderMdx(
        ast,
        annots,
        '/mdx',
        moduleValueEnv,
        valueEnv,
        exportValue,
      );
      rendered.reconcile(1);

      expect(rendered.value.type).toBe('ok');
    }

    it('survives missing module', () => {
      expectOk(`
import Foo from 'foo'

<>{ Foo ? true : false }</>
`,
        Immutable.Map(),
        Immutable.Map(),
      );
    });

    it('survives missing default export', () => {
      expectOk(`
import Foo from 'foo'

<>{ Foo ? true : false }</>
`,
        Immutable.Map({ foo: Type.module({ }) }),
        Immutable.Map({ foo: Signal.ok({ }) }),
      );
    });

    it('survives missing named export', () => {
      expectOk(`
import { Foo } from 'foo'

<>{ Foo ? true : false }</>
`,
        Immutable.Map({ foo: Type.module({ }) }),
        Immutable.Map({ foo: Signal.ok({ }) }),
      );
    });
  });
});
