import * as Path from 'path';

import * as Immutable from 'immutable';
import * as Graymatter from 'gray-matter';

import * as React from 'react';
import 'regenerator-runtime/runtime'; // required for react-inspector
import { Inspector } from 'react-inspector';

import { Cell } from '../util/Cell';
import Trace from '../util/Trace';
import Try from '../util/Try';
import * as data from '../data';
import * as MDXHAST from './mdxhast';
import * as ESTree from './ESTree';
import * as Parser from './Parser';
import * as Type from './Type';
import * as Typecheck from './Typecheck';
import * as Evaluator from './Evaluator';
import * as Render from './Render';
import * as String from '../util/String';

const debug = false;

function sanitizeMeta(obj: any): data.Meta {
  // TODO(jaked) json-schema instead of hand-coding this?
  // TODO(jaked) report errors somehow
  const type: 'mdx' | 'json' | 'txt' | 'ts' =
    (obj.type === 'mdx' || obj.type === 'json' || obj.type === 'txt' || obj.type === 'ts') ?
    obj.type : undefined;

  const title: string =
    typeof obj.title === 'string' ?
    obj.title : undefined;

  const tags: Array<string> =
    (Array.isArray(obj.tags) && obj.tags.every(s => typeof s === 'string')) ?
    obj.tags : undefined;

  const layout: string =
    typeof obj.layout === 'string' ?
    obj.layout : undefined;

  return { type, title, tags, layout };
}

function notesOfFiles(
  files: data.Files,
  oldNotes: data.Notes
): data.Notes {
  let newNotes: data.Notes = Immutable.Map();
  function addNote(newNote: data.Note) {
    const note = newNotes.get(newNote.tag);
    if (note) {
      throw new Error(`duplicate note tag ${newNote.tag} for ${newNote.path} (${note.path})`);
    } else {
      newNotes = newNotes.set(newNote.tag, newNote);
    }
  }

  function addFile(file: data.File) {
    const ext = Path.extname(file.path);
    const tag = Path.basename(file.path, ext);

    const string = file.buffer.toString('utf8');
    const graymatter = Graymatter.default(string);
    const meta = sanitizeMeta(graymatter.data);
    const content = graymatter.content;

    let type;
    if (meta.type) {
      // TODO(jaked) disallow conflicting extensions / meta types? rewrite to match?
      type = meta.type
    } else {
      switch (ext) {
        case '': type = 'mdx'; break;
        case '.md': type = 'mdx'; break; // TODO(jaked) support MD without X
        case '.mdx': type = 'mdx'; break;
        case '.json': type = 'json'; break;
        case '.txt': type = 'txt'; break;
        case '.ts': type = 'ts'; break;
        case '.jpg': type = 'jpeg'; break;
        case '.jpeg': type = 'jpeg'; break;
        default:
          throw new Error(`unhandled extension '${ext}' for '${file.path}'`);
      }
    }

    const note =
      Object.assign({}, file, { tag, meta, type, content });
    addNote(note);
  }

  files.forEach(file => {
    try {
      const ext = Path.extname(file.path);
      const tag = Path.basename(file.path, ext);

      const oldNote = oldNotes.get(tag);
      if (oldNote) {
        if (oldNote.path === file.path) {
          if (oldNote.version === file.version) {
            addNote(oldNote)
          } else {
            addFile(file);
          }
        } else {
          // TODO(jaked)
          // the version numbers for different files are not comparable
          // a dependent object needs to track both its own version
          // and the versions of its dependencies (like Signal)
          throw new Error(`path for ${tag} changed from ${oldNote.path} to ${file.path}`);
        }
      } else {
        addFile(file);
      }
    } catch (e) {
      // TODO(jaked) surface these errors in UI somehow
      console.log(e);
    }
  });
  return newNotes;
}

