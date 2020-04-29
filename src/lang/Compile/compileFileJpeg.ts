import * as React from 'react';
import Signal from '../../util/Signal';
import Trace from '../../util/Trace';
import Try from '../../util/Try';
import Type from '../Type';
import * as data from '../../data';

function compileJpeg(
  buffer: Buffer,
): data.Compiled {
  // TODO(jaked) parse JPEG file and return metadata
  const exportType = Type.module({ });
  const exportValue = { };

  const rendered = Signal.ok(
    React.createElement(
      'img',
      {
        // TODO(jaked) these URLs need to be freed
        // https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL
        // maybe we can wrap the img in a component that frees on prop change
        src: URL.createObjectURL(new Blob([buffer.buffer])),
        style: {
          maxWidth: '100%',
          objectFit: 'contain' // ???
        }
      }
    )
  );
  return { exportType, exportValue, rendered, problems: false };
}

export default function compileFileJpeg(
  trace: Trace,
  file: data.File
): Signal<data.CompiledFile> {
  return file.bufferCell.map(buffer => compileJpeg(buffer))
    .map(compiled => ({ ...compiled, ast: Try.ok(null) }));
}
