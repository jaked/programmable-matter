import * as Immutable from 'immutable';

import * as React from 'react';
import 'regenerator-runtime/runtime'; // required for react-inspector
import { Inspector } from 'react-inspector';

import { Cell } from '../util/Cell';
import Trace from '../util/Trace';
import Try from '../util/Try';
import * as data from '../data';
import * as MDXHAST from './mdxhast';
import * as AcornJsxAst from './acornJsxAst';
import * as Parser from './Parser';
import * as Type from './Type';
import * as Typecheck from './Typecheck';
import * as Evaluator from './Evaluator';
import * as Render from './Render';
import * as String from '../util/String';

const debug = false;

function dirtyChangedNotes(
  oldNotes: data.Notes,
  newNotes: data.Notes,
  dirty: Set<string>
): data.Notes {
  return newNotes.map((note, tag) => {
    const oldNote = oldNotes.get(tag);
    if (oldNote && oldNote.version == note.version) {
      // oldNote has parsed / compiled fields already
      return oldNote;
    } else {
      if (debug) console.log(tag + ' dirty because file changed')
      dirty.add(tag);
      return note;
    }
  });
}

function findImportsMdx(ast: MDXHAST.Node, imports: Set<string>) {
  switch (ast.type) {
    case 'root':
    case 'element':
      return ast.children.forEach(child => findImportsMdx(child, imports));

    case 'text':
    case 'jsx':
      break;

    case 'import':
    case 'export':
      if (!ast.declarations) throw new Error('expected import/export node to be parsed');
      ast.declarations.forEach(decls => decls.forEach(decl => {
        switch (decl.type) {
          case 'ImportDeclaration':
            imports.add(decl.source.value);
            break;
        }
      }));
      break;

    default: throw new Error('unexpected AST ' + (ast as MDXHAST.Node).type);
  }
}

function parseMdx(trace: Trace, content: string, layout: string | undefined): data.Parsed<MDXHAST.Root> {
  const ast = Parser.parse(trace, content);
  const imports = new Set<string>();
  if (layout) imports.add(layout);
  trace.time('findImportsMdx', () => findImportsMdx(ast, imports));
  return { ast, imports };
}

function parseJson(content: string): data.Parsed<AcornJsxAst.Expression> {
  const ast = Parser.parseExpression(content);
  const imports = new Set<string>();
  return { ast, imports };
}

function findImportsTs(ast: AcornJsxAst.Node, imports: Set<string>) {
  function fn(node: AcornJsxAst.Node) {
    switch (node.type) {
      case 'ImportDeclaration':
        imports.add(node.source.value);
    }
  }
  AcornJsxAst.visit(ast, fn);
}

function parseTs(trace: Trace, content: string): data.Parsed<AcornJsxAst.Program> {
  const ast = Parser.parseProgram(content);
  const imports = new Set<string>();
  findImportsTs(ast, imports);
  return { ast, imports };
}

function parseNote(trace: Trace, note: data.Note): data.Note {
  switch (note.type) {
    case 'mdx': {
      const parsed = Try.apply(() => parseMdx(trace, note.content, note.meta.layout));
      return Object.assign({}, note, { parsed });
    }

    case 'json': {
      const parsed = Try.apply(() => parseJson(note.content));
      return Object.assign({}, note, { parsed });
    }

    case 'txt': {
      const parsed = Try.ok({ ast: note.content, imports: new Set<string>() });
      return Object.assign({}, note, { parsed });
    }

    case 'ts': {
      const parsed = Try.apply(() => parseTs(trace, note.content));
      return Object.assign({}, note, { parsed });
    }

    default:
      throw new Error(`unhandled note type '${(<data.Note>note).type}' for '${(<data.Note>note).tag}'`);
  }
}

// also computes imports
function parseDirtyNotes(
  trace: Trace,
  notes: data.Notes,
  dirty: Set<string>
) {
  return notes.map((note, tag) => {
    if (dirty.has(tag)) {
      return trace.time(note.tag, () => parseNote(trace, note));
    } else {
      return note;
    }
  });
}

