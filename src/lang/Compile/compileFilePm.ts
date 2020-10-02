import JSON5 from 'json5';
import React from 'react';

import File from '../../files/File';
import Signal from '../../util/Signal';
import Try from '../../util/Try';
import * as data from '../../data';
import * as PMAST from '../../PMAST';
import Type from '../Type';

export const renderNode = (node: PMAST.Node) => {
  if ('text' in node) {
    return node.text;
  } else {
    switch (node.type) {
      case 'p': return React.createElement('p', {}, node.children.map(renderNode))
    }
  }
}

export default function compileFilePm(
  file: File, // TODO(jaked) take a PMAST.Node[] instead of reparsing
): Signal<data.CompiledFile> {
  const nodes = file.content.map(content => JSON5.parse(content) as PMAST.Node[]);

  const rendered = nodes.map(nodes => nodes.map(renderNode));

  return Signal.ok({
    exportType: Type.module({}),
    exportValue: { },
    rendered,
    problems: false,
    ast: Try.err(new Error('unimplemented')),
  });
}