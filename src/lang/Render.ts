import * as Immutable from 'immutable';

import * as React from 'react';

import 'regenerator-runtime/runtime'; // required for react-inspector
import { Inspector } from 'react-inspector';

import { TwitterTweetEmbed } from 'react-twitter-embed';
import YouTube from 'react-youtube';
import { VictoryBar } from 'victory';
import ReactTable from 'react-table';
import Gist from 'react-gist';

import { InlineMath, BlockMath } from 'react-katex';

import { Atom, F, Lens, ReadOnlyAtom } from '@grammarly/focal';
import * as Focal from '@grammarly/focal';

import * as Try from '../util/Try';

import * as MDXHAST from './mdxhast';
import * as AcornJsxAst from './acornJsxAst';
import * as Evaluator from './evaluator';
import * as Type from './Type';
import * as Typecheck from './Typecheck';

const STARTS_WITH_CAPITAL_LETTER = /^[A-Z]/

type State = Atom<Immutable.Map<string, Immutable.Map<string, any>>>;
export type Env = Immutable.Map<string, any>;

function immutableMapLens<T>(key: string): Lens<Immutable.Map<string, T>, T> {
  return Lens.create(
    (map: Immutable.Map<string, T>) => map.get<any>(key, null),
    (t: T, map: Immutable.Map<string, T>) => map.set(key, t)
  )
}

function renderExpression(ast: AcornJsxAst.Expression, module: string, env: Env) {
  const opts: Evaluator.Opts = {
    module,
    mode: 'compile',
    atomNames: Immutable.Set(),
    renderJsxElement: (ast) => renderJsx(ast, module, env)
  }
  const evaluatedAst =
    Evaluator.evaluateExpression(ast, opts);
  if (evaluatedAst.type === 'Literal') {
    return evaluatedAst.value;
  } else {
    // TODO(jaked) how do I map over a Set to get an array?
    const atoms: Array<ReadOnlyAtom<any>> = [];
    opts.atomNames.forEach(atomName => {
      const module = atomName.get('module');
      const name = atomName.get('name');
      if (module === null) {
        if (env.has(name)) {
          atoms.push(env.get(name));
        } else {
          throw new Error(`expected binding for ${name}`);
        }
      } else {
        if (env.has(module) && name in env.get(module)) {
          atoms.push(env.get(module)[name])
        } else {
          throw new Error(`expected binding for ${module}.${name}`);
        }
      }
    });
    const combineFn = function (...values: Array<any>) {
      const env = new Map<string, any>();
      let i = 0;
      opts.atomNames.forEach(atomName => {
        const module = atomName.get('module');
        const name = atomName.get('name');
          if (module === null) {
          env.set(name, values[i++]);
        } else {
          let moduleObj = env.get(module);
          moduleObj = Object.assign({}, moduleObj, { [name]: values[i++] });
          env.set(module, moduleObj);
        }
      });
      const evaluatedAst2 =
        Evaluator.evaluateExpression(evaluatedAst, { mode: 'run', env: env });
      if (evaluatedAst2.type === 'Literal') {
        return evaluatedAst2.value;
      } else {
        throw new Error('expected fully-evaluated expression');
      }
    }
    // TODO(jaked) it doesn't seem to be possible to call the N-arg version of combine,
    // even though all the K-arg versions are alternate signatures for it.
    const combine = Atom.combine as (...args: any) => ReadOnlyAtom<any>;
    return combine(...[...atoms, combineFn]);
  }
}

function renderAttributes(attributes: Array<AcornJsxAst.JSXAttribute>, module: string, env: Env) {
  const attrObjs = attributes.map(({ name, value }) => {
    let attrValue;
    switch (value.type) {
      case 'JSXExpressionContainer':
        attrValue = renderExpression(value.expression, module, env);
        break;
      case 'Literal':
        attrValue = value.value;
        break;
      default:
        throw new Error('unexpected AST ' + (value as any).type);
    }
    return { [name.name]: attrValue };
  });
  return Object.assign({}, ...attrObjs);
}

const components = new Map([
  [ 'Inspector', Inspector ],
  [ 'Tweet', TwitterTweetEmbed ],
  [ 'YouTube', YouTube ],
  [ 'VictoryBar', VictoryBar ],
  [ 'InlineMath', InlineMath ],
  [ 'BlockMath', BlockMath ],
  [ 'Table', ReactTable ],
  [ 'Gist', Gist ]
].map(([name, comp]) => [name, Focal.lift(comp)]));

function renderElement(name: string) {
  if (STARTS_WITH_CAPITAL_LETTER.test(name)) {
    const comp = components.get(name)
    if (comp) return comp;
    else throw new Error('unexpected element ' + name);
  } else {
    return F[name] || name;
  }
}

class Fragment extends React.Component {
  render() { return this.props.children; }
}
const LiftedFragment = Focal.lift(Fragment);

