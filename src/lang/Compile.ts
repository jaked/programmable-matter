import * as Path from 'path';

import * as Immutable from 'immutable';

import * as React from 'react';

import Signal from '../util/Signal';
import Trace from '../util/Trace';
import Try from '../util/Try';
import * as data from '../data';
import * as MDXHAST from './mdxhast';
import * as ESTree from './ESTree';
import * as Parser from './Parser';
import Type from './Type';
import Typecheck from './Typecheck';
import * as Evaluator from './Evaluator';
import * as Render from './Render';
import * as String from '../util/String';
import { diffMap } from '../util/immutable/Map';
import { bug } from '../util/bug';

import { Table, Field as TableField } from '../components/Table';
import { Record, Field as RecordField } from '../components/Record';

const debug = false;

export type ModuleValueEnv = Immutable.Map<string, { [s: string]: Signal<any> }>

function sanitizeMeta(obj: any): data.Meta {
  // TODO(jaked) json-schema instead of hand-coding this?
  // TODO(jaked) report errors somehow
  const type =
    (obj.type === 'mdx' || obj.type === 'json' || obj.type === 'txt' || obj.type === 'jpeg' || obj.type === 'table') ?
    { type: obj.type } : {};

  const title =
    typeof obj.title === 'string' ?
    { title: obj.title } : {};

  const tags =
    (Array.isArray(obj.tags) && obj.tags.every(s => typeof s === 'string')) ?
    { tags: obj.tags } : {};

  const layout =
    typeof obj.layout === 'string' ?
    { layout: obj.layout } : {};

  let dataType = {}
  if (typeof obj.dataType === 'string') {
    try {
      dataType = { dataType: Parser.parseType(obj.dataType) }
    } catch (e) {
      // TODO(jaked) how to surface these?
      console.log(e)
    }
  }

  const dirMeta =
    typeof obj.dirMeta === 'object' ?
    { dirMeta: sanitizeMeta(obj.dirMeta) } : {};

  return { ...type, ...title, ...tags, ...layout, ...dataType, ...dirMeta };
}

function parseMeta(file: data.File): data.Meta {
  let obj;
  try {
    obj = JSON.parse(file.buffer.toString('utf8'));
  } catch (e) {
    console.log(e);
    return {};
  }

  return sanitizeMeta(obj);
}

function tagOfPath(path: string) {
  const pathParts = Path.parse(path);
  if (pathParts.name === 'index') return pathParts.dir;
  else return Path.join(pathParts.dir, pathParts.name);
}

function isIndexMeta(path: string) {
  return Path.parse(path).base === 'index.meta';
}

function isIndexMetaFor(path: string, tag: string) {
  return isIndexMeta(path) && Path.dirname(path) === Path.dirname(tag);
}

function isNonIndexMeta(path: string) {
  const pathParts = Path.parse(path);
  return pathParts.ext === '.meta' && pathParts.name !== 'index';
}

