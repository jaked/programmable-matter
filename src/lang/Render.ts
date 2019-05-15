import * as Immutable from 'immutable';

import * as React from 'react';

import { TwitterTweetEmbed } from 'react-twitter-embed';
import YouTube from 'react-youtube';
import { VictoryBar } from 'victory';

import { Atom, F, Lens, ReadOnlyAtom } from '@grammarly/focal';
import * as Focal from '@grammarly/focal';

import * as MDXHAST from './mdxhast';
import * as AcornJsxAst from './acornJsxAst';
import * as Evaluator from './evaluator';
import * as Type from './Type';
import * as Typecheck from './Typecheck';

const STARTS_WITH_CAPITAL_LETTER = /^[A-Z]/

type State = Atom<Immutable.Map<string, any>>;
type Env = Immutable.Map<string, any>;

function immutableMapLens<T>(key: string): Lens<Immutable.Map<string, T>, T> {
  return Lens.create(
    (map: Immutable.Map<string, T>) => map.get<any>(key, null),
    (t: T, map: Immutable.Map<string, T>) => map.set(key, t)
  )
}

function renderExpression(ast: AcornJsxAst.Expression, env: Env, state: State) {
  const names = new Set<string>();
  const evaluatedAst =
    Evaluator.evaluateExpression(ast,
      {
        mode: 'compile',
        names,
        renderJsxElement: (ast) => renderJsx(ast, env, state)
      }
    );
  if (evaluatedAst.type === 'Literal') {
    return evaluatedAst.value;
  } else {
    // TODO(jaked) how do I map over a Set to get an array?
    const atoms: Array<ReadOnlyAtom<any>> = [];
    names.forEach(name => {
      if (env.has(name)) {
        atoms.push(env.get(name));
      } else {
        throw 'expected binding for ' + name;
      }
    });
    const combineFn = function (...values: Array<any>) {
      const env = new Map<string, any>();
      let i = 0;
      names.forEach(name => env.set(name, values[i++]));
      const evaluatedAst2 =
        Evaluator.evaluateExpression(evaluatedAst, { mode: 'run', env: env });
      if (evaluatedAst2.type === 'Literal') {
        return evaluatedAst2.value;
      } else {
        throw 'expected fully-evaluated expression';
      }
    }
    // TODO(jaked) it doesn't seem to be possible to call the N-arg version of combine,
    // even though all the K-arg versions are alternate signatures for it.
    const combine = Atom.combine as (...args: any) => ReadOnlyAtom<any>;
    return combine(...[...atoms, combineFn]);
  }
}

function renderAttributes(attributes: Array<AcornJsxAst.JSXAttribute>, env: Env, state: State) {
  const attrObjs = attributes.map(({ name, value }) => {
    let attrValue;
    switch (value.type) {
      case 'JSXExpressionContainer':
        attrValue = renderExpression(value.expression, env, state);
        break;
      case 'Literal':
        attrValue = value.value;
        break;
      default:
        throw 'unexpected AST ' + (value as any).type;
    }
    return { [name.name]: attrValue };
  });
  return Object.assign({}, ...attrObjs);
}

const components = new Map([
  [ 'Tweet', TwitterTweetEmbed ],
  [ 'YouTube', YouTube ],
  [ 'VictoryBar', VictoryBar ],
].map(([name, comp]) => [name, Focal.lift(comp)]));

function renderElement(name: string) {
  if (STARTS_WITH_CAPITAL_LETTER.test(name)) {
    const comp = components.get(name)
    if (comp) return comp;
    else throw 'unexpected element ' + name;
  } else {
    return F[name] || name;
  }
}

function renderJsx(ast: AcornJsxAst.JSXElement, env: Env, state: State): React.ReactNode {
  const attrs = renderAttributes(ast.openingElement.attributes, env, state);
  const elem = renderElement(ast.openingElement.name.name);
  const children = ast.children.map(child => {
    switch (child.type) {
      case 'JSXElement':
        return renderJsx(child, env, state);
      case 'JSXText':
        return child.value;
      case 'JSXExpressionContainer':
        return renderExpression(child.expression, env, state);
    }
  });

  // TODO(jaked) for what elements does this make sense? only input?
  if (attrs.id) {
    const atom = state.lens(immutableMapLens(attrs.id))
    // TODO(jaked) atom is unset before 1st change
    attrs.onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      atom.set(e.currentTarget.value);
    }
  }

  return React.createElement(elem, attrs, ...children);
}

