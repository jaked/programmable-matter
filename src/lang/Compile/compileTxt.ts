import * as React from 'react';
import Signal from '../../util/Signal';
import Type from '../Type';
import * as data from '../../data';

export default function compileTxt(
  content: string
): data.Compiled {
  const exportType = Type.module({ default: Type.string });
  const exportValue = { default: Signal.ok(content) }
  const rendered = Signal.ok(
    React.createElement('pre', null, content)
  );
  return { exportType, exportValue, rendered };
}
