import * as React from 'react';
import * as data from '../../data';
import Signal from '../../util/Signal';
import Type from '../Type';

export default function compileJpeg(
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
  return { exportType, exportValue, rendered, problems: false };
}
