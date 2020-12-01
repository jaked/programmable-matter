import * as Immutable from 'immutable';
import React from 'react';

import Signal from '../../util/Signal';
import * as Name from '../../util/Name';
import Type from '../Type';
import { Content, Contents, CompiledFile, CompiledNotes, Types } from '../../data';

import compileFile from './compileFile';
import groupFilesByName from './groupFilesByName';
import metaForPath from './metaForPath';

function mergeModuleType(
  t1: Signal<Type.ModuleType>,
  t2: Signal<Type.ModuleType>,
): Signal<Type.ModuleType> {
  return Signal.join(t1, t2).map(([t1, t2]) =>
    Type.module({
    ...t1.fields.reduce((obj, { _1: field, _2: type }) => ({ ...obj, [field]: type }), {}),
    ...t2.fields.reduce((obj, { _1: field, _2: type }) => ({ ...obj, [field]: type }), {}),
    })
  );
}

function mergeModuleValue(
  v1: Signal<{ [s: string]: Signal<any> }>,
  v2: Signal<{ [s: string]: Signal<any> }>,
): Signal<{ [s: string]: Signal<any> }> {
  return Signal.join(v1, v2).map(([v1, v2]) => ({ ...v1, ...v2 }));
}

export function compileFiles(
  files: Signal<Contents>,
  updateFile: (path: string, buffer: Buffer) => void,
  deleteFile: (path: string) => void,
  setSelected: (name: string) => void,
): { compiledFiles: Signal<Immutable.Map<string, Signal<CompiledFile>>>, compiledNotes: Signal<CompiledNotes> } {

  const filesByName = groupFilesByName(files);

  const compiledFilesRef = Signal.ref<Immutable.Map<string, Signal<CompiledFile>>>();

  const compiledNotesRef = Signal.ref<CompiledNotes>();

  const compiledFiles = Signal.mapImmutableMap(files, file =>
    Signal.label(
      file.path,
      compileFile(file, compiledFilesRef, compiledNotesRef, updateFile, deleteFile, setSelected)
    )
  );
  compiledFilesRef.set(compiledFiles);

  const compiledNotes: Signal<CompiledNotes> = Signal.mapImmutableMap(filesByName, (files, name) => {
    function fileForType(type: Types): Content | undefined {
      // TODO(jaked) fix names for index files, then just use name here instead of files
      return files.find(file => file.type === type);
    }

    function compiledFileForType(type: Types): Signal<CompiledFile | undefined> {
      // TODO(jaked) fix names for index files, then just use name here instead of files
      const file = files.find(file => file.type === type);
      if (file) {
        return compiledFiles.flatMap(compiledFiles =>
          compiledFiles.get(file.path) ?? Signal.ok(undefined)
        );
      } else {
        return Signal.ok(undefined);
      }
    }

    // TODO(jaked) Signal.untuple
    const parts =
      Signal.join(
        compiledFileForType('pm'),
        compiledFileForType('mdx'),
        compiledFileForType('table'),
        compiledFileForType('json'),
        compiledFileForType('jpeg'),
        compiledFileForType('meta'),
      ).map(([pm, mdx, table, json, jpeg, meta]) => {
        let rendered: Signal<React.ReactNode> = Signal.ok(null);
        let exportType: Signal<Type.ModuleType> = Signal.ok(Type.module({ }));
        let exportValue: Signal<{ [s: string]: Signal<any> }> = Signal.ok({});
        let publishedType: 'html' | 'jpeg' = 'html';

        if (meta) {
          rendered = meta.rendered;
          exportType = mergeModuleType(exportType, meta.exportType);
          exportValue = mergeModuleValue(exportValue, meta.exportValue);
        }
        if (table) {
          rendered = table.rendered;
          exportType = mergeModuleType(exportType, table.exportType);
          exportValue = mergeModuleValue(exportValue, table.exportValue);
        }
        if (json) {
          rendered = json.rendered;
          exportType = mergeModuleType(exportType, json.exportType);
          exportValue = mergeModuleValue(exportValue, json.exportValue);
        }
        if (jpeg) {
          publishedType = 'jpeg';
          rendered = jpeg.rendered;
          exportType = mergeModuleType(exportType, jpeg.exportType);
          exportValue = mergeModuleValue(exportValue, jpeg.exportValue);
        }
        if (mdx) {
          rendered = mdx.rendered;
          exportType = mergeModuleType(exportType, mdx.exportType);
          exportValue = mergeModuleValue(exportValue, mdx.exportValue);
        }
        if (pm) {
          rendered = pm.rendered;
          exportType = mergeModuleType(exportType, pm.exportType);
          exportValue = mergeModuleValue(exportValue, pm.exportValue);
        }

        // TODO(jaked) ugh optional Signal-valued fields are a pain
        const problems = Signal.join(
          (pm ? pm.problems : Signal.ok(false)),
          (mdx ? mdx.problems : Signal.ok(false)),
          (table ? table.problems : Signal.ok(false)),
          (json ? json.problems : Signal.ok(false)),
          (jpeg ? jpeg.problems : Signal.ok(false)),
          (meta ? meta.problems : Signal.ok(false))
        ).map(([pm, mdx, table, json, jpeg, meta]) =>
          pm || mdx || table || json || jpeg || meta
        );

        return {
          problems,
          rendered,
          publishedType,
          exportType,
          exportValue,
        };
      });
      return {
        name,
        publishedType: parts.map(parts => parts.publishedType),
        meta: metaForPath(Name.pathOfName(name, 'meta'), compiledFiles),
        files: {
          pm: fileForType('pm'),
          mdx: fileForType('mdx'),
          table: fileForType('table'),
          json: fileForType('json'),
          jpeg: fileForType('jpeg'),
          meta: fileForType('meta'),
        },
        problems: parts.flatMap(parts => parts.problems),
        rendered: parts.flatMap(parts => parts.rendered),
        exportType: parts.flatMap(parts => parts.exportType),
        exportValue: parts.flatMap(parts => parts.exportValue),
      };
  });
  compiledNotesRef.set(compiledNotes);

  return { compiledFiles, compiledNotes };
}
