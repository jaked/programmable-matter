import Try from '../../util/Try';
import * as MDXHAST from '../mdxhast';
import * as ESTree from '../ESTree';

// topologically sort bindings
// TODO(jaked)
// we do this by rearranging the AST
// but that's going to get hairy when we want to provide
// typechecking feedback in the editor
// we need to be careful to retain locations
// or leave the AST alone, but typecheck in toplogical order
export default function sortMdx(ast: MDXHAST.Root): MDXHAST.Root {
  const imports: Array<ESTree.ImportDeclaration> = [];
  const exportLets: Array<ESTree.ExportNamedDeclaration> = [];
  const exportConsts: Array<ESTree.ExportNamedDeclaration> = [];
  const exportDefault: Array<ESTree.ExportDefaultDeclaration> = [];

  function collectImportsExports(ast: MDXHAST.Node): MDXHAST.Node {
    switch (ast.type) {
      case 'root':
      case 'element': {
        const children: Array<MDXHAST.Node> = [];
        ast.children.forEach(child => {
          switch (child.type) {
            case 'import':
            case 'export':
              if (!child.declarations) throw new Error('expected import/export node to be parsed');
              child.declarations.forEach(decls => decls.forEach(decl => {
                switch (decl.type) {
                  case 'ImportDeclaration':
                    imports.push(decl);
                    break;
                  case 'ExportNamedDeclaration':
                    switch (decl.declaration.kind) {
                      case 'let':
                        exportLets.push(decl);
                        break;
                      case 'const':
                        exportConsts.push(decl);
                        break;
                    }
                    break;
                  case 'ExportDefaultDeclaration':
                    exportDefault.push(decl);
                }
              }));
              break;

            default:
              children.push(collectImportsExports(child));
          }
        });
        return { ...ast, children };
      }

      default:
        return ast;
    }
  }

  const ast2 = collectImportsExports(ast) as MDXHAST.Root;

  let decls: Array<[ ESTree.VariableDeclarator, Array<string> ]> = [];
  exportConsts.forEach(decl => {
    decl.declaration.declarations.forEach(decl => {
      decls.push([ decl, ESTree.freeIdentifiers(decl.init) ])
    })
  })

  const sortedDecls: Array<ESTree.VariableDeclarator> = [];
  let again = true;
  while (again) {
    again = false;
    decls = decls.filter(([ decl, free ]) => {
      if (free.every(id => sortedDecls.some(decl => decl.id.name === id))) {
        sortedDecls.push(decl);
        again = true;
        return false;
      } else {
        return true;
      }
    });
  }
  // remaining decls are part of a dependency loop
  decls.forEach(([ decl, _ ]) => {
    sortedDecls.push(decl);
  });

  // keep the ExportNamedDeclaration nodes so we can highlight keywords
  // but put all the sorted VariableDeclarators in the first one
  const sortedExportConsts = exportConsts.map((decl, i) => {
    if (i === 0) {
      const declaration =
        { ...decl.declaration, declarations: sortedDecls };
      return { ...decl, declaration };
    } else {
      const declaration =
        { ...decl.declaration, declarations: [] };
      return { ...decl, declaration };
    }
  });

  const children: MDXHAST.Node[] = [
    {
      type: 'import',
      value: '',
      declarations: Try.ok(imports),
    },
    {
      // TODO(jaked)
      // a cell should not depend on another definition
      // in its initializer
      type: 'export',
      value: '',
      declarations: Try.ok(exportLets),
    },
    {
      type: 'export',
      value: '',
      declarations: Try.ok(sortedExportConsts),
    },
    {
      type: 'export',
      value: '',
      declarations: Try.ok(exportDefault),
    },
    ...ast2.children
  ];
  return { ...ast2, children };
}
