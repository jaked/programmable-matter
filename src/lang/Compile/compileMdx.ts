import * as Immutable from 'immutable';
import Signal from '../../util/Signal';
import Try from '../../util/Try';
import Trace from '../../util/Trace';
import * as data from '../../data';
import * as MDXHAST from '../mdxhast';
import Type from '../Type';
import Typecheck from '../Typecheck';
import * as Evaluate from '../Evaluate';
import * as Render from '../Render';
import sortMdx from './sortMdx';

// TODO(jaked)
// is there a way to internalize Typescript types
// so we can generate these? like Scala implicits?
const metaType =
  Type.object({
    type: Type.singleton('mdx'),
    title: Type.undefinedOr(Type.string),
    tags: Type.undefinedOr(Type.array(Type.string)),
    layout: Type.string
  })

export default function compileMdx(
  trace: Trace,
  ast: MDXHAST.Root,
  capitalizedTag: string,
  meta: data.Meta,
  typeEnv: Typecheck.Env,
  valueEnv: Evaluate.Env,
  moduleTypeEnv: Immutable.Map<string, Type.ModuleType>,
  moduleValueEnv: Immutable.Map<string, Signal<{ [s: string]: Signal<any> }>>,
): data.Compiled {
  ast = trace.time('sortMdx', () => sortMdx(ast));

  const exportTypes: { [s: string]: Type.Type } = {};
  const astAnnotations = new Map<unknown, Try<Type>>();
  try {
    trace.time('synthMdx', () => Typecheck.synthMdx(ast, moduleTypeEnv, typeEnv, exportTypes, astAnnotations));
  } catch (e) {
    const exportType = Type.module({ });
    const exportValue = { };
    const rendered = Signal.ok(false);
    return { exportType, exportValue, rendered, astAnnotations, problems: true };
  }

  let layoutFunction: undefined | Signal<(props: { children: React.ReactNode, meta: data.Meta }) => React.ReactNode>;
  if (meta.layout) {
    const layoutType =
      Type.functionType(
        [ Type.object({
          children: Type.array(Type.reactNodeType),
          meta: metaType
        }) ],
        Type.reactNodeType);
    const layoutModule = moduleTypeEnv.get(meta.layout);
    if (layoutModule) {
      const defaultType = layoutModule.get('default');
      if (defaultType) {
        if (Type.isSubtype(defaultType, layoutType)) {
          const layoutModule = moduleValueEnv.get(meta.layout);
          if (layoutModule) {
            layoutFunction = layoutModule['default'];
          }
        }
      }
    }
  }

  const exportType = Type.module(exportTypes);
  const exportValue: { [s: string]: Signal<any> } = {};
  const rendered =
    trace.time('renderMdx', () => {
      const [_, node] =
        Render.renderMdx(ast, capitalizedTag, moduleValueEnv, valueEnv, exportValue);
      if (layoutFunction)
        return Signal.join(layoutFunction, node).map(([layoutFunction, node]) =>
          layoutFunction({ children: node, meta })
        );
      else return node;
    });
  return { exportType, exportValue, rendered, astAnnotations, problems: false };
}