function groupFilesByTag(
  files: data.Files,
  oldFiles: data.Files,
  oldGroupedFiles: Immutable.Map<string, Immutable.Map<string, Signal<data.File>>>
): Immutable.Map<string, Immutable.Map<string, Signal<data.File>>> {
  // TODO(jaked)
  // seems like we could extract an abstraction here to Signal
  // i.e. an incrementally-maintained view of a join, somehow

  let groupedFiles = oldGroupedFiles;
  let { added, changed, deleted } = diffMap(oldFiles, files);

  // first, handle updates of non-.meta files, so groupedFiles has correct tags
  deleted.forEach(path => {
    if (debug) console.log(`${path} deleted`);
    const tag = tagOfPath(path);
    const group = groupedFiles.get(tag) || bug(`expected group for ${tag}`);
    groupedFiles = groupedFiles.set(tag, group.delete(path));
  });

  changed.forEach(([prev, curr], path) => {
    // TODO(jaked) can this ever happen for Filesystem?
    if (debug) console.log(`${path} signal changed`);
    const tag = tagOfPath(path);
    const group = groupedFiles.get(tag) || bug(`expected group for ${tag}`);
    groupedFiles = groupedFiles.set(tag, group.set(path, curr));
  });

  added.forEach((v, path) => {
    if (debug) console.log(`${path} added`);
    const tag = tagOfPath(path);
    const group = groupedFiles.get(tag) || Immutable.Map();
    groupedFiles = groupedFiles.set(tag, group.set(path, v));
  });

  // add dummy index notes for all dirs
  // TODO(jaked) need to delete old dummies if all real files are deleted
  groupedFiles.forEach((_, tag) => {
    const dirname = Path.dirname(tag);
    if (dirname !== '.') {
      const dirs = dirname.split('/');
      let dir = '';
      for (let i = 0; i < dirs.length; i++) {
        dir = Path.join(dir, dirs[i]);
        if (!groupedFiles.has(dir)) {
          const fileSignal = Signal.ok({
            path: Path.join(dir, 'index'),
            version: 0,
            buffer: Buffer.from('')
          });
          added = added.set(dir, fileSignal);
          const group = Immutable.Map({ [dir]: fileSignal });
          groupedFiles = groupedFiles.set(dir, group);
        }
      }
    }
  });

  // next, update join for changed index.meta files
  groupedFiles = groupedFiles.map((group, tag) => {
    deleted.forEach(path => {
      if (isIndexMetaFor(path, tag)) {
        group = group.delete(path);
      }
    });

    changed.forEach(([prev, curr], path) => {
      if (isIndexMetaFor(path, tag)) {
        group = group.set(path, curr);
      }
    });

    added.forEach((v, path) => {
      if (isIndexMetaFor(path, tag)) {
        group = group.set(path, v);
      }
    });

    return group;
  });

  // finally, update join for changed non-index.meta files
  files.forEach((file, path) => {
    if (isIndexMeta(path)) {
      const metaPath = path;

      deleted.forEach(path => {
        if (!isIndexMeta(path)) {
          const tag = tagOfPath(path);
          if (isIndexMetaFor(metaPath, tag)) {
            const group = groupedFiles.get(tag) || bug(`expected group for ${tag}`);
            if (group.size === 1) // last non-index.meta file was deleted
              groupedFiles = groupedFiles.set(tag, group.delete(metaPath));
          }
        }
      });

      changed.forEach((_, path) => {
        if (!isIndexMeta(path)) {
          const tag = tagOfPath(path);
          if (isIndexMetaFor(metaPath, tag)) {
            const group = groupedFiles.get(tag) || bug(`expected group for ${tag}`);
            groupedFiles = groupedFiles.set(tag, group.set(metaPath, file));
          }
        }
      });

      added.forEach((_, path) => {
        if (!isIndexMeta(path)) {
          const tag = tagOfPath(path);
          if (isIndexMetaFor(metaPath, tag)) {
            const group = groupedFiles.get(tag) || bug(`expected group for ${tag}`);
            groupedFiles = groupedFiles.set(tag, group.set(metaPath, file));
          }
        }
      });
    }
  })

  groupedFiles = groupedFiles.filter(group => group.size > 0);

  return groupedFiles;
}

function typeOfPath(path: string): data.Types | undefined {
  const pathParts = Path.parse(path);

  let type: undefined | data.Types = undefined;
  if (pathParts.ext) {
    switch (pathParts.ext) {
      case '.meta': type = 'meta'; break;
      case '.md': type = 'mdx'; break; // TODO(jaked) support MD without X
      case '.mdx': type = 'mdx'; break;
      case '.json': type = 'json'; break;
      case '.txt': type = 'txt'; break;
      case '.table': type = 'table'; break;
      case '.JPG': type = 'jpeg'; break;
      case '.jpg': type = 'jpeg'; break;
      case '.jpeg': type = 'jpeg'; break;
      default:
        // TODO(jaked) throwing here fails the whole UI
        // need to encode the error in Note somehow
        // or avoid joining the map values
        console.log(`unhandled extension '${pathParts.ext}' for '${path}'`);
    }
  }
  return type;
}