function renderJsx(
  ast: AcornJsxAst.JSXElement | AcornJsxAst.JSXFragment,
  module: string,
  env: Env
): React.ReactNode {
  const children = ast.children.map(child => {
    switch (child.type) {
      case 'JSXElement':
        return renderJsx(child, module, env);
      case 'JSXText':
        return child.value;
      case 'JSXExpressionContainer':
        return renderExpression(child.expression, module, env);
    }
  });

  if (ast.type === 'JSXFragment') {
    return React.createElement(LiftedFragment, null, children);
  } else {
    const attrs = renderAttributes(ast.openingElement.attributes, module, env);
    const elem = renderElement(ast.openingElement.name.name);

    // TODO(jaked) for what elements does this make sense? only input?
    if (ast.openingElement.name.name === 'input' && attrs.id) {
      if (env.has(attrs.id)) {
        const atom = env.get(attrs.id) as Atom<any>;
        attrs.onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
          atom.set(e.currentTarget.value);
        }
      } else {
        // TODO(jaked) check statically
        // also check that it is a non-readonly Atom
        throw new Error('unbound identifier ' + attrs.id);
      }
    }

    return React.createElement(elem, attrs, ...children);
  }
}

function evaluateMdxBindings(
  ast: MDXHAST.Node,
  module: string,
  env: Env,
  state: State,
  exportValues: { [s: string]: any }
): Env {
  switch (ast.type) {
    case 'root':
    case 'element':
      ast.children.forEach(child =>
        env = evaluateMdxBindings(child, module, env, state, exportValues)
      );
      return env;

    case 'text':
    case 'jsx':
      return env;

    case 'import':
    case 'export':
      if (!ast.declarations) throw new Error('expected import/export node to be parsed');
      Try.forEach(ast.declarations, decls => decls.forEach(decl => {
        switch (decl.type) {
          case 'ImportDeclaration': {
            // TODO(jaked)
          }
          break;

          case 'ExportNamedDeclaration': {
            const declaration = decl.declaration;
            switch (declaration.kind) {
              case 'const': {
                declaration.declarations.forEach(declarator => {
                  let name = declarator.id.name;
                  let value = renderExpression(declarator.init, module, env);
                  exportValues[name] = value;
                  env = env.set(name, value);
                });
              }
              break;

              case 'let': {
                declaration.declarations.forEach(declarator => {
                  const evaluatedAst =
                    Evaluator.evaluateExpression(declarator.init,
                      {
                        module,
                        mode: 'compile',
                        atomNames: Immutable.Set(),
                        // TODO(jaked) check this statically
                        renderJsxElement: (ast) => { throw new Error('JSX element may not appear in atom declaration'); }
                      }
                    );
                  if (!(evaluatedAst.type === 'Literal')) {
                    // TODO(jaked) check this statically
                    throw new Error('atom initializer must be static');
                  }
                  const name = declarator.id.name;
                  // TODO(jaked)
                  // this is a little fishy somehow, we shouldn't manipulate this state here
                  // maybe after typechecking we ensure that the necessary state exists?
                  const noteLetsAtom = state.lens(immutableMapLens<Immutable.Map<string, any>>(module));
                  if (noteLetsAtom.get() === null) {
                    noteLetsAtom.set(Immutable.Map());
                  }
                  const letAtom = noteLetsAtom.lens(immutableMapLens(name));
                  if (letAtom.get() === null) {
                    letAtom.set(evaluatedAst.value);
                  }
                  exportValues[name] = letAtom;
                  env = env.set(name, letAtom);
                });
                break;
              }

              default: throw new Error('unexpected AST ' + declaration.kind);
            }
          }
          break;
        }
      }));
      return env;

    default: throw new Error('unexpected AST ' + (ast as MDXHAST.Node).type);
  }
}

function renderMdxElements(ast: MDXHAST.Node, module: string, env: Env): React.ReactNode {
  switch (ast.type) {
    case 'root':
      return React.createElement(
        'div',
        {},
        ...ast.children.map(child => renderMdxElements(child, module, env))
      );

    case 'element':
      return React.createElement(
        F[ast.tagName] || ast.tagName,
        ast.properties,
        ...ast.children.map(child => renderMdxElements(child, module, env))
      );

    case 'text':
      return ast.value;

    case 'jsx':
      if (!ast.jsxElement) throw new Error('expected JSX node to be parsed');
      switch (ast.jsxElement.type) {
        case 'success':
          return renderJsx(ast.jsxElement.success, module, env);
        case 'failure':
          return null;
      }
      break;

    case 'import':
    case 'export':
      return undefined;

    default: throw new Error('unexpected AST ' + (ast as MDXHAST.Node).type);
  }
}

export function renderMdx(
  ast: MDXHAST.Node,
  module: string,
  env: Env,
  state: State,
  exportValues: { [s: string]: any }
): React.ReactNode {
  const env2 = evaluateMdxBindings(ast, module, env, state, exportValues);
  return renderMdxElements(ast, module, env2);
}

// TODO(jaked) full types for components
// TODO(jaked) types for HTML elements
export const initEnv: Typecheck.Env = Immutable.Map({
  'Tweet': [Type.object({ tweetId: Type.string }), false],
  'YouTube': [Type.object({ videoId: Type.string }), false],
  'Gist': [Type.object({ id: Type.string }), false],

  'VictoryBar': [Type.object({}), false],
  'Inspector': [Type.object({}), false],

  'Table': [Type.object({
    data: Type.array(Type.object({})),
    // TODO(jaked)
    // column accessor types depend on data type (for Victory too)
    // can we express this with a type parameter?
    columns: Type.array(Type.object({
      Header: Type.string,
      accessor: Type.string,
    })),
    pageSize: Type.number,
  }), false],
});
