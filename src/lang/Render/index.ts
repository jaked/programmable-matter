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

import { bug } from '../../util/bug';
import Signal from '../../util/Signal';

import * as MDXHAST from '../mdxhast';
import * as ESTree from '../ESTree';
import * as Evaluator from '../evaluator';
import Type from '../Type';
import Typecheck from '../Typecheck';
import * as Compile from '../Compile';

import HighlightedCode from '../HighlightedCode';

const smartypants =
  Retext().use(RetextSmartypants, { dashes: 'oldschool' })

export type Env = Immutable.Map<string, Signal<any>>;

function evaluateExpressionSignal(
  ast: ESTree.Expression,
  env: Env
): Signal<any> {
  const idents = ESTree.freeIdentifiers(ast);
  const signals = idents.map(id => {
    const signal = env.get(id);
    if (signal) return signal;
    else throw new Error(`unbound identifier ${id}`);
  });
  return Signal.join(...signals).map(values => {
    const env = Immutable.Map(idents.map((id, i) => [id, values[i]]));
    return Evaluator.evaluateExpression(ast, env);
  });
}

function extendEnvWithImport(
  decl: ESTree.ImportDeclaration,
  moduleEnv: Compile.ModuleValueEnv,
  env: Env,
): Env {
  const module = moduleEnv.get(decl.source.value);
  if (!module)
    throw new Error(`expected module '${decl.source.value}'`);
  decl.specifiers.forEach(spec => {
    switch (spec.type) {
      case 'ImportNamespaceSpecifier': {
        env = env.set(spec.local.name, Signal.joinObject(module));
        break;
      }
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
  exportValue: { [s: string]: Signal<any> }
): Env {
  const declaration = decl.declaration;
  switch (declaration.kind) {
    case 'const': {
      declaration.declarations.forEach(declarator => {
        let name = declarator.id.name;
        let value = evaluateExpressionSignal(declarator.init, env);
        exportValue[name] = value;
        env = env.set(name, value);
      });
    }
    break;

    default: throw new Error('unexpected AST ' + declaration.kind);
  }
  return env;
}

function extendEnvWithDefaultExport(
  decl: ESTree.ExportDefaultDeclaration,
  env: Env,
  exportValue: { [s: string]: Signal<any> }
): Env {
  const value = evaluateExpressionSignal(decl.declaration, env);
  exportValue['default'] = value;
  return env;
}

export function renderMdx(
  ast: MDXHAST.Node,
  module: string,
  moduleEnv: Compile.ModuleValueEnv,
  env: Env,
  exportValue: { [s: string]: Signal<any> }
): [Env, Signal<React.ReactNode>] {
  // TODO(jaked)
  // definitions can only appear at the top level (I think?)
  // so we shouldn't need to pass `env` through all of this
  switch (ast.type) {
    case 'root': {
      const childNodes: Array<Signal<React.ReactNode>> = [];
      ast.children.forEach(child => {
        const [env2, childNode] = renderMdx(child, module, moduleEnv, env, exportValue);
        env = env2;
        childNodes.push(childNode);
      });
      return [env, Signal.join(...childNodes)];
    }

    case 'element': {
      switch (ast.tagName) {
        case 'code': {
          const childNodes =
            ast.children.map(child => {
              if (child.type === 'text')
                return child.value;
              else
                bug('expected text node');
            });
          const code = env.get('code') || bug(`expected 'code'`);
          const node = code.map(code =>
            React.createElement(code, ast.properties, ...childNodes)
          );
          return [env, node];
        }

        case 'inlineCode': {
          const childNodes =
            ast.children.map(child => {
              if (child.type === 'text')
                return child.value;
              else
                bug('expected text node');
            });
          const inlineCode = env.get('inlineCode') || bug(`expected 'inlineCode'`);
          const node = inlineCode.map(inlineCode =>
            React.createElement(inlineCode, ast.properties, ...childNodes)
          );
          return [env, node];
        }

        case 'a': {
          const childNodes: Array<Signal<React.ReactNode>> = [];
          ast.children.forEach(child => {
            const [env2, childNode] = renderMdx(child, module, moduleEnv, env, exportValue);
            env = env2;
            childNodes.push(childNode);
          });
          // TODO(jaked)
          // passing via env is a hack to get Link bound to setSelected
          // fix it somehow
          const Link = env.get('Link') || bug(`expected 'Link'`);
          const to = ast.properties['href'];
          const properties = { ...ast.properties, to };
          const node = Signal.join(Link, Signal.join(...childNodes)).map(([ Link, childNodes ]) =>
            React.createElement(Link, properties, ...childNodes)
          );
          return [env, node];
        }

        default: {
          const childNodes: Array<Signal<React.ReactNode>> = [];
          ast.children.forEach(child => {
            const [env2, childNode] = renderMdx(child, module, moduleEnv, env, exportValue);
            env = env2;
            childNodes.push(childNode);
          });
          const node = Signal.join(...childNodes).map(childNodes =>
            React.createElement(ast.tagName, ast.properties, ...childNodes)
          );
          return [env, node];
        }
      }
    }

    case 'text': {
      // TODO(jaked) this is pretty slow :(
      // TODO(jaked) and doesn't work when quotes are split across text nodes
      // const value = smartypants.processSync(ast.value).toString();
      return [env, Signal.ok(ast.value)];
    }

    case 'jsx':
      if (!ast.jsxElement) throw new Error('expected JSX node to be parsed');
      switch (ast.jsxElement.type) {
        case 'ok': {
          const jsx = ast.jsxElement.ok;
          return [env, evaluateExpressionSignal(jsx, env)];
        }
        case 'err':
          return [env, Signal.ok(null)];
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
            env = extendEnvWithNamedExport(decl, module, env, exportValue);
            break;

          case 'ExportDefaultDeclaration':
            env = extendEnvWithDefaultExport(decl, env, exportValue);
            break;
        }
      }));
      return [env, Signal.ok(null)];

    default:
      throw new Error('unexpected AST ' + (ast as MDXHAST.Node).type);
  }
}

