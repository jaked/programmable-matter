import * as React from 'react';
import Signal from '../../util/Signal';
import Trace from '../../util/Trace';
import Try from '../../util/Try';
import * as Tag from '../../util/Tag';
import Type from '../Type';
import * as data from '../../data';

function compileJpeg(
  tag: string,
): data.Compiled {
  // TODO(jaked) parse JPEG file and return metadata
  const exportType = Type.module({ });
  const exportValue = { };

  const rendered = Signal.ok(
    // it doesn't seem to be straightforward to create an img node
    // directly from JPEG data, so we serve it via the dev server
    // TODO(jaked) plumb port from top-level
    React.createElement(
      'img',
      {
        src: `http://localhost:3000/${tag}.jpeg`,
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
  // TODO(jaked) this probably doesn't update when the file data is changed,
  // since it's the same URL in the render tree
  // maybe we need a cache-busting arg?
  return file.bufferCell.map(_ => compileJpeg(Tag.tagOfPath(file.path)))
    .map(compiled => ({ ...compiled, ast: Try.ok(null) }));
}
