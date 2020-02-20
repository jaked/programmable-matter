import * as Immutable from 'immutable';
import JSON5 from 'json5';
import Try from '../../util/Try';
import * as String from '../../util/String';
import Trace from '../../util/Trace';
import { bug } from '../../util/bug';
import Type from '../Type';
import Typecheck from '../Typecheck';
import * as Evaluate from '../Evaluate';
import * as data from '../../data';
import { ModuleValueEnv } from './index';
import compileJpeg from './compileJpeg';
import compileJson from './compileJson';
import compileMdx from './compileMdx';
import compileTable from './compileTable';
import compileTxt from './compileTxt';

export default function compileNote(
  trace: Trace,
  parsedNote: data.ParsedNoteWithImports,
  typeEnv: Typecheck.Env,
  valueEnv: Evaluate.Env,
  moduleTypeEnv: Immutable.Map<string, Type.ModuleType>,
  moduleValueEnv: ModuleValueEnv,
  updateFile: (path: string, buffer: Buffer) => void,
  setSelected: (tag: string) => void,
): data.CompiledNote {
  // TODO(jaked) Object.map or wrap object in helper
  let compiled = Object.keys(parsedNote.content).reduce<data.NoteCompiled>(
    (obj, key) => {
      switch (key) {
        case 'json': {
          const ast = parsedNote.parsed.json ?? bug(`expected parsed json`);
          const file = parsedNote.files.json ?? bug(`expected json file`);
          const updateJsonFile = (obj: any) => {
            updateFile(file.path, Buffer.from(JSON5.stringify(obj, undefined, 2), 'utf-8'));
          }
          const json = Try.apply(() => compileJson(
            ast.get(),
            parsedNote.meta,
            updateJsonFile
          ));
          return { ...obj, json };
        }

        case 'txt': {
          const content = parsedNote.content.txt ?? bug(`expected txt content`);
          const txt = Try.apply(() => compileTxt(content));
          return { ...obj, txt };
        }

        case 'jpeg': {
          const jpeg = Try.apply(() => compileJpeg(
            parsedNote.tag
          ));
          return { ...obj, jpeg };
        }

        case 'table': {
          const table = Try.apply(() => compileTable(
            trace,
            parsedNote,
            moduleTypeEnv,
            moduleValueEnv,
            setSelected
          ));
          return { ...obj, table };
        }

        case 'meta': return obj;
        case 'mdx': return obj; // handled below

        default:
          throw new Error(`unhandled note type '${key}'`);
      }
    },
    {}
  );

  if (typeof parsedNote.parsed.mdx !== 'undefined') {
    if (typeof compiled.json !== 'undefined' && compiled.json.type === 'ok') {
      // TODO(jaked) immutable data files?
      const dataType = compiled.json.ok.exportType.get('mutable');
      const dataValue = compiled.json.ok.exportValue['mutable'];
      if (typeof dataType !== 'undefined' && typeof dataValue !== 'undefined') {
        typeEnv = typeEnv.set('data', dataType);
        valueEnv = valueEnv.set('data', dataValue);
      }
    }

    if (typeof compiled.table !== 'undefined' && compiled.table.type === 'ok') {
      const tableType = compiled.table.ok.exportType.get('default');
      const tableValue = compiled.table.ok.exportValue['default'];
      if (typeof tableType !== 'undefined' && typeof tableValue !== 'undefined') {
        typeEnv = typeEnv.set('table', tableType);
        valueEnv = valueEnv.set('table', tableValue);
      }
    }

    const ast = parsedNote.parsed.mdx;
    const mdx = Try.apply(() => compileMdx(
      trace,
      ast.get(),
      String.capitalize(parsedNote.tag),
      parsedNote.meta,
      typeEnv,
      valueEnv,
      moduleTypeEnv,
      moduleValueEnv,
    ));
    compiled = { ...compiled, mdx };
  }

  return { ...parsedNote, compiled };
}
