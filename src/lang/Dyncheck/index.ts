import * as Immutable from 'immutable';
import { bug } from '../../util/bug';
import * as ESTree from '../ESTree';
import Typecheck from '../Typecheck';

export type Env = Immutable.Map<string, boolean>;

export function expression(
  ast: ESTree.Expression,
  dynamicEnv: Env,
): boolean {
  const idents = ESTree.freeIdentifiers(ast);
  return idents.some(ident => dynamicEnv.get(ident) ?? false);
}

function variableDecl(
  decl: ESTree.VariableDeclaration,
  typeEnv: Typecheck.Env,
  dynamicEnv: Env,
): Env {
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
    dynamicEnv = dynamicEnv.set(declarator.id.name, dynamic);
  });
  return dynamicEnv;
}

function importDecl(
  decl: ESTree.ImportDeclaration,
  moduleEnv: Map<string, Map<string, boolean>>,
  typeEnv: Typecheck.Env,
  dynamicEnv: Env,
): Env {
  const module = moduleEnv.get(decl.source.value);
  if (!module) {
    decl.specifiers.forEach(spec => {
      dynamicEnv = dynamicEnv.set(spec.local.name, false);
    });
  } else {
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
  moduleEnv: Map<string, Map<string, boolean>>,
  program: ESTree.Program,
  typeEnv: Typecheck.Env,
  dynamicEnv: Env,
): Env {
  program.body.forEach(node => {
    switch (node.type) {
      case 'ExportDefaultDeclaration':
        dynamicEnv = dynamicEnv.set('default', expression(node.declaration, dynamicEnv));
        break;

      case 'ExportNamedDeclaration':
        dynamicEnv = variableDecl(node.declaration, typeEnv, dynamicEnv);
        break;

      case 'ImportDeclaration':
        dynamicEnv = importDecl(node, moduleEnv, typeEnv, dynamicEnv);
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