function dirtyChangedNotes(
  compiledNotes: data.CompiledNotes,
  notes: data.Notes
): data.CompiledNotes {
  return compiledNotes.filter((oldNote, tag) => {
    const newNote = notes.get(tag);
    if (newNote && oldNote.version === newNote.version) {
      // TODO(jaked) check that path has not changed
      return true;
    } else {
      if (debug) console.log(tag + ' dirty because file changed')
      return false;
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

function parseMdx(
  trace: Trace,
  content: string,
  layout: string | undefined,
): { ast: MDXHAST.Root, imports: Set<string> } {
  const ast = Parser.parse(trace, content);
  const imports = new Set<string>();
  if (layout) imports.add(layout);
  trace.time('findImportsMdx', () => findImportsMdx(ast, imports));
  return { ast, imports };
}

function parseJson(
  content: string
): ESTree.Expression {
  return Parser.parseExpression(content);
}

function findImportsTs(ast: ESTree.Node, imports: Set<string>) {
  function fn(node: ESTree.Node) {
    switch (node.type) {
      case 'ImportDeclaration':
        imports.add(node.source.value);
    }
  }
  ESTree.visit(ast, fn);
}

function parseTs(
  trace: Trace,
  content: string
): { ast: ESTree.Program, imports: Set<string> } {
  const ast = Parser.parseProgram(content);
  const imports = new Set<string>();
  findImportsTs(ast, imports);
  return { ast, imports };
}

const emptyImports = new Set<string>();

function parseNote(trace: Trace, note: data.Note): data.ParsedNote {
  switch (note.type) {
    case 'mdx': {
      const type = note.type; // tell TS something it already knows
      try {
        const { ast, imports } = parseMdx(trace, note.content, note.meta.layout);
        return Object.assign({}, note, { type, ast: Try.ok(ast), imports });
      } catch (e) {
        return Object.assign({}, note, { type, ast: Try.err(e), imports: emptyImports });
      }
    }

    case 'json': {
      const ast = Try.apply(() => parseJson(note.content));
      const type = note.type; // tell TS something it already knows
      return Object.assign({}, note, { type, ast, imports: emptyImports });
    }

    case 'txt': {
      const type = note.type; // tell TS something it already knows
      return Object.assign({}, note, { type, imports: emptyImports });
    }

    case 'ts': {
      const type = note.type; // tell TS something it already knows
      try {
        const { ast, imports } = parseTs(trace, note.content);
        return Object.assign({}, note, { type, ast: Try.ok(ast), imports });
      } catch (e) {
        return Object.assign({}, note, { type, ast: Try.err(e), imports: emptyImports });
      }
    }

    case 'jpeg': {
      const type = note.type; // tell TS something it already knows
      return Object.assign({}, note, { type, imports: emptyImports });
    }

    default:
      throw new Error(`unhandled note type '${(<data.Note>note).type}' for '${(<data.Note>note).tag}'`);
  }
}

// also computes imports
function parseDirtyNotes(
  trace: Trace,
  compiledNotes: data.CompiledNotes,
  notes: data.Notes
): data.ParsedNotes {
  return notes.map((newNote, tag) => {
    const oldNote = compiledNotes.get(tag);
    if (oldNote) {
      return oldNote;
    } else {
      return trace.time(tag, () => parseNote(trace, newNote));
    }
  });
}

function sortNotes(notes: data.ParsedNotes): Array<string> {
  const sortedTags: Array<string> = [];
  const remaining = new Set(notes.keys());
  let again = true;
  while (again) {
    again = false;
    remaining.forEach(tag => {
      const note = notes.get(tag);
      if (!note) throw new Error('expected note');
      const imports = [...note.imports.values()];
      if (debug) console.log('imports for ' + tag + ' are ' + imports.join(' '));
      if (imports.every(tag => sortedTags.includes(tag))) {
        if (debug) console.log('adding ' + tag + ' to order');
        sortedTags.push(tag);
        remaining.delete(tag);
        again = true;
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

// dirty notes that import a dirty note (post-sorting for transitivity)
// TODO(jaked)
// don't need to re-typecheck / re-compile a note if it hasn't changed
// and its dependencies haven't changed their types
function dirtyTransitively(
  orderedTags: Array<string>,
  compiledNotes: data.CompiledNotes,
  parsedNotes: data.ParsedNotes
): data.CompiledNotes {
  const dirty = new Set<string>();
  orderedTags.forEach(tag => {
    if (!compiledNotes.has(tag)) {
      if (debug) console.log(tag + ' dirty because file changed');
      dirty.add(tag);
    }
    const note = parsedNotes.get(tag);
    if (!note) throw new Error('expected note');
    const imports = [...note.imports.values()];
    if (debug) console.log('imports for ' + tag + ' are ' + imports.join(' '));
    // a note importing a dirty note must be re-typechecked
    if (!dirty.has(tag) && imports.some(tag => dirty.has(tag))) {
      const dirtyTag = imports.find(tag => dirty.has(tag));
      if (debug) console.log(tag + ' dirty because ' + dirtyTag);
      dirty.add(tag);
    }
  });
  return compiledNotes.filterNot(note => dirty.has(note.tag))
}

function freeIdentifiers(expr: ESTree.Expression): Array<string> {
  const free: Array<string> = [];

  function fn(
    expr: ESTree.Expression,
    bound: Immutable.Set<string>,
  ) {
    ESTree.visit(expr, node => {
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

              default: throw new Error('unexpected AST ' + (pat as ESTree.Pattern).type)
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

function sortProgram(ast: ESTree.Program): ESTree.Program {
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
        return Object.assign({}, ast, { children });
      }

      default:
        return ast;
    }
  }

  const ast2 = collectImportsExports(ast) as MDXHAST.Root;

  let decls: Array<[ ESTree.VariableDeclarator, Array<string> ]> = [];
  exportConsts.forEach(decl => {
    decl.declaration.declarations.forEach(decl => {
      decls.push([ decl, freeIdentifiers(decl.init) ])
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
    {
      type: 'export',
      value: '',
      declarations: Try.ok(exportDefault),
    },
    ...ast2.children
  ];
  return Object.assign({}, ast2, { children });
}

function compileTxt(
  content: string
): data.Compiled {
  const exportType = Type.module({ default: { type: Type.string, atom: false } });
  const exportValue = { default: content }
  const rendered = () =>
    React.createElement('pre', null, content);
  return { exportType, exportValue, rendered };
}

// TODO(jaked)
// is there a way to internalize Typescript types
// so we can generate these? like Scala implicits?
const metaType =
  Type.object({
    type: Type.singleton('mdx'),
    title: Type.optional(Type.string),
    tags: Type.optional(Type.array(Type.string)),
    layout: Type.string
  })

function compileMdx(
  trace: Trace,
  ast: MDXHAST.Root,
  capitalizedTag: string,
  meta: data.Meta,
  typeEnv: Typecheck.Env,
  valueEnv: Evaluator.Env,
  moduleTypeEnv: Immutable.Map<string, Type.ModuleType>,
  moduleValueEnv: Evaluator.Env,
  mkCell: (module: string, name: string, init: any) => Cell<any>,
): data.Compiled {
  const exportTypes: { [s: string]: Typecheck.TypeAtom } = {};
  const exportValue: { [s: string]: any } = {};

  ast = trace.time('sortMdx', () => sortMdx(ast));
  trace.time('synthMdx', () => Typecheck.synthMdx(ast, moduleTypeEnv, typeEnv, exportTypes));
  const exportType = Type.module(exportTypes);

  let layoutFunction = (n: React.ReactNode) => n;
  if (meta.layout) {
    const layoutType =
    Type.function(
      [ Type.object({
        children: Type.array(Type.reactNodeType),
        meta: metaType
      }) ],
      Type.reactNodeType);
    const layoutModule = moduleTypeEnv.get(meta.layout);
    if (layoutModule) {
      // TODO(jaked) add a .get method on Type.ModuleType
      const defaultField = layoutModule.fields.find(field => field.field === 'default');
      if (defaultField) {
        if (Type.isSubtype(defaultField.type, layoutType)) {
          const layoutTsFunction = moduleValueEnv.get(meta.layout)['default'];
          layoutFunction = (n: React.ReactNode) => layoutTsFunction({ children: n, meta });
        }
      }
    }
  }

  // TODO(jaked)
  // first call to renderMdx computes exportType / exportValue
  // second call picks up current values of signals
  // instead we should render to a Signal<React.ReactNode>
  // and update() it to pick up current values
  trace.time('renderMdx', () => Render.renderMdx(ast, capitalizedTag, moduleValueEnv, valueEnv, mkCell, exportValue));
  const rendered = () => {
    const [_, node] =
      Render.renderMdx(ast, capitalizedTag, moduleValueEnv, valueEnv, mkCell, exportValue);
    return layoutFunction(node);
  }
  return { exportType, exportValue, rendered };
}

function compileJson(
  ast: ESTree.Expression
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
  ast: ESTree.Program,
  capitalizedTag: string,
  typeEnv: Typecheck.Env,
  valueEnv: Evaluator.Env,
  moduleTypeEnv: Immutable.Map<string, Type.ModuleType>,
  moduleValueEnv: Evaluator.Env,
  mkCell: (module: string, name: string, init: any) => Cell<any>,
): data.Compiled {
  const exportTypes: { [s: string]: Typecheck.TypeAtom } = {};
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

function compileJpeg(
  tag: string
): data.Compiled {
  // TODO(jaked) parse JPEG file and return metadata
  const exportType = Type.module({ });
  const exportValue = { }
  const rendered = () =>
    // it doesn't seem to be straightforward to create an img node
    // directly from JPEG data, so we serve it via the dev server
    // TODO(jaked) plumb port from top-level
    React.createElement('img', {
      src: `http://localhost:3000/${tag}`
    });
  return { exportType, exportValue, rendered };
}

function compileNote(
  trace: Trace,
  parsedNote: data.ParsedNote,
  typeEnv: Typecheck.Env,
  valueEnv: Evaluator.Env,
  moduleTypeEnv: Immutable.Map<string, Type.ModuleType>,
  moduleValueEnv: Evaluator.Env,
  mkCell: (module: string, name: string, init: any) => Cell<any>,
): Try<data.Compiled> {
  return Try.apply(() => {
    switch (parsedNote.type) {
      case 'mdx':
        return compileMdx(
          trace,
          parsedNote.ast.get(),
          String.capitalize(parsedNote.tag),
          parsedNote.meta,
          typeEnv,
          valueEnv,
          moduleTypeEnv,
          moduleValueEnv,
          mkCell,
        );

      case 'json': {
        return compileJson(parsedNote.ast.get());
      }

      case 'txt':
        return compileTxt(parsedNote.content);

      case 'ts':
        return compileTs(
          parsedNote.ast.get(),
          String.capitalize(parsedNote.tag),
          typeEnv,
          valueEnv,
          moduleTypeEnv,
          moduleValueEnv,
          mkCell
        );

      case 'jpeg':
        return compileJpeg(
          parsedNote.tag
        );

      default:
        throw new Error(`unhandled note type '${(<data.ParsedNote>parsedNote).type}'`);
    }
  });
}

function compileDirtyNotes(
  trace: Trace,
  orderedTags: Array<string>,
  parsedNotes: data.ParsedNotes,
  compiledNotes: data.CompiledNotes,
  mkCell: (module: string, name: string, init: any) => Cell<any>,
  setSelected: (note: string) => void,
): data.CompiledNotes {
  let typeEnv = Render.initTypeEnv;
  let valueEnv = Render.initValueEnv(setSelected);
  let moduleTypeEnv: Immutable.Map<string, Type.ModuleType> = Immutable.Map();
  let moduleValueEnv: Evaluator.Env = Immutable.Map();
  orderedTags.forEach(tag => {
    const compiledNote = compiledNotes.get(tag);
    if (compiledNote) {
      if (debug) console.log('adding type / value env for ' + tag);
      compiledNote.compiled.forEach(compiled => {
        moduleTypeEnv = moduleTypeEnv.set(tag, compiled.exportType);
        moduleValueEnv = moduleValueEnv.set(tag, compiled.exportValue);
      });
    } else {
      const parsedNote = parsedNotes.get(tag);
      if (!parsedNote) throw new Error('expected note');
      if (debug) console.log('typechecking / rendering ' + tag);
      const compiled =
        trace.time(tag, () => compileNote(trace, parsedNote, typeEnv, valueEnv, moduleTypeEnv, moduleValueEnv, mkCell));
      compiled.forEach(compiled => {
        moduleTypeEnv = moduleTypeEnv.set(tag, compiled.exportType);
        moduleValueEnv = moduleValueEnv.set(tag, compiled.exportValue);
      });
      const compiledNote = Object.assign({}, parsedNote, { compiled });
      compiledNotes = compiledNotes.set(tag, compiledNote);
    }
  });
  return compiledNotes;
}

export function compileFiles(
  trace: Trace,
  compiledNotes: data.CompiledNotes,
  files: data.Files,
  mkCell: (module: string, name: string, init: any) => Cell<any>,
  setSelected: (note: string) => void,
): data.CompiledNotes {
  // TODO(jaked)
  // maybe we should propagate a change set
  // instead of the current state of the filesystem

  const notes = trace.time('notesOfFiles', () => notesOfFiles(files, compiledNotes));

  // filter out changed notes
  compiledNotes = trace.time('dirtyChangedNotes', () => dirtyChangedNotes(compiledNotes, notes));

  // parse dirty notes + compute imports
  const parsedNotes = trace.time('parseDirtyNotes', () => parseDirtyNotes(trace, compiledNotes, notes));

  // topologically sort notes according to imports
  const orderedTags = trace.time('sortNotes', () => sortNotes(parsedNotes));

  // dirty notes that import a dirty note (post-sorting for transitivity)
  compiledNotes = trace.time('dirtyTransitively', () => dirtyTransitively(orderedTags, compiledNotes, parsedNotes));

  // compile dirty notes (post-sorting for dependency ordering)
  return trace.time('compileDirtyNotes', () => compileDirtyNotes(trace, orderedTags, parsedNotes, compiledNotes, mkCell, setSelected));
}