function evaluateMdxAtomBindings(ast: MDXHAST.Node, env: Env, state: State): Env {
  switch (ast.type) {
    case 'root':
    case 'element':
      ast.children.forEach(child =>
        env = evaluateMdxAtomBindings(child, env, state)
      );
      return env;

    case 'text':
    case 'jsx':
      return env;

    case 'import':
      // TODO(jaked)
      return env;

    case 'export':
      if (ast.exportNamedDeclaration) {
        const declaration = ast.exportNamedDeclaration.declaration;
        const declarator = declaration.declarations[0]; // TODO(jaked) handle multiple
        if (declaration.kind === 'let') {
          const evaluatedAst =
            Evaluator.evaluateExpression(declarator.init,
              {
                mode: 'compile',
                names: new Set<string>(),
                // TODO(jaked) check this statically
                renderJsxElement: (ast) => { throw 'JSX element may not appear in atom declaration' }
              }
            );
          if (evaluatedAst.type === 'Literal') {
            const name = declarator.id.name;
            const value = state.lens(immutableMapLens(name));
            if (value.get() === null) {
              value.set(evaluatedAst.value);
            }
            return env.set(name, value);
          } else {
            // TODO(jaked) check this statically
            throw 'atom initializer must be static';
          }
        } else {
          return env;
        }
      } else {
        throw 'expected export node to be parsed';
      }

    default: throw 'unexpected AST ' + (ast as MDXHAST.Node).type;
  }
}

function evaluateMdxBindings(ast: MDXHAST.Node, env: Env, state: State): Env {
  switch (ast.type) {
    case 'root':
    case 'element':
      ast.children.forEach(child =>
        env = evaluateMdxBindings(child, env, state)
      );
      return env;

    case 'text':
    case 'jsx':
      return env;

    case 'import':
      // TODO(jaked)
      return env;

    case 'export':
      if (ast.exportNamedDeclaration) {
        const declaration = ast.exportNamedDeclaration.declaration;
        const declarator = declaration.declarations[0]; // TODO(jaked) handle multiple
        if (declaration.kind === 'const') {
          let value = renderExpression(declarator.init, env, state);
          return env.set(declarator.id.name, value);
        } else {
          return env;
        }
      } else {
        throw 'expected export node to be parsed';
      }

    default: throw 'unexpected AST ' + (ast as MDXHAST.Node).type;
  }
}

function renderMdxElements(ast: MDXHAST.Node, env: Env, state: State): React.ReactNode {
  switch (ast.type) {
    case 'root':
      return React.createElement(
        'div',
        {},
        ...ast.children.map(child => renderMdxElements(child, env, state))
      );

    case 'element':
      return React.createElement(
        ast.tagName,
        ast.properties,
        ...ast.children.map(child => renderMdxElements(child, env, state))
      );

    case 'text':
      // TODO(jaked) handle interpolation
      return ast.value;

    case 'jsx':
      if (ast.jsxElement) {
        return renderJsx(ast.jsxElement, env, state);
      } else {
        throw 'expected JSX node to be parsed';
      }

    case 'import':
    case 'export':
      return undefined;

    default: throw 'unexpected AST ' + (ast as MDXHAST.Node).type;
  }
}

export function renderMdx(ast: MDXHAST.Node, env: Env, state: State): React.ReactNode {
  // TODO(jaked)
  // we need to pass state to evaluateMdxAtomBindings
  // but once controls explicitly bind to atoms instead of using id
  // we won't need to pass it to evaluateMdxBindings or renderMdxElements
  const env2 = evaluateMdxAtomBindings(ast, env, state);
  const env3 = evaluateMdxBindings(ast, env2, state);
  return renderMdxElements(ast, env3, state);
}

export const initEnv: Typecheck.Env = Immutable.Map({
  'Tweet': Type.object({ tweetId: Type.string }),
  'YouTube': Type.object({ videoId: Type.string }),

  'VictoryBar': Type.object({}),
});