function noteOfGroup(
  group: Immutable.Map<string, Signal<data.File>>,
  tag: string
): Signal<data.Note> {
  return Signal.label(tag, Signal.join(...group.values()).map<data.Note>(files => {

    const isIndex = files.some(file => file.path === Path.join(tag, 'index.meta'));

    let meta: data.Meta = {};
    if (isIndex) {
      // dirMeta of index.meta does not apply to index note
      const metaFile = files.find(file => isIndexMeta(file.path));
      if (metaFile) meta = { ...meta, ...parseMeta(metaFile)};
    } else {
      const indexMetaFile = files.find(file => isIndexMeta(file.path));
      if (indexMetaFile) meta = { ...meta, ...parseMeta(indexMetaFile).dirMeta }
      const metaFile = files.find(file => isNonIndexMeta(file.path));
      if (metaFile) meta = { ...meta, ...parseMeta(metaFile)};
    }

    const noteFiles: data.NoteFiles =
      files.reduce<data.NoteFiles>((obj, file) => {
        if (!isIndex && isIndexMeta(file.path)) return obj;
        const type = typeOfPath(file.path) ?? 'mdx';
        return { ...obj, [type]: file };
      },
      {});

    const content: data.NoteContent =
      Object.keys(noteFiles).reduce<data.NoteContent>((obj, key) => {
        const file = noteFiles[key] ?? bug('expected ${key} file for ${tag}');
        if (key === 'jpeg') return obj;
        else {
          const content = file.buffer.toString('utf8');
          return { ...obj, [key]: content };
        }
      },
      {});

    return { tag, isIndex, meta, files: noteFiles, content };
  }));
}

