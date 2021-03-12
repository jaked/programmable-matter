import React from 'react';
import Frame, { FrameContextConsumer } from 'react-frame-component';

import Signal from '../util/Signal';

import * as model from '../model';
import * as PMAST from '../model/PMAST';

import { App } from '../app';

import { Session } from './react-simple-code-editor';

import { Catch } from './Catch';
import Sidebar from './search/Sidebar';
import Header from './Header'
import Editor from './Editor';
import RichTextEditor from './editor/RichTextEditor';

// TODO(jaked) straighten out dependencies
import { mouse } from '../lang/Render/initValueEnv';

interface Props {
  app: App;
}

type CodeEditorProps = {
  type: model.Types,
  content: Signal.Writable<string>;
  compiledFile: model.CompiledFile;
  session: Signal<Session>;
  setSession: Signal<(session: Session) => void>;
  setSelected: (selected: string | null) => void;
}

const CodeEditor = React.memo(React.forwardRef<Editor, CodeEditorProps>((props, ref) => {
  const content = Signal.useSignal(props.content);
  const session = Signal.useSignal(props.session);
  const setSession = Signal.useSignal(props.setSession);
  const onChange = (content: string, session: Session) => {
    setSession(session);
    props.content.setOk(content);
  }

  return (
    <Editor
      ref={ref}
      type={props.type}
      content={content}
      compiledFile={Signal.ok(props.compiledFile)}
      session={session}
      onChange={onChange}
      setSelected={props.setSelected}
    />
  );
}));

type RichEditorProps = {
  content: Signal.Writable<PMAST.Node[]>;
  moduleName: string;
  compiledFile: model.CompiledFile;
  setSelected: (selected: string | null) => void;
}

const RichEditor = React.memo(React.forwardRef<RichTextEditor, RichEditorProps>((props, ref) => {
  const nodes = Signal.useSignal(props.content);
  PMAST.validateNodes(nodes);
  const setValue = (nodes: PMAST.Node[]) => {
    props.content.setOk(nodes);
  }

  return (
    <RichTextEditor
      ref={ref}
      value={nodes}
      setValue={setValue}
      moduleName={props.moduleName}
      compiledFile={props.compiledFile}
      setSelected={props.setSelected}
    />
  );
}));

type StatusProps = {
  astAnnotations: Signal<model.AstAnnotations | undefined>;
  mouse: Signal<{ clientX: number, clientY: number }>;
}

const Status = (props: StatusProps) => {
  const _astAnnotations = Signal.useSignal(props.astAnnotations);
  const mouse = Signal.useSignal(props.mouse);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (ref.current) {
      // we need to run this in an effect after the doc is rendered
      // since it relies on the rendered DOM
      const elem = document.elementFromPoint(mouse.clientX, mouse.clientY);

      let status: string | undefined = undefined;
      if (elem) {
        // Slate wraps an extra span around the text
        // so the element with the status field is its parent
        const parent = elem.parentElement;
        if (parent) {
          status = (parent as HTMLElement).dataset.status;
        }
      }

      ref.current.textContent = status ?? null;
    }
  });
  return <div ref={ref} style={{ backgroundColor: '#ffc0c0' }}></div>
}

type EditorPaneProps = {
  moduleName: Signal<string | null>;
  selectedFile: Signal<model.WritableContent | null>;
  compiledFile: Signal<model.CompiledFile | null>;
  session: Signal<Session>;
  setSession: Signal<(session: Session) => void>;
  mouse: Signal<{ clientX: number, clientY: number }>;
  setSelected: (selected: string | null) => void;
}

type EditorPane = {
  focus: () => void
}

const EditorPane = React.memo(React.forwardRef<Editor, EditorPaneProps>((props, ref) => {
  // TODO(jaked) use Signal.join here? not sure about lifetime
  const selectedFile = Signal.useSignal(props.selectedFile);
  const moduleName = Signal.useSignal(props.moduleName);
  const compiledFile = Signal.useSignal(props.compiledFile);
  const richEditorRef = React.useRef<RichTextEditor>(null);
  const codeEditorRef = React.useRef<Editor>(null);

  React.useImperativeHandle(ref, () => ({
    focus: () => {
      if (richEditorRef.current) {
        richEditorRef.current.focus();
      }
      if (codeEditorRef.current) {
        codeEditorRef.current.focus();
      }
    }
  }));

  return (
    <div style={{
      height: '100%',
      display: 'grid',
      gridTemplateRows: '1fr auto',
      padding: '8px',
    }}>
      {
        selectedFile === null || moduleName === null || compiledFile == null ? 'no note' :
        selectedFile.type === 'pm' ?
          <RichEditor
            ref={richEditorRef}
            // TODO(jaked) Signal function to project from a Writable
            content={(selectedFile.content as Signal.Writable<model.PMContent>).mapWritable(
              content => content.nodes,
              nodes => ({ nodes, meta: (selectedFile.content.get() as model.PMContent).meta })
            )}
            moduleName={moduleName}
            compiledFile={compiledFile}
            setSelected={props.setSelected}
          /> :
          <CodeEditor
            ref={codeEditorRef}
            type={selectedFile.type}
            content={selectedFile.content as Signal.Writable<string>}
            compiledFile={compiledFile}
            session={props.session}
            setSession={props.setSession}
            setSelected={props.setSelected}
          />
      }
      { compiledFile ?
        <Status astAnnotations={compiledFile.astAnnotations ?? Signal.ok(undefined)} mouse={props.mouse} /> :
        null
      }
    </div>
  );
}));