function sortNotes(notes: data.Notes): Array<string> {
  const sortedTags: Array<string> = [];
  const remaining = new Set(notes.keys());
  let again = true;
  while (again) {
    again = false;
    remaining.forEach(tag => {
      const note = notes.get(tag);
      if (!note || !note.parsed) throw new Error('expected note && note.parsed');
      if (note.parsed.type === 'ok') {
        const imports = [...note.parsed.ok.imports.values()];
        if (debug) console.log('imports for ' + tag + ' are ' + imports.join(' '));
        if (imports.every(tag => sortedTags.includes(tag))) {
          if (debug) console.log('adding ' + tag + ' to order');
          sortedTags.push(tag);
          remaining.delete(tag);
          again = true;
        }
      } else {
        if (debug) console.log('no imports parsed for ' + tag);
        if (debug) console.log(note.parsed.err);
      }
    });
  }
  // any remaining notes can't be parsed, or are part of a dependency loop
  remaining.forEach(tag => {
    if (debug) console.log(tag + ' failed to parse or has a loop');
    sortedTags.push(tag)
  });
  return sortedTags;
}

function dirtyDeletedNotes(
  oldNotes: data.Notes,
  newNotes: data.Notes,
  dirty: Set<string>
) {
  oldNotes.forEach(note => {
    if (!newNotes.has(note.tag))
      dirty.add(note.tag);
  });
}

// dirty notes that import a dirty note (post-sorting for transitivity)
// TODO(jaked)
// don't need to re-typecheck / re-compile a note if it hasn't changed
// and its dependencies haven't changed their types
function dirtyTransitively(
  orderedTags: Array<string>,
  notes: data.Notes,
  dirty: Set<string>
) {
  orderedTags.forEach(tag => {
    const note = notes.get(tag);
    if (!note || !note.parsed) throw new Error('expected note && note.parsed');
    if (note.parsed.type === 'ok') {
      const imports = [...note.parsed.ok.imports.values()];
      if (debug) console.log('imports for ' + tag + ' are ' + imports.join(' '));
      // a note importing a dirty note must be re-typechecked
      if (!dirty.has(tag) && imports.some(tag => dirty.has(tag))) {
        const dirtyTag = imports.find(tag => dirty.has(tag));
        if (debug) console.log(tag + ' dirty because ' + dirtyTag);
        dirty.add(tag);
      }
    } else {
      if (debug) console.log('no imports parsed for ' + tag);
      if (debug) console.log(note.parsed.err);
    }
  });
}

function freeIdentifiers(expr: AcornJsxAst.Expression): Array<string> {
  const free: Array<string> = [];

  function fn(
    expr: AcornJsxAst.Expression,
    bound: Immutable.Set<string>,
  ) {
    AcornJsxAst.visit(expr, node => {
      switch (node.type) {
        case 'Identifier':
          const id = node.name;
          if (!bound.contains(id) && !free.includes(id))
            free.push(id);
          break;

        case 'ArrowFunctionExpression':
          // TODO(jaked) properly handle argument patterns
          node.params.forEach(pat => {
            switch (pat.type) {
              case 'Identifier':
                bound = bound.add(pat.name);
                break;

              case 'ObjectPattern':
                pat.properties.forEach(pat => {
                  if (pat.key.type === 'Identifier') {
                    bound = bound.add(pat.key.name);
                  } else {
                    throw new Error ('expected Identifier');
                  }
                });
                break;

              default: throw new Error('unexpected AST ' + (pat as AcornJsxAst.Pattern).type)
            }
          });
          fn(node.body, bound);
          return false;
      }
    });
  }
  fn(expr, Immutable.Set());
  return free;
}

function sortProgram(ast: AcornJsxAst.Program): AcornJsxAst.Program {
  // TODO(jaked)
  // topologically sort bindings as we do for MDX
  return ast;
}

// topologically sort bindings
// TODO(jaked)
// we do this by rearranging the AST
// but that's going to get hairy when we want to provide
// typechecking feedback in the editor
// we need to be careful to retain locations
// or leave the AST alone, but typecheck in toplogical order
function sortMdx(ast: MDXHAST.Root): MDXHAST.Root {
  const imports: Array<AcornJsxAst.ImportDeclaration> = [];
  const exportLets: Array<AcornJsxAst.ExportNamedDeclaration> = [];
  const exportConsts: Array<AcornJsxAst.ExportNamedDeclaration> = [];

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
                }
              }));
              break;

            default:
              children.push(collectImportsExports(child));
          }
        });
        return Object.assign({}, ast, { children });
      }

      default:
        return ast;
    }
  }

  const ast2 = collectImportsExports(ast) as MDXHAST.Root;

  let decls: Array<[ AcornJsxAst.VariableDeclarator, Array<string> ]> = [];
  exportConsts.forEach(decl => {
    decl.declaration.declarations.forEach(decl => {
      decls.push([ decl, freeIdentifiers(decl.init) ])
    })
  })

  const sortedDecls: Array<AcornJsxAst.VariableDeclarator> = [];
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
        Object.assign({}, decl.declaration, { declarations: sortedDecls });
      return Object.assign({}, decl, { declaration });
    } else {
      const declaration =
        Object.assign({}, decl.declaration, { declarations: [] });
      return Object.assign({}, decl, { declaration });
    }
  });

  const children = [
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
    ...ast2.children
  ];
  return Object.assign({}, ast2, { children });
}

