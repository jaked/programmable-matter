import * as Immutable from 'immutable';
import * as React from 'react';
import Retext from 'retext';
import RetextSmartypants from 'retext-smartypants';

import { bug } from '../../util/bug';
import Signal from '../../util/Signal';

import * as MDXHAST from '../mdxhast';
import * as ESTree from '../ESTree';
import * as Evaluate from '../Evaluate';
import { AstAnnotations } from '../../data';

export { initTypeEnv } from './initTypeEnv';
export { initValueEnv } from './initValueEnv';

const smartypants =
  Retext().use(RetextSmartypants, { dashes: 'oldschool' })

export type Env = Immutable.Map<string, Signal<any>>;

export const context = React.createContext<'screen' | 'server'>('screen');

function evaluateExpressionSignal(
  ast: ESTree.Expression,
  annots: AstAnnotations,
  env: Env
): Signal<any> {
  const idents = ESTree.freeIdentifiers(ast);
  const signals = idents.map(id => {
    const signal = env.get(id);
    if (signal) return signal;
    else return Signal.ok(Error(`unbound identifier ${id}`));
  });
  return Signal.join(...signals).map(values => {
    const env = Immutable.Map(idents.map((id, i) => [id, values[i]]));
    return Evaluate.evaluateExpression(ast, annots, env);
  });
}

function extendEnvWithImport(
  decl: ESTree.ImportDeclaration,
  annots: AstAnnotations,
  moduleEnv: Immutable.Map<string, Signal<{ [s: string]: Signal<any> }>>,
  env: Env,
): Env {
  // TODO(jaked) finding errors in the AST is delicate.
  // need to separate error semantics from error highlighting.
  const type = annots.get(decl.source);
  if (type && type.kind === 'Error') {
    decl.specifiers.forEach(spec => {
      env = env.set(spec.local.name, Signal.ok(type.err));
    });
  } else {
    const module = moduleEnv.get(decl.source.value) ?? bug(`expected module '${decl.source.value}'`);
    decl.specifiers.forEach(spec => {
      switch (spec.type) {
        case 'ImportNamespaceSpecifier': {
          env = env.set(spec.local.name, module.flatMap(module => Signal.joinObject(module)));
          break;
        }

        case 'ImportDefaultSpecifier': {
          const type = annots.get(spec.local);
          if (type && type.kind === 'Error') {
            env = env.set(spec.local.name, Signal.ok(type.err))
          } else {
            const defaultField = module.flatMap(module => {
              if ('default' in module) return module.default;
              else bug(`expected default export on '${decl.source.value}'`)
            });
            env = env.set(spec.local.name, defaultField);
          }
        }
        break;

        case 'ImportSpecifier': {
          const type = annots.get(spec.imported);
          if (type && type.kind === 'Error') {
            env = env.set(spec.local.name, Signal.ok(type.err))
          } else {
            const importedField = module.flatMap(module => {
              if (spec.imported.name in module) return module[spec.imported.name];
              else bug(`expected exported member '${spec.imported.name}' on '${decl.source.value}'`);
            });
            env = env.set(spec.local.name, importedField);
          }
        }
        break;
      }
    });
  }
  return env;
}

function extendEnvWithNamedExport(
  decl: ESTree.ExportNamedDeclaration,
  annots: AstAnnotations,
  env: Env,
  exportValue: { [s: string]: Signal<any> }
): Env {
  const declaration = decl.declaration;
  switch (declaration.kind) {
    case 'const': {
      declaration.declarations.forEach(declarator => {
        let name = declarator.id.name;
        let value = evaluateExpressionSignal(declarator.init, annots, env);
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
  annots: AstAnnotations,
  env: Env,
  exportValue: { [s: string]: Signal<any> }
): Env {
  const value = evaluateExpressionSignal(decl.declaration, annots, env);
  exportValue['default'] = value;
  return env;
}

export function renderMdx(
  ast: MDXHAST.Node,
  annots: AstAnnotations,
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
        const [env2, childNode] = renderMdx(child, annots, moduleEnv, env, exportValue);
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
            const [env2, childNode] = renderMdx(child, annots, moduleEnv, env, exportValue);
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
            const [env2, childNode] = renderMdx(child, annots, moduleEnv, env, exportValue);
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
          const type = annots.get(ast.jsxElement.ok) ?? bug(`expected type`);
          if (type.kind === 'Error') return [env, Signal.ok(null)];
          else return [env, evaluateExpressionSignal(jsx, annots, env)];
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
            env = extendEnvWithImport(decl, annots, moduleEnv, env);
            break;

          case 'ExportNamedDeclaration':
            env = extendEnvWithNamedExport(decl, annots, env, exportValue);
            break;

          case 'ExportDefaultDeclaration':
            env = extendEnvWithDefaultExport(decl, annots, env, exportValue);
            break;
        }
      }));
      return [env, Signal.ok(null)];

    default:
      throw new Error('unexpected AST ' + (ast as MDXHAST.Node).type);
  }
}
