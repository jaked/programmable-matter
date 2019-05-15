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

function immutableMapLens<T>(key: string): Lens<Immutable.Map<string, T>, T> {
  return Lens.create(
    (map: Immutable.Map<string, T>) => map.get<any>(key, null),
    (t: T, map: Immutable.Map<string, T>) => map.set(key, t)
  )
}

function renderExpression(ast: AcornJsxAst.Expression, state: State) {
  const names = new Set<string>();
  const evaluatedAst =
    Evaluator.evaluateExpression(ast,
      {
        mode: 'compile',
        names,
        renderJsxElement: (ast) => renderFromJsx(ast, state)
      }
    );
  if (evaluatedAst.type === 'Literal') {
    return evaluatedAst.value;
  } else {
    // TODO(jaked) how do I map over a Set to get an array?
    const atoms: Array<ReadOnlyAtom<any>> = [];
    names.forEach(name => {
      // TODO(jaked) we can't check for the existence
      // of a name at compile time, unless we make compilation
      // a reaction to change of the doc state?
      atoms.push(state.lens(immutableMapLens(name)));
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

function renderAttributes(attributes: Array<AcornJsxAst.JSXAttribute>, state: State) {
  const attrObjs = attributes.map(({ name, value }) => {
    let attrValue;
    switch (value.type) {
      case 'JSXExpressionContainer':
        attrValue = renderExpression(value.expression, state);
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

function renderFromJsx(ast: AcornJsxAst.JSXElement, state: State): React.ReactNode {
  const attrs = renderAttributes(ast.openingElement.attributes, state);
  const elem = renderElement(ast.openingElement.name.name);
  const children = ast.children.map(child => {
    switch (child.type) {
      case 'JSXElement':
        return renderFromJsx(child, state);
      case 'JSXText':
        return child.value;
      case 'JSXExpressionContainer':
        return renderExpression(child.expression, state);
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

export function renderFromMdx(ast: MDXHAST.Node, state: State): React.ReactNode {
  switch (ast.type) {
    case 'root':
      return React.createElement(
        'div',
        {},
        ...ast.children.map(child => renderFromMdx(child, state))
      );

    case 'element':
      return React.createElement(
        ast.tagName,
        ast.properties,
        ...ast.children.map(child => renderFromMdx(child, state))
      );

    case 'text':
      // TODO(jaked) handle interpolation
      return ast.value;

    case 'jsx':
      if (ast.jsxElement) {
        return renderFromJsx(ast.jsxElement, state);
      } else {
        throw 'expected JSX node to be parsed';
      }
  }
}

export const initEnv: Typecheck.Env = Immutable.Map({
  'Tweet': Type.object({ tweetId: Type.string }),
  'YouTube': Type.object({ videoId: Type.string }),

  'VictoryBar': Type.object({}),
});
