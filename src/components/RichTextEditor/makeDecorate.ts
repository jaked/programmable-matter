import { Node, Path } from 'slate';
import * as ESTree from '../../estree';
import * as model from '../../model';
import * as PMAST from '../../pmast';
import colorOfTokenType from '../../highlight/colorOfTokenType';
import { computeJsSpans } from '../../highlight/computeJsSpans';
import { computeRanges } from '../../highlight/prism';
import { Range, Span } from '../../highlight/types';
import * as Parse from '../../parse';
import { bug } from '../../util/bug';
import Try from '../../util/Try';

export default (interfaceMap: model.InterfaceMap) =>
  ([node, path]: [Node, Path]) => {
    // TODO(jaked) cache decorations?

    if (PMAST.isLiveCode(node) || PMAST.isInlineLiveCode(node)) {
      const ranges: Range[] = [];
      const code: Try<ESTree.Node> | null =
        PMAST.isLiveCode(node) ? Parse.parseLiveCodeNode(node) :
        PMAST.isInlineLiveCode(node) ? Parse.parseInlineLiveCodeNode(node) :
        null;
      if (code) {
        code.forEach(code => {
          const spans: Span[] = [];
          computeJsSpans(code, interfaceMap, spans);
          for (const span of spans) {
            const range: Range = {
              anchor: { path, offset: span.start },
              focus: { path, offset: span.end },
              color: colorOfTokenType(span.tokenType),
            }
            if ('status' in span) range.status = span.status;
            if ('link' in span) range.link = span.link;
            ranges.push(range);
          }
        })
      }
      return ranges;

    } else if (PMAST.isCode(node) && node.language) {
      if (!(node.children.length === 1)) bug('expected 1 child');
      const child = node.children[0];
      if (!(PMAST.isText(child))) bug('expected text');
      const code = child.text;
      return computeRanges(path, code, node.language);

    } else {
      return [];
    }
  }
