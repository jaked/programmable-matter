import * as Immutable from 'immutable';

import * as React from 'react';
import 'regenerator-runtime/runtime'; // required for react-inspector
import { Inspector } from 'react-inspector';

import { Cell } from '../util/Cell';
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

function parseMdx(content: string): data.Parsed<MDXHAST.Root> {
  const ast = Parser.parse(content);
  const imports = new Set<string>();
  findImportsMdx(ast, imports);
  return { ast, imports };
}

function parseJson(content: string): data.Parsed<AcornJsxAst.Expression> {
  const ast = Parser.parseExpression(content);
  const imports = new Set<string>();
  return { ast, imports };
}

function parseNote(note: data.Note): data.Note {
  switch (note.type) {
    case 'mdx': {
      const parsed = Try.apply(() => parseMdx(note.content));
      return Object.assign({}, note, { parsed });
    }

    case 'json': {
      const parsed = Try.apply(() => parseJson(note.content));
      return Object.assign({}, note, { parsed });
    }

    default:
      throw new Error(`unhandled note type '${note.type}' for '${note.tag}'`);
  }
}

// also computes imports
function parseDirtyNotes(
  notes: data.Notes,
  dirty: Set<string>
) {
  return notes.map((note, tag) => {
    if (dirty.has(tag)) {
      return parseNote(note);
    } else {
      return note;
    }
  });
}

function sortNotes(notes: data.Notes): Array<string> {
  const orderedTags: Array<string> = [];
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
        if (imports.every(tag => orderedTags.includes(tag))) {
          if (debug) console.log('adding ' + tag + ' to order');
          orderedTags.push(tag);
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
    orderedTags.push(tag)
  });
  return orderedTags;
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

function compileMdx(
  ast: MDXHAST.Root,
  capitalizedTag: string,
  moduleTypeEnv: Immutable.Map<string, Type.ModuleType>,
  moduleValueEnv: Evaluator.Env,
  mkCell: (module: string, name: string, init: any) => Cell<any>,
): data.Compiled {
  const exportTypes: { [s: string]: [Type.Type, boolean] } = {};
  const exportValue: { [s: string]: any } = {};
  Typecheck.checkMdx(ast, moduleTypeEnv, Render.initTypeEnv, exportTypes);
  const exportType = Type.module(exportTypes);
  // TODO(jaked)
  // first call to renderMdx computes exportType / exportValue
  // second call picks up current values of signals
  // instead we should render to a Signal<React.ReactNode>
  // and update() it to pick up current values
  Render.renderMdx(ast, capitalizedTag, moduleValueEnv, Render.initValueEnv, mkCell, exportValue);
  const rendered = () => {
    const [_, node] =
      Render.renderMdx(ast, capitalizedTag, moduleValueEnv, Render.initValueEnv, mkCell, exportValue);
    return node;
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

function compileNote(
  note: data.Note,
  moduleTypeEnv: Immutable.Map<string, Type.ModuleType>,
  valueEnv: Evaluator.Env,
  mkCell: (module: string, name: string, init: any) => Cell<any>,
): Try<data.Compiled> {
  return Try.apply(() => {
    switch (note.type) {
      case 'mdx':
        if (!note.parsed) throw new Error('expected note.parsed');
        return compileMdx(
          note.parsed.get().ast,
          String.capitalize(note.tag),
          moduleTypeEnv,
          valueEnv,
          mkCell
        );

      case 'json': {
        if (!note.parsed) throw new Error('expected note.parsed');
        return compileJson(note.parsed.get().ast);
      }

      default:
        throw new Error(`unhandled note type '${note.type}'`);
    }
  });
}

function compileDirtyNotes(
  orderedTags: Array<string>,
  notes: data.Notes,
  dirty: Set<string>,
  mkCell: (module: string, name: string, init: any) => Cell<any>,
): data.Notes {
  let moduleTypeEnv: Immutable.Map<string, Type.ModuleType> = Immutable.Map();
  let moduleValueEnv: Evaluator.Env = Immutable.Map();
  orderedTags.forEach(tag => {
    const note = notes.get(tag);
    if (!note) throw new Error('expected note');
    if (dirty.has(tag)) {
      if (debug) console.log('typechecking / rendering' + tag);
      const compiled = compileNote(note, moduleTypeEnv, moduleValueEnv, mkCell);
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
  oldNotes: data.Notes,
  notes: data.Notes,
  mkCell: (module: string, name: string, init: any) => Cell<any>,
): data.Notes {
  // TODO(jaked)
  // maybe we should propagate a change set
  // instead of the current state of the filesystem

  // tracks notes that must be re-parsed / re-compiled
  const dirty = new Set<string>();

  // mark changed notes dirty, retain parsed / compiled fields on others
  notes = dirtyChangedNotes(oldNotes, notes, dirty);

  // parse dirty notes + compute imports
  notes = parseDirtyNotes(notes, dirty);

  // topologically sort notes according to imports
  const orderedTags = sortNotes(notes);

  // mark deleted notes dirty so dependents are rebuilt
  dirtyDeletedNotes(oldNotes, notes, dirty);

  // dirty notes that import a dirty note (post-sorting for transitivity)
  dirtyTransitively(orderedTags, notes, dirty);

  // compile dirty notes (post-sorting for dependency ordering)
  return compileDirtyNotes(orderedTags, notes, dirty, mkCell);
}
