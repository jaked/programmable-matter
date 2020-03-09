import * as Immutable from 'immutable';
import Signal from '../../util/Signal';
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

// TODO(jaked) recompile only changed note parts
export default function compileNote(
  trace: Trace,
  parsedNote: data.ParsedNoteWithImports,
  typeEnv: Typecheck.Env,
  valueEnv: Evaluate.Env,
  moduleTypeEnv: Signal<Immutable.Map<string, Type.ModuleType>>,
  moduleValueEnv: Signal<ModuleValueEnv>,
  updateFile: (path: string, buffer: Buffer) => void,
  setSelected: (tag: string) => void,
): data.CompiledNote {
  // TODO(jaked) Object.map or wrap object in helper
  let compiled = Object.keys(parsedNote.content).reduce<data.NoteCompiled>(
    (obj, key) => {
      switch (key) {
        case 'json': {
          const file = parsedNote.files.json ?? bug(`expected json file`);
          const ast = parsedNote.parsed.json ?? bug(`expected parsed json`);
          const json =
            Signal.join(file, ast, parsedNote.meta).map(([file, ast, meta]) =>
              compileJson(file, ast, meta, updateFile)
            );
          return { ...obj, json };
        }

        case 'jpeg': {
          const file = parsedNote.files.jpg ?? bug(`expected jpg file`);
          const jpeg = file.map(file => compileJpeg(parsedNote.tag));
          return { ...obj, jpeg };
        }

        case 'table': {
          const table =
            Signal.join(
              moduleTypeEnv,
              moduleValueEnv,
              parsedNote.imports
            ).map(([moduleTypeEnv, moduleValueEnv, imports]) =>
              compileTable(
                trace,
                parsedNote.tag,
                imports,
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

  if (parsedNote.parsed.mdx) {
    const mdx =
      Signal.join(
        moduleTypeEnv,
        moduleValueEnv,
        compiled.json ?? Signal.ok(undefined),
        compiled.table ?? Signal.ok(undefined),
        parsedNote.parsed.mdx,
        parsedNote.meta
      ).map(([moduleTypeEnv, moduleValueEnv, json, table, mdx, meta]) => {
        if (json) {
          const dataType = json.exportType.get('mutable');
          const dataValue = json.exportValue['mutable'];
          if (dataType && dataValue) {
            typeEnv = typeEnv.set('data', dataType);
            valueEnv = valueEnv.set('data', dataValue);
          }
        }

        if (table) {
          const tableType = table.exportType.get('default');
          const tableValue = table.exportValue['default'];
          if (tableType && tableValue) {
            typeEnv = typeEnv.set('table', tableType);
            valueEnv = valueEnv.set('table', tableValue);
          }
        }

        return compileMdx(
          trace,
          mdx,
          String.capitalize(parsedNote.tag),
          meta,
          typeEnv,
          valueEnv,
          moduleTypeEnv,
          moduleValueEnv,
        );
      });
    compiled = { ...compiled, mdx };
  }

  return { ...parsedNote, compiled };
}