// TODO(jaked) called from app, where should this go?
export function notesOfFiles(
  trace: Trace,
  files: Signal<data.Files>,
): Signal<data.Notes> {
  const groupedFiles =
    Signal.label('groupedFiles',
      Signal.mapWithPrev(
        files,
        groupFilesByTag,
        Immutable.Map(),
        Immutable.Map()
      )
    );
  return Signal.label('notes',
    Signal.mapImmutableMap(groupedFiles, noteOfGroup)
  );
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

function parseNote(trace: Trace, note: data.Note): data.ParsedNote {
  // TODO(jaked) Object.map or wrap object in helper
  const parsed = Object.keys(note.content).reduce<data.NoteParsed>(
    (obj, key) => {
      switch (key) {
        case 'meta': {
          const content = note.content.meta ?? bug(`expected meta content for ${note.tag}`);
          const ast = Try.apply(() => Parser.parseExpression(content));
          return { ...obj, meta: ast };
        }

        case 'mdx': {
          const content = note.content.mdx ?? bug(`expected mdx content for ${note.tag}`);
          const ast = Try.apply(() => Parser.parse(trace, content));
          return { ...obj, mdx: ast };
        }

        case 'json': {
          const content = note.content.json ?? bug(`expected json content for ${note.tag}`);
          const ast = Try.apply(() => Parser.parseExpression(content));
          return { ...obj, json: ast };
        }

        case 'table': {
          const content = note.content.table ?? bug(`expected table content for ${note.tag}`);
          return { ...obj, table: Try.ok({}) };
        }

        default: return obj;
      }
    },
    {}
  );
  return { ...note, parsed };
}

function sortNotes(notes: data.ParsedNotesWithImports): Array<string> {
  const sortedTags: Array<string> = [];
  const remaining = new Set(notes.keys());
  let again = true;
  while (again) {
    again = false;
    remaining.forEach(tag => {
      const note = notes.get(tag);
      if (!note) throw new Error('expected note');
      if (note.imports.size === 0) {
        sortedTags.push(tag);
        remaining.delete(tag);
        again = true;
      } else {
        const imports = [...note.imports.values()];
        if (debug) console.log('imports for ' + tag + ' are ' + imports.join(' '));
        if (imports.every(tag => !remaining.has(tag))) {
          if (debug) console.log('adding ' + tag + ' to order');
          sortedTags.push(tag);
          remaining.delete(tag);
          again = true;
        }
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
  parsedNotes: data.ParsedNotesWithImports
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

function compileTxt(
  content: string
): data.Compiled {
  const exportType = Type.module({ default: Type.string });
  const exportValue = { default: Signal.ok(content) }
  const rendered = Signal.ok(
    React.createElement('pre', null, content)
  );
  return { exportType, exportValue, rendered };
}

// TODO(jaked)
// is there a way to internalize Typescript types
// so we can generate these? like Scala implicits?
const metaType =
  Type.object({
    type: Type.singleton('mdx'),
    title: Type.undefinedOr(Type.string),
    tags: Type.undefinedOr(Type.array(Type.string)),
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
  moduleValueEnv: ModuleValueEnv,
  mkCell: (module: string, name: string, init: any) => Signal.Cell<any>,
): data.Compiled {
  const exportTypes: { [s: string]: Type.Type } = {};
  const exportValue: { [s: string]: Signal<any> } = {};

  ast = trace.time('sortMdx', () => sortMdx(ast));
  trace.time('synthMdx', () => Typecheck.synthMdx(ast, moduleTypeEnv, typeEnv, exportTypes));
  const exportType = Type.module(exportTypes);

  let layoutFunction: undefined | Signal<(props: { children: React.ReactNode, meta: data.Meta }) => React.ReactNode>;
  if (meta.layout) {
    const layoutType =
      Type.functionType(
        [ Type.object({
          children: Type.array(Type.reactNodeType),
          meta: metaType
        }) ],
        Type.reactNodeType);
    const layoutModule = moduleTypeEnv.get(meta.layout);
    if (layoutModule) {
      const defaultType = layoutModule.get('default');
      if (defaultType) {
        if (Type.isSubtype(defaultType, layoutType)) {
          const layoutModule = moduleValueEnv.get(meta.layout);
          if (layoutModule) {
            layoutFunction = layoutModule['default'];
          }
        }
      }
    }
  }

  const rendered =
    trace.time('renderMdx', () => {
      const [_, node] =
        Render.renderMdx(ast, capitalizedTag, moduleValueEnv, valueEnv, mkCell, exportValue);
      if (layoutFunction)
        return Signal.join(layoutFunction, node).map(([layoutFunction, node]) =>
          layoutFunction({ children: node, meta })
        );
      else return node;
    });
  return { exportType, exportValue, rendered };
}

function compileJson(
  ast: ESTree.Expression,
  meta: data.Meta
): data.Compiled {
  let type: Type;
  if (meta.dataType) {
    Typecheck.check(ast, Typecheck.env(), meta.dataType);
    type = meta.dataType;
  } else {
    type = Typecheck.synth(ast, Typecheck.env());
  }
  const exportType = Type.module({ default: type });
  const value = Evaluator.evaluateExpression(ast, Immutable.Map());
  const exportValue = { default: Signal.ok(value) };
  if (type.kind !== 'Object') bug(`expected Object type`);
  const fields: RecordField[] =
    type.fields.map(({ field, type }) => ({
      label: field,
      accessor: (o: object) => o[field],
      component: ({ data }) => React.createElement(React.Fragment, null, data)
    }));
  const rendered = Signal.ok(
    // TODO(json) handle arrays of records (with Table)
    React.createElement(Record, { object: value, fields })
  );
  return { exportType, exportValue, rendered };
}

function compileJpeg(
  tag: string
): data.Compiled {
  // TODO(jaked) parse JPEG file and return metadata
  const exportType = Type.module({ });
  const exportValue = { }
  const rendered = Signal.ok(
    // it doesn't seem to be straightforward to create an img node
    // directly from JPEG data, so we serve it via the dev server
    // TODO(jaked) plumb port from top-level
    React.createElement(
      'img',
      {
        src: `http://localhost:3000/${tag}`,
        style: {
          maxWidth: '100%',
          objectFit: 'contain' // ???
        }
      }
    )
  );
  return { exportType, exportValue, rendered };
}

function compileTable(
  trace: Trace,
  parsedNote: data.ParsedNoteWithImports,
  moduleTypeEnv: Immutable.Map<string, Type.ModuleType>,
  moduleValueEnv: ModuleValueEnv,
  setSelected: (tag: string) => void,
): data.Compiled {
  const types: Type[] = [];
  parsedNote.imports.forEach(tag => {
    // TODO(jaked) surface these errors somehow
    // also surface underlying errors
    // e.g. a module doesn't match its type signature
    const moduleType = moduleTypeEnv.get(tag);
    if (!moduleType) {
      console.log(`expected module type for ${tag}`);
      return;
    }
    const defaultType = moduleType.get('default');
    if (!defaultType) {
      console.log(`expected default export for ${tag}`);
      return;
    }
    types.push(defaultType);
  });
  // TODO(jaked)
  // treat parsedNote.imports as a Signal<Map> to make tables incremental
  const table = Signal.ok(Immutable.Map<string, Signal<any>>().withMutations(map =>
    parsedNote.imports.forEach(tag => {
      const moduleValue = moduleValueEnv.get(tag);
      if (!moduleValue) {
        console.log(`expected module value for ${tag}`);
        return;
      }
      const defaultValue = moduleValue['default'];
      if (!defaultValue) {
        console.log(`expected default member for ${tag}`);
        return;
      }
      const relativeTag = Path.relative(Path.dirname(parsedNote.tag), tag);
      map.set(relativeTag, defaultValue)
    })
  ));
  const typeUnion = Type.union(...types);
  const exportType = Type.module({
    default: Type.array(typeUnion)
  });
  const exportValue = {
    default: Signal.joinImmutableMap(table)
  }

  switch (typeUnion.kind) {
    case 'Object':
      const fields: TableField[] =
        typeUnion.fields.map(({ field, type }) => ({
          label: field,
          accessor: (o: object) => o[field],
          width: 100,
          component: ({ data }) => React.createElement(React.Fragment, null, data)
        }));
      const onSelect = (tag: string) =>
        setSelected(Path.join(Path.dirname(parsedNote.tag), tag));
      const rendered = exportValue.default.map(data =>
        React.createElement(Table, { data, fields, onSelect })
      );
      return { exportType, exportValue, rendered };

    default:
      // TODO(jaked)
      // maybe we can display nonuniform / non-Object types a different way?
      bug(`unhandled table value type ${typeUnion.kind}`)
  }
}

function compileNote(
  trace: Trace,
  parsedNote: data.ParsedNoteWithImports,
  typeEnv: Typecheck.Env,
  valueEnv: Evaluator.Env,
  moduleTypeEnv: Immutable.Map<string, Type.ModuleType>,
  moduleValueEnv: ModuleValueEnv,
  mkCell: (module: string, name: string, init: any) => Signal.Cell<any>,
  setSelected: (tag: string) => void,
): data.CompiledNote {
  // TODO(jaked) Object.map or wrap object in helper
  const compiled = Object.keys(parsedNote.content).reduce<data.NoteCompiled>(
    (obj, key) => {
      switch (key) {
        case 'mdx': {
          const ast = parsedNote.parsed.mdx ?? bug(`expected parsed mdx`);
          const compiled = Try.apply(() => compileMdx(
            trace,
            ast.get(),
            String.capitalize(parsedNote.tag),
            parsedNote.meta,
            typeEnv,
            valueEnv,
            moduleTypeEnv,
            moduleValueEnv,
            mkCell,
          ));
          return { ...obj, mdx: compiled };
        }

        case 'json': {
          const ast = parsedNote.parsed.json ?? bug(`expected parsed json`);
          const compiled = Try.apply(() => compileJson(
            ast.get(),
            parsedNote.meta
          ));
          return { ...obj, json: compiled };
        }

        case 'txt': {
          const content = parsedNote.content.txt ?? bug(`expected txt content`);
          const compiled = Try.apply(() => compileTxt(content));
          return { ...obj, txt: compiled };
        }

        case 'jpeg': {
          const compiled = Try.apply(() => compileJpeg(
            parsedNote.tag
          ));
          return { ...obj, jpeg: compiled };
        }

        case 'table': {
          const compiled = Try.apply(() => compileTable(
            trace,
            parsedNote,
            moduleTypeEnv,
            moduleValueEnv,
            setSelected
          ));
          return { ...obj, table: compiled };
        }

        case 'meta': return obj;

        default:
          throw new Error(`unhandled note type '${key}'`);
      }
    },
    {}
  );
  return { ...parsedNote, compiled };
}

function compileDirtyNotes(
  trace: Trace,
  orderedTags: Array<string>,
  parsedNotes: data.ParsedNotesWithImports,
  compiledNotes: data.CompiledNotes,
  mkCell: (module: string, name: string, init: any) => Signal.Cell<any>,
  setSelected: (note: string) => void,
): data.CompiledNotes {
  const typeEnv = Render.initTypeEnv;
  const valueEnv = Render.initValueEnv(setSelected);
  orderedTags.forEach(tag => {
    const compiledNote = compiledNotes.get(tag);
    if (!compiledNote) {
      const parsedNote = parsedNotes.get(tag) || bug(`expected note for ${tag}`);
      if (debug) console.log('typechecking / rendering ' + tag);

      const moduleTypeEnv = Immutable.Map<string, Type.ModuleType>().asMutable();
      const moduleValueEnv = Immutable.Map<string, any>().asMutable();
      parsedNote.imports.forEach(tag => {
        const compiledNote = compiledNotes.get(tag);
        if (compiledNote) {
          Object.values(compiledNote.compiled).forEach(compiled => {
            compiled?.forEach(compiled => {
              // TODO(jaked) merge modules instead of overwriting
              moduleTypeEnv.set(tag, compiled.exportType);
              moduleValueEnv.set(tag, compiled.exportValue);
            })
          });
        }
      });

      const compiledNote =
        trace.time(tag, () =>
          compileNote(
            trace,
            parsedNote,
            typeEnv,
            valueEnv,
            moduleTypeEnv.asImmutable(),
            moduleValueEnv.asImmutable(),
            mkCell,
            setSelected
          )
        );
      compiledNotes = compiledNotes.set(tag, compiledNote);
    }
  });
  return compiledNotes;
}

function findImports(
  note: data.ParsedNote,
  notes: data.ParsedNotes
): data.ParsedNoteWithImports {
  let imports = new Set<string>();
  // TODO(jaked) separate imports for note components
  Object.keys(note.parsed).forEach(key => {
    switch (key) {
      case 'mdx': {
        // TODO(jaked) fix layout != tag hack
        // layouts shouldn't themselves have layouts
        // but we don't know here that we are defining a layout
        // and a directory-level .meta file can give a layout a layout
        if (note.meta.layout && note.meta.layout != note.tag)
          imports.add(note.meta.layout);
        const ast = note.parsed.mdx ?? bug(`expected parsed mdx`);
        ast.forEach(ast => findImportsMdx(ast, imports));
      }
      break;

      case 'table': {
        const dir = note.tag;
        const thisNote = note;
        notes.forEach(note => {
          // TODO(jaked) not sure if we should handle nested dirs in tables
          if (!Path.relative(dir, note.tag).startsWith('..') && note !== thisNote)
            imports.add(note.tag);
        });
      }
      break;
    }
  });
  return { ...note, imports };
}

export function compileNotes(
  trace: Trace,
  notesSignal: Signal<data.Notes>,
  mkCell: (module: string, name: string, init: any) => Signal.Cell<any>,
  setSelected: (note: string) => void,
): Signal<data.CompiledNotes> {
  const parsedNotesSignal = Signal.label('parseNotes',
    Signal.joinImmutableMap(Signal.mapImmutableMap(
      notesSignal,
      note => note.map(note => parseNote(trace, note))
    ))
  );

  const parsedNotesWithImportsSignal = Signal.label('parseNotesWithImports',
    Signal.mapWithPrev<data.ParsedNotes, data.ParsedNotesWithImports>(
      parsedNotesSignal,
      (parsedNotes, prevParsedNotes, prevParsedNotesWithImports) =>
        prevParsedNotesWithImports.withMutations(parsedNotesWithImports => {
          const { added, changed, deleted } = diffMap(prevParsedNotes, parsedNotes);

          deleted.forEach((v, tag) => { parsedNotesWithImports.delete(tag) });
          changed.forEach(([prev, curr], tag) => {
            parsedNotesWithImports.set(tag, trace.time(tag, () => findImports(curr, parsedNotes)))
          });
          added.forEach((v, tag) => {
            parsedNotesWithImports.set(tag, trace.time(tag, () => findImports(v, parsedNotes)))
          });
        }),
      Immutable.Map(),
      Immutable.Map()
    )
  );

  // TODO(jaked)
  // maybe could do this with more fine-grained Signals
  // but it's easier to do all together
  return Signal.label('compileNotes',
    Signal.mapWithPrev(
      parsedNotesWithImportsSignal,
      (parsedNotesWithImports, prevParsedNotesWithImports, compiledNotes) => {
        const { added, changed, deleted } = diffMap(prevParsedNotesWithImports, parsedNotesWithImports);

        changed.forEach((v, tag) => { compiledNotes = compiledNotes.delete(tag) });
        deleted.forEach((v, tag) => { compiledNotes = compiledNotes.delete(tag) });

        // topologically sort notes according to imports
        const orderedTags = trace.time('sortNotes', () => sortNotes(parsedNotesWithImports));

        // dirty notes that import a dirty note (post-sorting for transitivity)
        compiledNotes = trace.time('dirtyTransitively', () => dirtyTransitively(orderedTags, compiledNotes, parsedNotesWithImports));

        // compile dirty notes (post-sorting for dependency ordering)
        compiledNotes = trace.time('compileDirtyNotes', () => compileDirtyNotes(trace, orderedTags, parsedNotesWithImports, compiledNotes, mkCell, setSelected));
        return compiledNotes;
      },
      Immutable.Map(),
      Immutable.Map()
    )
  );
}