function compileTxt(
  content: string
): data.Compiled {
  const exportType = Type.module({ default: [Type.string, false] });
  const exportValue = { default: content }
  const rendered = () =>
    React.createElement('pre', null, content);
  return { exportType, exportValue, rendered };
}

function compileMdx(
  ast: MDXHAST.Root,
  capitalizedTag: string,
  layout: string | undefined,
  typeEnv: Typecheck.Env,
  valueEnv: Evaluator.Env,
  moduleTypeEnv: Immutable.Map<string, Type.ModuleType>,
  moduleValueEnv: Evaluator.Env,
  mkCell: (module: string, name: string, init: any) => Cell<any>,
): data.Compiled {
  const exportTypes: { [s: string]: [Type.Type, boolean] } = {};
  const exportValue: { [s: string]: any } = {};

  ast = sortMdx(ast);
  Typecheck.synthMdx(ast, moduleTypeEnv, typeEnv, exportTypes);
  const exportType = Type.module(exportTypes);

  let layoutFunction = (n: React.ReactNode) => n;
  if (layout) {
    const layoutType =
    Type.function(
      [ Type.object({ children: Type.array(Type.reactNodeType) }) ],
      Type.reactNodeType);
    const layoutModule = moduleTypeEnv.get(layout);
    if (layoutModule) {
      // TODO(jaked) add a .get method on Type.ModuleType
      const defaultField = layoutModule.fields.find(field => field.field === 'default');
      if (defaultField) {
        if (Type.isSubtype(defaultField.type, layoutType)) {
          const layoutTsFunction = moduleValueEnv.get(layout)['default'];
          // TODO(jaked) pass note metadata as props
          layoutFunction = (n: React.ReactNode) => layoutTsFunction({ children: n });
        }
      }
    }
  }

  // TODO(jaked)
  // first call to renderMdx computes exportType / exportValue
  // second call picks up current values of signals
  // instead we should render to a Signal<React.ReactNode>
  // and update() it to pick up current values
  Render.renderMdx(ast, capitalizedTag, moduleValueEnv, valueEnv, mkCell, exportValue);
  const rendered = () => {
    const [_, node] =
      Render.renderMdx(ast, capitalizedTag, moduleValueEnv, valueEnv, mkCell, exportValue);
    return layoutFunction(node);
  }
  return { exportType, exportValue, rendered };
}

function compileJson(
  ast: AcornJsxAst.Expression
): data.Compiled {
  const type = Typecheck.synth(ast, Immutable.Map());
  const exportType = Type.module({ default: type });
  const value = Evaluator.evaluateExpression(ast, Immutable.Map());
  const exportValue = { default: value }
  const rendered = () =>
    React.createElement(Inspector, { data: value, expandLevel: 1 });
  return { exportType, exportValue, rendered };
}

function compileTs(
  ast: AcornJsxAst.Program,
  capitalizedTag: string,
  typeEnv: Typecheck.Env,
  valueEnv: Evaluator.Env,
  moduleTypeEnv: Immutable.Map<string, Type.ModuleType>,
  moduleValueEnv: Evaluator.Env,
  mkCell: (module: string, name: string, init: any) => Cell<any>,
): data.Compiled {
  const exportTypes: { [s: string]: [Type.Type, boolean] } = {};
  const exportValue: { [s: string]: any } = {};

  ast = sortProgram(ast);
  Typecheck.synthProgram(ast, moduleTypeEnv, typeEnv, exportTypes);
  const exportType = Type.module(exportTypes);
  // TODO(jaked)
  // we don't have an opportunity to pick up current signal values
  // as we do for MDX; should compile to a Signal and update()
  // TODO(jaked) how to render a TS note?
  const rendered = () => 'unimplemented';
  Render.renderProgram(ast, capitalizedTag, moduleValueEnv, valueEnv, mkCell, exportValue)
  return { exportType, exportValue, rendered };
}

