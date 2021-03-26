import { bug } from '../../util/bug';
import * as Name from '../../util/Name';
import * as ESTree from '../ESTree';
// TODO(jaked) sort out the dependencies on various envs
import * as Render from '../Render';

export function expression(
  ast: ESTree.Expression,
  dynamicEnv: Render.DynamicEnv,
): boolean {
  const idents = ESTree.freeIdentifiers(ast);
  return idents.some(ident => dynamicEnv.get(ident) ?? false);
}

function exportDefaultDecl(
  decl: ESTree.ExportDefaultDeclaration,
  exportDynamic: Map<string, boolean>,
  dynamicEnv: Render.DynamicEnv,
) {
  exportDynamic.set('default', expression(decl.declaration, dynamicEnv));
}

function variableDecl(
  decl: ESTree.VariableDeclaration,
  typeEnv: Render.TypeEnv,
  dynamicEnv: Render.DynamicEnv,
  exportDynamic?: Map<string, boolean>,
): Render.DynamicEnv {
  decl.declarations.forEach(declarator => {
    let dynamic: boolean;
    if (decl.kind === 'let') {
      // updates to let-variables are compile-time changes
      // and initializers are checked to be static in typechecking
      dynamic = false;
    } else {
      const type = typeEnv.get(declarator.id.name) ?? bug(`expected type`);
      if (type.kind === 'Error')
        dynamic = false;
      else {
        if (!declarator.init) bug(`expected initializer`);
        dynamic = expression(declarator.init, dynamicEnv);
      }
    }
    if (exportDynamic) exportDynamic.set(declarator.id.name, dynamic);
    dynamicEnv = dynamicEnv.set(declarator.id.name, dynamic);
  });
  return dynamicEnv;
}

function exportNamedDecl(
  decl: ESTree.ExportNamedDeclaration,
  typeEnv: Render.TypeEnv,
  dynamicEnv: Render.DynamicEnv,
  exportDynamic: Map<string, boolean>,
): Render.DynamicEnv {
  return variableDecl(decl.declaration, typeEnv, dynamicEnv, exportDynamic);
}

function importDecl(
  moduleName: string,
  decl: ESTree.ImportDeclaration,
  moduleEnv: Map<string, Map<string, boolean>>,
  typeEnv: Render.TypeEnv,
  dynamicEnv: Render.DynamicEnv,
): Render.DynamicEnv {
  // TODO(jaked) remove duplication with synth.ts
  const importedModuleName = Name.rewriteResolve(moduleEnv, moduleName, decl.source.value);
  if (!importedModuleName) {
    decl.specifiers.forEach(spec => {
      dynamicEnv = dynamicEnv.set(spec.local.name, false);
    });
  } else {
    const module = moduleEnv.get(importedModuleName) ?? bug(`expected module '${importedModuleName}'`);
    decl.specifiers.forEach(spec => {
      switch (spec.type) {
        case 'ImportNamespaceSpecifier': {
          // if any field is dynamic the whole module is dynamic
          // TODO(jaked) make this more fine-grained, see comment in compileFilePm
          const dynamic = [...module.values()].some(dynamic => dynamic);
          dynamicEnv = dynamicEnv.set(spec.local.name, dynamic);
        }
        break;

        case 'ImportDefaultSpecifier': {
          const dynamic = module.get('default') ?? false;
          dynamicEnv = dynamicEnv.set(spec.local.name, dynamic);
        }
        break;

        case 'ImportSpecifier': {
          const dynamic = module.get(spec.imported.name) ?? false;
          dynamicEnv = dynamicEnv.set(spec.imported.name, dynamic);
        }
      }
    });
  }
  return dynamicEnv;
}

export function program(
  moduleName: string,
  moduleEnv: Map<string, Map<string, boolean>>,
  program: ESTree.Program,
  typeEnv: Render.TypeEnv,
  dynamicEnv: Render.DynamicEnv,
  exportDynamic: Map<string, boolean>
): Render.DynamicEnv {
  program.body.forEach(node => {
    switch (node.type) {
      case 'ExportDefaultDeclaration':
        exportDefaultDecl(node, exportDynamic, dynamicEnv);
        break;

      case 'ExportNamedDeclaration':
        dynamicEnv = exportNamedDecl(node, typeEnv, dynamicEnv, exportDynamic);
        break;

      case 'ImportDeclaration':
        dynamicEnv = importDecl(moduleName, node, moduleEnv, typeEnv, dynamicEnv);
        break;

      case 'VariableDeclaration':
        dynamicEnv = variableDecl(node, typeEnv, dynamicEnv);
        break;

      case 'ExpressionStatement':
        break;
    }
  });
  return dynamicEnv;
}