export function renderProgram(
  ast: ESTree.Node,
  module: string,
  moduleEnv: Compile.ModuleValueEnv,
  env: Env,
  exportValue: { [s: string]: Signal<any> }
): Env {
  switch (ast.type) {
    case 'Program':
      ast.body.forEach(child => {
        env = renderProgram(child, module, moduleEnv, env, exportValue);
      });
      return env;

    case 'ImportDeclaration':
      return extendEnvWithImport(ast, moduleEnv, env);

    case 'ExportNamedDeclaration':
      return extendEnvWithNamedExport(ast, module, env, exportValue);

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

// TODO(jaked) need a way to translate TypeScript types
const styleType = Type.undefinedOr(Type.object({
  backgroundColor: Type.undefinedOrString,
  float: Type.undefinedOr(Type.enumerate('left', 'right', 'inherit', 'none')),
  fontSize: Type.undefinedOrString,
  height: Type.undefinedOrString,
  margin: Type.undefinedOrString,
  marginBottom: Type.undefinedOrString,
  marginLeft: Type.undefinedOrString,
  marginRight: Type.undefinedOrString,
  marginTop: Type.undefinedOrString,
  padding: Type.undefinedOrString,
}));

// TODO(jaked) full types for components
// TODO(jaked) types for HTML elements
export const initTypeEnv = Typecheck.env({
  // TODO(jaked)
  // fill out all of HTML, figure out a scheme for common attributes

  'body': componentType({}),

  'code': componentType({
    // TODO(jaked) handle className prop
  }),

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

  'inlineCode': componentType({}),

  'input': componentType({
    type: Type.singleton('range'),
    id: Type.undefinedOrString,
    min: Type.string,
    max: Type.string,
    value: Type.unknown,
    onChange: Type.undefinedOr(Type.functionType(
      [Type.object({
        currentTarget: Type.object({ value: Type.string })
      })],
      Type.undefined // TODO(jaked) Type.void?
    )),
    bind: Type.undefinedOr(Type.intersection(
      Type.functionType([], Type.string),
      Type.functionType([Type.string], Type.undefined)
    ))
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

  'HighlightedCode': componentType({
    // TODO(jaked) need a way to translate TypeScript types
    // theme: PrismTheme

    // TODO(jaked) enumerate supported languages
    language: Type.undefinedOr(Type.singleton('typescript')),

    style: styleType,
    inline: Type.undefinedOr(Type.boolean),
  }),

  'parseInt':
    Type.functionType([ Type.string ], Type.number),
});

export function initValueEnv(
  setSelected: (note: string) => void,
): Env {
  return Immutable.Map({
    body: 'body',
    code: 'pre',
    div: 'div',
    ellipse: 'ellipse',
    head: 'head',
    html: 'html',
    img: 'img',
    inlineCode: 'code',
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
    HighlightedCode: HighlightedCode,

    parseInt: (s: string) => parseInt(s)
  }).map(Signal.ok);
}