type DisplayPaneProps = {
  compiledNoteSignal: Signal<model.CompiledNote | null>;
}

const DisplayPane = React.memo((props: DisplayPaneProps) =>
  <Frame
    style={{
      flex: 1,
      width: '100%',
      minWidth: 0,
      height: '100%',
      borderStyle: 'none'
    }}
  >
    <FrameContextConsumer>{
      ({ document }) => {
        document.onmousemove = (e: MouseEvent) => {
          mouse.setOk({ clientX: e.clientX, clientY: e.clientY });
        }

        return Signal.node(
          props.compiledNoteSignal.flatMap(compiledNote =>
            compiledNote ?
              compiledNote.rendered :
              Signal.ok('no note')
          )
        );
      }
    }</FrameContextConsumer>
  </Frame>
);

type Main = {
  focusSearchBox: () => void;
}

const Main = React.forwardRef<Main, Props>((props, ref) => {
  const sideBarVisible = Signal.useSignal(props.app.sideBarVisibleCell);
  const mainPaneView = Signal.useSignal(props.app.mainPaneViewCell);

  const sidebarRef = React.useRef<Sidebar>(null);
  const editorRef = React.useRef<EditorPane>(null);

  // TODO(jaked) necessary to avoid spurious rerenders until Main is memoized
  const focusEditor = React.useCallback(() => {
    editorRef.current && editorRef.current.focus();
  }, []);

  const focusSearchBox = () => {
    sidebarRef.current && sidebarRef.current.focusSearchBox();
  }

  React.useImperativeHandle(ref, () => ({
    focusSearchBox
  }))

  const [showEditorPane, showDisplayPane] = (
    mainPaneView === 'code' ? [true, false] :
    mainPaneView === 'display' ? [false, true] :
    /* props.app.mainPaneView === 'split' ? */ [true, true]
  );

  // TODO(jaked) this all seems really manual, there's gotta be a better way
  let gridTemplateColumns = '';
  let gridTemplateAreasRow1 = '';
  let gridTemplateAreasRow2 = '';
  if (sideBarVisible) {
    gridTemplateColumns += '20% ';
    gridTemplateAreasRow1 += 'sidebar ';
    gridTemplateAreasRow2 += 'sidebar ';
  }
  if (showEditorPane) {
    gridTemplateColumns += '2fr ';
    gridTemplateAreasRow1 += 'header ';
    gridTemplateAreasRow2 += 'editor ';
  }
  if (showDisplayPane) {
    gridTemplateColumns += '2fr ';
    gridTemplateAreasRow1 += 'header ';
    gridTemplateAreasRow2 += 'display ';
  }

  return (
    <div style={{
      height: '100vh',
      display: 'grid',
      gridTemplateColumns,
      gridTemplateRows: 'auto 1fr',
      gridTemplateAreas: `"${gridTemplateAreasRow1}" "${gridTemplateAreasRow2}"`,
      overflow: 'auto',
    }}>
      { sideBarVisible &&
        <div style={{
          gridArea: 'sidebar',
          overflow: 'auto',
          borderRightWidth: '1px',
          borderRightStyle: 'solid',
          borderRightColor: '#cccccc',
        }}>
          <Catch>
            <Sidebar
              ref={sidebarRef}
              compiledNotes={props.app.compiledNotesSignal}
              selected={props.app.selectedCell}
              setSelected={props.app.setSelected}
              maybeSetSelected={props.app.maybeSetSelected}
              focusDir={props.app.focusDirCell}
              setFocusDir={props.app.setFocusDir}
              onNewNote={props.app.onNewNoteSignal}
              focusEditor={focusEditor}
            />
          </Catch>
        </div>
      }
      <div style={{ gridArea: 'header' }}>
        <Header
          name={props.app.selectedCell}
          setName={props.app.setNameSignal}
          editName={props.app.editNameCell}
          setEditName={props.app.setEditName}
          focusEditor={focusEditor}
          selectedNoteProblems={props.app.selectedNoteProblemsSignal}
          />
      </div>
      { showEditorPane &&
        <div style={{
          gridArea: 'editor',
          overflow: 'auto',
          borderRightWidth: showDisplayPane ? '1px' : '0px',
          borderRightStyle: 'solid',
          borderRightColor: '#cccccc',
        }}>
          <Catch>
            <EditorPane
              ref={editorRef}
              selectedFile={props.app.selectedFileSignal}
              moduleName={props.app.selectedCell}
              compiledFile={props.app.compiledFileSignal}
              session={props.app.sessionSignal}
              mouse={props.app.mouseSignal}
              setSession={props.app.setSessionSignal}
              setSelected={props.app.setSelected}
            />
          </Catch>
        </div>
      }
      { showDisplayPane &&
        <div style={{
          gridArea: 'display',
          overflow: 'auto'
        }}>
          <Catch>
            <DisplayPane
              compiledNoteSignal={props.app.compiledNoteSignal}
            />
          </Catch>
        </div>
      }
    </div>
  );
});

export default Main;