function compileNote(
  note: data.Note,
  typeEnv: Typecheck.Env,
  valueEnv: Evaluator.Env,
  moduleTypeEnv: Immutable.Map<string, Type.ModuleType>,
  moduleValueEnv: Evaluator.Env,
  mkCell: (module: string, name: string, init: any) => Cell<any>,
): Try<data.Compiled> {
  return Try.apply(() => {
    switch (note.type) {
      case 'mdx':
        if (!note.parsed) throw new Error('expected note.parsed');
        return compileMdx(
          note.parsed.get().ast,
          String.capitalize(note.tag),
          note.meta.layout,
          typeEnv,
          valueEnv,
          moduleTypeEnv,
          moduleValueEnv,
          mkCell,
        );

      case 'json': {
        if (!note.parsed) throw new Error('expected note.parsed');
        return compileJson(note.parsed.get().ast);
      }

      case 'txt':
        if (!note.parsed) throw new Error('expected note.parsed');
        return compileTxt(note.parsed.get().ast);

      case 'ts':
        if (!note.parsed) throw new Error('expected note.parsed');
        return compileTs(
          note.parsed.get().ast,
          String.capitalize(note.tag),
          typeEnv,
          valueEnv,
          moduleTypeEnv,
          moduleValueEnv,
          mkCell
        );

      default:
        throw new Error(`unhandled note type '${(<data.Note>note).type}'`);
    }
  });
}

function compileDirtyNotes(
  orderedTags: Array<string>,
  notes: data.Notes,
  dirty: Set<string>,
  mkCell: (module: string, name: string, init: any) => Cell<any>,
  setSelected: (note: string) => void,
): data.Notes {
  let typeEnv = Render.initTypeEnv;
  let valueEnv = Render.initValueEnv(setSelected);
  let moduleTypeEnv: Immutable.Map<string, Type.ModuleType> = Immutable.Map();
  let moduleValueEnv: Evaluator.Env = Immutable.Map();
  orderedTags.forEach(tag => {
    const note = notes.get(tag);
    if (!note) throw new Error('expected note');
    if (dirty.has(tag)) {
      if (debug) console.log('typechecking / rendering' + tag);
      const compiled = compileNote(note, typeEnv, valueEnv, moduleTypeEnv, moduleValueEnv, mkCell);
      compiled.forEach(compiled => {
        moduleTypeEnv = moduleTypeEnv.set(tag, compiled.exportType);
        moduleValueEnv = moduleValueEnv.set(tag, compiled.exportValue);
      });
      const note2 = Object.assign({}, note, { compiled });
      notes = notes.set(tag, note2);
    } else {
      if (debug) console.log('adding type / value env for ' + tag);
      if (!note.compiled) throw new Error('expected note.compiled');
      note.compiled.forEach(compiled => {
        moduleTypeEnv = moduleTypeEnv.set(tag, compiled.exportType);
        moduleValueEnv = moduleValueEnv.set(tag, compiled.exportValue);
      });
    }
  });
  return notes;
}

export function compileNotes(
  trace: Trace,
  oldNotes: data.Notes,
  notes: data.Notes,
  mkCell: (module: string, name: string, init: any) => Cell<any>,
  setSelected: (note: string) => void,
): data.Notes {
  // TODO(jaked)
  // maybe we should propagate a change set
  // instead of the current state of the filesystem

  // tracks notes that must be re-parsed / re-compiled
  const dirty = new Set<string>();

  // mark changed notes dirty, retain parsed / compiled fields on others
  notes = trace.time('dirtyChangedNotes', () => dirtyChangedNotes(oldNotes, notes, dirty));

  // parse dirty notes + compute imports
  notes = trace.time('parseDirtyNotes', () => parseDirtyNotes(trace, notes, dirty));

  // topologically sort notes according to imports
  const orderedTags = trace.time('sortNotes', () => sortNotes(notes));

  // mark deleted notes dirty so dependents are rebuilt
  trace.time('dirtyDeletedNotes', () => dirtyDeletedNotes(oldNotes, notes, dirty));

  // dirty notes that import a dirty note (post-sorting for transitivity)
  trace.time('dirtyTransitively', () => dirtyTransitively(orderedTags, notes, dirty));

  // compile dirty notes (post-sorting for dependency ordering)
  return trace.time('compileDirtyNotes', () => compileDirtyNotes(orderedTags, notes, dirty, mkCell, setSelected));
}
