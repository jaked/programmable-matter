import * as React from 'react';

// import { FixedSizeList } from 'react-window';
import RSCEditor, { Session } from './react-simple-code-editor';

import styled from 'styled-components';

import * as data from '../data';

import highlight from './highlight'

interface Props {
  view: data.Types;
  content: string;
  compiledFile: data.CompiledFile;
  session: Session;

  onChange: (content: string, session: Session) => void;
  setStatus: (status: string | undefined) => void;
  setSelected: (tag: string) => void;
}

const okComponents =
{
  default:    styled.span({ color: '#000000' }),
  atom:       styled.span({ color: '#221199' }),
  number:     styled.span({ color: '#116644' }),
  string:     styled.span({ color: '#aa1111' }),
  keyword:    styled.span({ color: '#770088' }),
  definition: styled.span({ color: '#0000ff' }),
  variable:   styled.span({ color: '#268bd2' }),
  property:   styled.span({ color: '#b58900' }),
  // TODO(jaked)
  // hover doesn't work because enclosing pre is not on top
  link:       styled.span`
    :hover {
      cursor: pointer;
    }
    color: #aa1111;
    text-decoration: underline;
  `,
}

const errStyle = { backgroundColor: '#ffc0c0' };

const errComponents =
{
  default:    styled(okComponents.default)(errStyle),
  atom:       styled(okComponents.atom)(errStyle),
  number:     styled(okComponents.number)(errStyle),
  string:     styled(okComponents.string)(errStyle),
  keyword:    styled(okComponents.keyword)(errStyle),
  definition: styled(okComponents.definition)(errStyle),
  variable:   styled(okComponents.variable)(errStyle),
  property:   styled(okComponents.property)(errStyle),
  link:       styled(okComponents.link)(errStyle),
}

export class Editor extends React.Component<Props, {}> {
  rscEditorRef = React.createRef<RSCEditor>();
  preRef = React.createRef<HTMLPreElement>();

  focus() {
    if (this.rscEditorRef.current) {
      this.rscEditorRef.current.focus();
    }
  }

  findHighlightSpan = (e: React.MouseEvent<HTMLTextAreaElement, MouseEvent>) => {
    if (!this.preRef.current) return;
    for (let i = 0; i < this.preRef.current.children.length; i++) {
      const child = this.preRef.current.children.item(i);
      if (child) {
        const clientRect = child.getBoundingClientRect();
        if (e.clientX >= clientRect.left && e.clientX <= clientRect.right &&
            e.clientY >= clientRect.top && e.clientY <= clientRect.bottom) {
          return (child as HTMLElement);
        }
      }
    }
  }

  onMouseEvent = (e: React.MouseEvent<HTMLTextAreaElement, MouseEvent>) => {
    const span = this.findHighlightSpan(e);
    if (span) {
      this.props.setStatus(span.dataset.status);
    } else {
      this.props.setStatus(undefined);
    }
  }

  onClick = (e: React.MouseEvent<HTMLTextAreaElement, MouseEvent>) => {
    const span = this.findHighlightSpan(e);
    if (span && span.dataset.link) {
      e.preventDefault();
      this.props.setSelected(span.dataset.link);
    }
  }

  render() {
    const { view, content, compiledFile } = this.props;
    const highlighted =
      highlight(okComponents, errComponents, view, content, compiledFile.ast, compiledFile.astAnnotations);
    return (
      <div style={{
        fontFamily: 'Monaco, monospace',
        fontSize: '14px',
      }}>
        <RSCEditor
          ref={this.rscEditorRef}
          preRef={this.preRef}
          value={content}
          session={this.props.session}
          onChange={this.props.onChange}
          highlight={_ => highlighted}
          onMouseOver={this.onMouseEvent}
          onMouseMove={this.onMouseEvent}
          onClick={this.onClick}
        />
      </div>
    );
  }
}
