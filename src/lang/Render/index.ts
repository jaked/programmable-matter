import * as Immutable from 'immutable';
import * as React from 'react';

import * as Name from '../../util/Name';
import { bug } from '../../util/bug';
import Signal from '../../util/Signal';

import * as ESTree from '../ESTree';
import * as Evaluate from '../Evaluate';
import { AstAnnotations } from '../../data';

export { initTypeEnv } from './initTypeEnv';
export { initValueEnv } from './initValueEnv';

export type Env = Immutable.Map<string, Signal<any>>;

export const context = React.createContext<'screen' | 'server'>('screen');

export function evaluateExpressionSignal(
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

export function extendEnvWithImport(
  mdxName: string,
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
    const moduleName = Name.rewriteResolve(moduleEnv, mdxName, decl.source.value) || bug(`expected module '${decl.source.value}'`);
    const module = moduleEnv.get(moduleName) ?? bug(`expected module '${moduleName}'`);
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

export function extendEnvWithNamedExport(
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

export function extendEnvWithDefaultExport(
  decl: ESTree.ExportDefaultDeclaration,
  annots: AstAnnotations,
  env: Env,
  exportValue: { [s: string]: Signal<any> }
): Env {
  const value = evaluateExpressionSignal(decl.declaration, annots, env);
  exportValue['default'] = value;
  return env;
}
