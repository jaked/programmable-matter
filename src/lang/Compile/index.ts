import React from 'react';

import { bug } from '../../util/bug';
import Signal from '../../util/Signal';
import * as Name from '../../util/Name';
import Type from '../Type';
import * as model from '../../model';

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
  v1: Signal<Map<string, Signal<unknown>>>,
  v2: Signal<Map<string, Signal<unknown>>>,
): Signal<Map<string, Signal<unknown>>> {
  return Signal.join(v1, v2).map(([v1, v2]) => new Map([...v1.entries(), ...v2.entries()]));
}

export function compileFiles(
  files: Signal<model.WritableContents>,
  updateFile: (path: string, buffer: Buffer) => void = (path: string, buffer: Buffer) => { },
  deleteFile: (path: string) => void = (path: string) => { },
  setSelected: (name: string) => void = (name: string) => { },
): { compiledFiles: Signal<Map<string, model.CompiledFile>>, compiledNotes: Signal<model.CompiledNotes> } {

  const filesByName = groupFilesByName(files);

  const compiledFilesRef = Signal.ref<Map<string, model.CompiledFile>>();

  const compiledNotesRef = Signal.ref<model.CompiledNotes>();

  const compiledFiles = Signal.mapMap(files, file =>
    compileFile(file, compiledFilesRef, compiledNotesRef, updateFile, deleteFile, setSelected)
  );
  compiledFilesRef.set(compiledFiles);

  const compiledNotes: Signal<model.CompiledNotes> = Signal.mapMap(filesByName, (files, name) => {
    function fileForType(type: model.Types): model.Content | undefined {
      return files.get(Name.pathOfName(name, type));
    }

    function compiledFileForType(type: model.Types): Signal<model.CompiledFile> | undefined {
      const file = fileForType(type);
      if (file) {
        return compiledFiles.map(compiledFiles =>
          compiledFiles.get(file.path) ?? bug(`expected compiled file`)
        );
      }
    }

    const pmCompiled = compiledFileForType('pm');
    const tableCompiled = compiledFileForType('table');
    const jsonCompiled = compiledFileForType('json');
    const jpegCompiled = compiledFileForType('jpeg');
    const metaCompiled = compiledFileForType('meta');
    const xmlCompiled = compiledFileForType('xml');
    let type: model.Types | undefined = undefined;
    if (metaCompiled) type = 'meta';
    if (tableCompiled) type = 'table';
    if (jsonCompiled) type = 'json';
    if (jpegCompiled) type = 'jpeg';
    if (pmCompiled) type = 'pm';
    if (xmlCompiled) type = 'xml';
    if (!type) bug(`expected type`);

    // TODO(jaked) Signal.untuple
    const parts =
      Signal.join(
        pmCompiled ?? Signal.ok(undefined),
        tableCompiled ?? Signal.ok(undefined),
        jsonCompiled ?? Signal.ok(undefined),
        jpegCompiled ?? Signal.ok(undefined),
        metaCompiled ?? Signal.ok(undefined),
        xmlCompiled ?? Signal.ok(undefined),
      ).map(([pm, table, json, jpeg, meta, xml]) => {
        let rendered: Signal<React.ReactNode> = Signal.ok(null);
        let exportType: Signal<Type.ModuleType> = Signal.ok(Type.module({ }));
        let exportValue: Signal<Map<string, Signal<unknown>>> = Signal.ok(new Map());

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
          rendered = jpeg.rendered;
          exportType = mergeModuleType(exportType, jpeg.exportType);
          exportValue = mergeModuleValue(exportValue, jpeg.exportValue);
        }
        if (pm) {
          rendered = pm.rendered;
          exportType = mergeModuleType(exportType, pm.exportType);
          exportValue = mergeModuleValue(exportValue, pm.exportValue);
        }
        if (xml) {
          rendered = xml.rendered;
          exportType = mergeModuleType(exportType, xml.exportType);
          exportValue = mergeModuleValue(exportValue, xml.exportValue);
        }

        // TODO(jaked) ugh optional Signal-valued fields are a pain
        const problems = Signal.join(
          (pm ? pm.problems : Signal.ok(false)),
          (table ? table.problems : Signal.ok(false)),
          (json ? json.problems : Signal.ok(false)),
          (jpeg ? jpeg.problems : Signal.ok(false)),
          (meta ? meta.problems : Signal.ok(false)),
          (xml ? xml.problems : Signal.ok(false)),
        ).map(([pm, table, json, jpeg, meta, xml]) =>
          pm || table || json || jpeg || meta || xml
        );

        return {
          problems,
          rendered,
          exportType,
          exportValue,
        };
      });
      let meta: Signal<model.Meta>;
      if (type === 'pm') {
        const pmContent = fileForType('pm') ?? bug(`expected pm`);
        meta = pmContent.content.map(content => {
          const pmContent = content as model.PMContent;
          return pmContent.meta;
        })

      // TODO(jaked) temporary hack
      } else if (type === 'xml') {
        meta = Signal.ok({ publish: true });

      } else {
        meta = metaForPath(Name.pathOfName(name, 'meta'), compiledFiles);
      }
      return {
        name,
        type,
        meta,
        files: {
          pm: fileForType('pm'),
          table: fileForType('table'),
          json: fileForType('json'),
          jpeg: fileForType('jpeg'),
          meta: fileForType('meta'),
          xml: fileForType('xml'),
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
