import * as Immutable from 'immutable';
import * as React from 'react';
import * as Url from 'url';
import Retext from 'retext';
import RetextSmartypants from 'retext-smartypants';

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
import * as ESTree from './ESTree';
import * as Evaluator from './evaluator';
import Type from './Type';
import Typecheck from './Typecheck';

export type Env = Evaluator.Env;

const smartypants =
  Retext().use(RetextSmartypants, { dashes: 'oldschool' })

function extendEnvWithImport(
  decl: ESTree.ImportDeclaration,
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
  decl: ESTree.ExportNamedDeclaration,
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
  decl: ESTree.ExportDefaultDeclaration,
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
      return [env, childNodes];
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

    case 'text': {
      // TODO(jaked) this is pretty slow :(
      // TODO(jaked) and doesn't work when quotes are split across text nodes
      const value = smartypants.processSync(ast.value).toString();
      return [env, value];
    }

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
  ast: ESTree.Node,
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

    default: throw new Error('unexpected AST ' + (ast as ESTree.Node).type);
  }
}

function Link(
  setSelected: (note: string) => void,
) {
  return function ({ to, children }: { to: string, children: React.ReactNodeArray }) {
    // TODO(jaked) validate URL
    const url = Url.parse(to);
    if (url.protocol && url.slashes && url.hostname) {
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
function componentType(props: { [f: string]: Type }): Type {
  return Type.abstract('React.Component', Type.object(props));
}

const styleType = Type.undefinedOr(Type.object({
  backgroundColor: Type.undefinedOrString,
  float: Type.undefinedOr(Type.enumerate('left', 'right', 'inherit', 'none')),
  fontSize: Type.undefinedOrString,
  height: Type.undefinedOrString,
  marginTop: Type.undefinedOrString,
  padding: Type.undefinedOrString,
}));

// TODO(jaked) full types for components
// TODO(jaked) types for HTML elements
export const initTypeEnv: Typecheck.Env = Immutable.Map({
  // TODO(jaked)
  // fill out all of HTML, figure out a scheme for common attributes

  'body': componentType({}),

  'div': componentType({
    className: Type.undefinedOrString,
    style: styleType
  }),

  'ellipse': componentType({
    fill: Type.undefinedOrString,
    stroke: Type.undefinedOrString,
    cx: Type.numberOrString,
    cy: Type.numberOrString,
    rx: Type.numberOrString,
    ry: Type.numberOrString,
  }),

  'head': componentType({}),

  'html': componentType({}),

  'img': componentType({
    src: Type.string,
    width: Type.undefinedOrNumber,
    height: Type.undefinedOrNumber,
    style: styleType,
  }),

  'input': componentType({
    type: Type.singleton('range'),
    id: Type.undefinedOrString,
    min: Type.numberOrString,
    max: Type.numberOrString,
    value: Type.unknown,
  }),

  'style': componentType({
    dangerouslySetInnerHTML: Type.undefinedOr(Type.object({ __html: Type.string })),
  }),

  'svg': componentType({
    width: Type.numberOrString,
    height: Type.numberOrString,
  }),

  'title': componentType({}),

  'Link': componentType({ to: Type.string }),

  'Tweet': componentType({ tweetId: Type.string }),
  'YouTube': componentType({ videoId: Type.string }),
  'Gist': componentType({ id: Type.string }),

  // TODO(jaked) tighten this up. need a type parameter for data
  'VictoryBar': componentType({
    data: Type.unknown,
    x: Type.string,
    y: Type.string,
  }),
  'VictoryChart': componentType({
    domainPadding: Type.undefinedOrNumber,
  }),

  'Inspector': componentType({ data: Type.unknown }),

  'Table': componentType({
    data: Type.array(Type.object({})),
    // TODO(jaked)
    // column accessor types depend on data type (for Victory too)
    // can we express this with a type parameter?
    columns: Type.array(Type.object({
      Header: Type.string,
      accessor: Type.string,
    })),
    pageSize: Type.number,
  }),

  'parseInt':
    Type.functionType([ Type.string ], Type.number),
});

export function initValueEnv(
  setSelected: (note: string) => void,
): Evaluator.Env {
  return Immutable.Map({
    body: 'body',
    div: 'div',
    ellipse: 'ellipse',
    head: 'head',
    html: 'html',
    img: 'img',
    input: 'input',
    style: 'style',
    svg: 'svg',
    title: 'title',

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

    parseInt: (s: string) => parseInt(s)
  });
}
