import * as Immutable from 'immutable';

import * as React from 'react';

import { remote } from 'electron';

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
import * as AcornJsxAst from './acornJsxAst';
import * as Evaluator from './evaluator';
import * as Type from './Type';
import * as Typecheck from './Typecheck';

export type Env = Evaluator.Env;

function extendEnvWithImport(
  decl: AcornJsxAst.ImportDeclaration,
  moduleEnv: Env,
  env: Env,
): Env {
  const module = moduleEnv.get(decl.source.value);
  if (!module)
    throw new Error(`expected module '${decl.source.value}'`);
  decl.specifiers.forEach(spec => {
    switch (spec.type) {
      case 'ImportNamespaceSpecifier':
        env = env.set(spec.local.name, module);
        break;
      case 'ImportDefaultSpecifier':
        const defaultField = module['default'];
        if (defaultField === undefined)
          throw new Error(`expected default export on '${decl.source.value}'`);
        env = env.set(spec.local.name, defaultField);
        break;
      case 'ImportSpecifier':
        const importedField = module[spec.imported.name];
        if (importedField === undefined)
          throw new Error(`expected exported member '${spec.imported.name}' on '${decl.source.value}'`);
        env = env.set(spec.local.name, importedField);
        break;
    }
  });
  return env;
}

function extendEnvWithNamedExport(
  decl: AcornJsxAst.ExportNamedDeclaration,
  module: string,
  env: Env,
  mkCell: (module: string, name: string, init: any) => Cell<any>,
  exportValue: { [s: string]: any }
): Env {
  const declaration = decl.declaration;
  switch (declaration.kind) {
    case 'const': {
      declaration.declarations.forEach(declarator => {
        let name = declarator.id.name;
        let value = Evaluator.evaluateExpression(declarator.init, env);
        exportValue[name] = value;
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
        const cell = mkCell(module, name, init);
        exportValue[name] = cell;
        env = env.set(name, cell);
      });
      break;
    }

    default: throw new Error('unexpected AST ' + declaration.kind);
  }
  return env;
}

function extendEnvWithDefaultExport(
  decl: AcornJsxAst.ExportDefaultDeclaration,
  env: Env,
  exportValue: { [s: string]: any }
): Env {
  exportValue['default'] =
    Evaluator.evaluateExpression(decl.declaration, env);
  return env;
}

export function renderMdx(
  ast: MDXHAST.Node,
  module: string,
  moduleEnv: Env,
  env: Env,
  mkCell: (module: string, name: string, init: any) => Cell<any>,
  exportValue: { [s: string]: any }
): [Env, React.ReactNode] {
  switch (ast.type) {
    case 'root': {
      const childNodes: Array<React.ReactNode> = [];
      ast.children.forEach(child => {
        const [env2, childNode] = renderMdx(child, module, moduleEnv, env, mkCell, exportValue);
        env = env2;
        childNodes.push(childNode);
      });
      const node = React.createElement('div', {}, ...childNodes);
      return [env, node];
    }

    case 'element': {
      const childNodes: Array<React.ReactNode> = [];
      ast.children.forEach(child => {
        const [env2, childNode] = renderMdx(child, module, moduleEnv, env, mkCell, exportValue);
        env = env2;
        childNodes.push(childNode);
      });
      let properties = ast.properties;
      let elem: any = ast.tagName;
      if (ast.tagName === 'a') {
        // TODO(jaked) fix hack somehow
        elem = env.get('Link')
        const to = properties['href'];
        properties = Object.assign({}, properties, { to });
      }
      const node = React.createElement(elem, properties, ...childNodes);
      return [env, node];
    }

    case 'text':
      return [env, ast.value];

    case 'jsx':
      if (!ast.jsxElement) throw new Error('expected JSX node to be parsed');
      switch (ast.jsxElement.type) {
        case 'ok':
          return [env, Evaluator.evaluateExpression(ast.jsxElement.ok, env)];
        case 'err':
          return [env, null];
        default:
          // not sure why TS can't see that ok / err is exhaustive
          throw new Error('unreachable');
      }

    case 'import':
    case 'export':
      if (!ast.declarations) throw new Error('expected import/export node to be parsed');
      ast.declarations.forEach(decls => decls.forEach(decl => {
        switch (decl.type) {
          case 'ImportDeclaration':
            env = extendEnvWithImport(decl, moduleEnv, env);
            break;

          case 'ExportNamedDeclaration':
            env = extendEnvWithNamedExport(decl, module, env, mkCell, exportValue);
            break;

          case 'ExportDefaultDeclaration':
            env = extendEnvWithDefaultExport(decl, env, exportValue);
            break;
        }
      }));
      return [env, null];

    default:
      throw new Error('unexpected AST ' + (ast as MDXHAST.Node).type);
  }
}

export function renderProgram(
  ast: AcornJsxAst.Node,
  module: string,
  moduleEnv: Env,
  env: Env,
  mkCell: (module: string, name: string, init: any) => Cell<any>,
  exportValue: { [s: string]: any }
): Env {
  switch (ast.type) {
    case 'Program':
      ast.body.forEach(child => {
        env = renderProgram(child, module, moduleEnv, env, mkCell, exportValue);
      });
      return env;

    case 'ImportDeclaration':
      return extendEnvWithImport(ast, moduleEnv, env);

    case 'ExportNamedDeclaration':
      return extendEnvWithNamedExport(ast, module, env, mkCell, exportValue);

    case 'ExportDefaultDeclaration':
      return extendEnvWithDefaultExport(ast, env, exportValue);

    default: throw new Error('unexpected AST ' + (ast as AcornJsxAst.Node).type);
  }
}

function Link(
  setSelected: (note: string) => void,
) {
  return function ({ to, children }: { to: string, children: React.ReactNodeArray }) {
    // TODO(jaked) validate URL
    if (to.startsWith('http://')) {
      const onClick = (e: React.MouseEvent) => {
        e.preventDefault();
        remote.shell.openExternal(to);
      }
      return React.createElement('a', { href: to, onClick }, children);
    } else {
      const onClick = (e: React.MouseEvent) => {
        e.preventDefault();
        setSelected(to);
      }
      // this href is used when note is rendered statically
      // TODO(jaked)
      // handle path components properly
      // handle mounting note tree somewhere other than / ?
      const href = `/${encodeURIComponent(to)}`;
      return React.createElement('a', { href: href, onClick }, children);
    }
  }
}

// TODO(jaked) move to Typecheck?
function componentType(props: { [f: string]: Type.Type }): Type.Type {
  return Type.abstract('React.Component', Type.object(props));
}

// TODO(jaked) full types for components
// TODO(jaked) types for HTML elements
export const initTypeEnv: Typecheck.Env = Immutable.Map({
  'Link': [componentType({ to: Type.string }), false],

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

export function initValueEnv(
  setSelected: (note: string) => void,
): Evaluator.Env {
  return Immutable.Map({
    Link: Link(setSelected),
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
}
