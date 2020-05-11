import * as Immutable from 'immutable';
import * as React from 'react';
import Retext from 'retext';
import RetextSmartypants from 'retext-smartypants';

import { bug } from '../../util/bug';
import Signal from '../../util/Signal';

import * as MDXHAST from '../mdxhast';
import * as ESTree from '../ESTree';
import * as Evaluate from '../Evaluate';

export { initTypeEnv } from './initTypeEnv';
export { initValueEnv } from './initValueEnv';

const smartypants =
  Retext().use(RetextSmartypants, { dashes: 'oldschool' })

export type Env = Immutable.Map<string, Signal<any>>;

export const context = React.createContext<'screen' | 'server'>('screen');

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
    return Evaluate.evaluateExpression(ast, env);
  });
}

function extendEnvWithImport(
  decl: ESTree.ImportDeclaration,
  moduleEnv: Immutable.Map<string, Signal<{ [s: string]: Signal<any> }>>,
  env: Env,
): Env {
  // TODO(jaked) handle partial failures better here
  const module = moduleEnv.get(decl.source.value) ?? bug(`expected module '${decl.source.value}'`);
  decl.specifiers.forEach(spec => {
    switch (spec.type) {
      case 'ImportNamespaceSpecifier': {
        env = env.set(spec.local.name, module.flatMap(module => Signal.joinObject(module)));
        break;
      }
      case 'ImportDefaultSpecifier':
        // TODO(jaked) missing memeber vs. undefined value
        const defaultField = module.flatMap(module =>
          module['default'] ?? bug(`expected default export on '${decl.source.value}'`)
        );
        env = env.set(spec.local.name, defaultField);
        break;
      case 'ImportSpecifier':
        // TODO(jaked) missing memeber vs. undefined value
        const importedField = module.flatMap(module =>
          module[spec.imported.name] ?? bug(`expected exported member '${spec.imported.name}' on '${decl.source.value}'`)
        );
        env = env.set(spec.local.name, importedField);
        break;
    }
  });
  return env;
}

function extendEnvWithNamedExport(
  decl: ESTree.ExportNamedDeclaration,
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
  moduleEnv: Immutable.Map<string, Signal<{ [s: string]: Signal<any> }>>,
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
        const [env2, childNode] = renderMdx(child, moduleEnv, env, exportValue);
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
            const [env2, childNode] = renderMdx(child, moduleEnv, env, exportValue);
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
            const [env2, childNode] = renderMdx(child, moduleEnv, env, exportValue);
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
      const value = smartypants.processSync(ast.value).toString();
      return [env, Signal.ok(value)];
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
            env = extendEnvWithNamedExport(decl, env, exportValue);
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
