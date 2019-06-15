import * as Immutable from 'immutable';

import * as React from 'react';

import 'regenerator-runtime/runtime'; // required for react-inspector
import { Inspector } from 'react-inspector';

import { TwitterTweetEmbed } from 'react-twitter-embed';
import YouTube from 'react-youtube';
import { VictoryBar, VictoryChart } from 'victory';
import ReactTable from 'react-table';
import Gist from 'react-gist';

import { InlineMath, BlockMath } from 'react-katex';

import { Cell } from '../util/Cell';

import * as MDXHAST from './mdxhast';
import * as Evaluator from './evaluator';
import * as Type from './Type';
import * as Typecheck from './Typecheck';

export type Env = Evaluator.Env;

function evaluateMdxBindings(
  ast: MDXHAST.Node,
  module: string,
  env: Env,
  mkCell: (module: string, name: string, init: any) => Cell<any>,
  exportValues: { [s: string]: any }
): Env {
  switch (ast.type) {
    case 'root':
    case 'element':
      ast.children.forEach(child =>
        env = evaluateMdxBindings(child, module, env, mkCell, exportValues)
      );
      return env;

    case 'text':
    case 'jsx':
      return env;

    case 'import':
    case 'export':
      if (!ast.declarations) throw new Error('expected import/export node to be parsed');
      ast.declarations.forEach(decls => decls.forEach(decl => {
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
                  let value = Evaluator.evaluateExpression(declarator.init, env);
                  exportValues[name] = value;
                  env = env.set(name, value);
                });
              }
              break;

              case 'let': {
                declaration.declarations.forEach(declarator => {
                  const init =
                    Evaluator.evaluateExpression(declarator.init, env);
                  // TODO(jaked) check this statically
                  // if (evaluatedAst.type !== 'Literal') {
                  //   throw new Error('atom initializer must be static');
                  // }
                  const name = declarator.id.name;
                  const letAtom = mkCell(module, name, init);
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
        ast.tagName,
        ast.properties,
        ...ast.children.map(child => renderMdxElements(child, module, env))
      );

    case 'text':
      return ast.value;

    case 'jsx':
      if (!ast.jsxElement) throw new Error('expected JSX node to be parsed');
      switch (ast.jsxElement.type) {
        case 'ok':
          return Evaluator.evaluateExpression(ast.jsxElement.ok, env);
        case 'err':
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
  mkCell: (module: string, name: string, init: any) => Cell<any>,
  exportValues: { [s: string]: any }
): React.ReactNode {
  const env2 = evaluateMdxBindings(ast, module, env, mkCell, exportValues);
  return renderMdxElements(ast, module, env2);
}

// TODO(jaked) move to Typecheck?
function componentType(props: { [f: string]: Type.Type }): Type.Type {
  return Type.abstract('React.Component', Type.object(props));
}

// TODO(jaked) full types for components
// TODO(jaked) types for HTML elements
export const initTypeEnv: Typecheck.Env = Immutable.Map({
  'Tweet': [componentType({ tweetId: Type.string }), false],
  'YouTube': [componentType({ videoId: Type.string }), false],
  'Gist': [componentType({ id: Type.string }), false],

  'VictoryBar': [componentType({}), false],
  'VictoryChart': [componentType({}), false],

  'Inspector': [componentType({}), false],

  'Table': [componentType({
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

export const initValueEnv: Evaluator.Env = Immutable.Map({
  Inspector: Inspector,
  Tweet: TwitterTweetEmbed,
  YouTube: YouTube,
  VictoryBar: VictoryBar,
  VictoryChart: VictoryChart,
  InlineMath: InlineMath,
  BlockMath: BlockMath,
  Table: ReactTable,
  Gist: Gist,
});
