import React from 'react';
import Frame, { FrameContextConsumer } from 'react-frame-component';
import { Range } from 'slate';

import Signal from '../util/Signal';

import * as model from '../model';
import * as PMAST from '../model/PMAST';

import * as App from '../app';
import * as SelectedNote from '../app/selectedNote';
import * as Compiled from '../app/compiled';

import { Session } from './react-simple-code-editor';

import { Catch } from './Catch';
import SearchBox from './search/SearchBox';
import Notes from './search/Notes';
import Header from './Header'
import Editor from './Editor';
import RichTextEditor from './editor/RichTextEditor';

// TODO(jaked) straighten out dependencies
import { mouse } from '../lang/Render/initEnv';
import { window as windowSignal } from '../lang/Render/initEnv';

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
  content: Signal.Writable<model.PMContent>;
  moduleName: string;
  compiledFile: model.CompiledFile;
  setSelected: (selected: string | null) => void;
}

const RichEditor = React.memo((props : RichEditorProps) => {
  const { children, selection, meta } = Signal.useSignal(props.content);
  const setValue = ({ children, selection }: { children: PMAST.Node[], selection: null | Range }) => {
    props.content.setOk({ children, selection, meta });
  }

  return (
    <RichTextEditor
      value={{ children, selection }}
      setValue={setValue}
      moduleName={props.moduleName}
      compiledFile={props.compiledFile}
      setSelected={props.setSelected}
    />
  );
});

type StatusProps = {
  mouse: Signal<{ clientX: number, clientY: number }>;
}

const Status = (props: StatusProps) => {
  const mouse = Signal.useSignal(props.mouse);
  const [ status, setStatus ] = React.useState<undefined | string>(undefined);
  React.useLayoutEffect(() => {
    // we need to run this in an effect after the doc is rendered
    // since it relies on the rendered DOM
    const elem = document.elementFromPoint(mouse.clientX, mouse.clientY);

    let status: undefined | string = undefined;
    if (elem) {
      // Slate wraps an extra span around the text
      // so the element with the status field is its parent
      const parent = elem.parentElement;
      if (parent) {
        status = (parent as HTMLElement).dataset.status;
      }
    }
    setStatus(status);
  }, [mouse]);
  return (<>
    {status && <div style={{ padding: '8px', backgroundColor: '#ffc0c0' }}>{status}</div>}
  </>);
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

  return (
    <div style={{
      height: '100%',
      display: 'grid',
      gridTemplateRows: '1fr auto',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '8px', overflow: 'auto'}}>
      {
        selectedFile === null || moduleName === null || compiledFile == null ? 'no note' :
        selectedFile.type === 'pm' ?
          <RichEditor
            // TODO(jaked) Signal function to project from a Writable
            content={selectedFile.content as Signal.Writable<model.PMContent>}
            moduleName={moduleName}
            compiledFile={compiledFile}
            setSelected={props.setSelected}
          /> :
          <CodeEditor
            type={selectedFile.type}
            content={selectedFile.content as Signal.Writable<string>}
            compiledFile={compiledFile}
            session={props.session}
            setSession={props.setSession}
            setSelected={props.setSelected}
          />
      }
      </div>
        <Status mouse={props.mouse} />
    </div>
  );
}));

type DisplayPaneWithHooksProps = {
  compiledNoteSignal: Signal<model.CompiledNote | null>;
  // TODO(jaked) fix types
  document: any;
  window: any;
}

// can't use hooks directly inside FrameContextConsumer
const DisplayPaneWithHooks = (props : DisplayPaneWithHooksProps) => {
  const onMousemove = (e: MouseEvent) => {
    mouse.setOk({ clientX: e.clientX, clientY: e.clientY });
  }

  const onScrollOrResize = () => {
    windowSignal.setOk({
      innerWidth: props.window.innerWidth,
      innerHeight: props.window.innerHeight,
      scrollX: props.window.scrollX,
      scrollY: props.window.scrollY,
    });
  }

  React.useEffect(() => {
    onScrollOrResize();
    props.document.addEventListener('mousemove', onMousemove);
    props.document.addEventListener('scroll', onScrollOrResize);
    props.window.addEventListener('resize', onScrollOrResize);
    return () => {
      props.document.removeEventListener('mousemove', onMousemove);
      props.document.removeEventListener('scroll', onScrollOrResize);
      props.window.removeEventListener('resize', onScrollOrResize);
    }
  }, []);

  return Signal.node(
    props.compiledNoteSignal.flatMap(compiledNote =>
      compiledNote ?
        compiledNote.rendered :
        Signal.ok('no note')
    )
  );
}

type DisplayPaneProps = {
  compiledNoteSignal: Signal<model.CompiledNote | null>;
}

const DisplayPane = React.memo((props: DisplayPaneProps) =>
  <Frame
    style={{
      width: '100%',
      height: '100%',
      borderStyle: 'none'
    }}
    // everything up the tree needs to have height: 100% for auto-resize to work
    // the -16px accounts for 8px margin on the body
    // but this does not work when the top element has a > 8px margin
    // (that is collapsed into the body margin)
    // TODO(jaked) fix this insanity. maybe just don't use auto-resize
    initialContent={`<!DOCTYPE html><html style='height:100%'><head><style>.frame-content{height:100%}</style></head><body style='height:calc(100% - 16px)'><div style='height:100%' class="frame-root"></div></body></html>`}
  >
    <FrameContextConsumer>{
      ({ document, window }) =>
        <DisplayPaneWithHooks
          compiledNoteSignal={props.compiledNoteSignal}
          document={document}
          window={window}
        />
    }</FrameContextConsumer>
  </Frame>
);

const Main = () => {
  const sideBarVisible = Signal.useSignal(App.sideBarVisibleCell);
  const mainPaneView = Signal.useSignal(App.mainPaneViewCell);

  const editorRef = React.useRef<EditorPane>(null);

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
    gridTemplateAreasRow1 += 'searchbox ';
    gridTemplateAreasRow2 += 'notes ';
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
      overflow: 'hidden',
    }}>
      { sideBarVisible &&
        <div style={{
          gridArea: 'searchbox',
          overflow: 'hidden',
          borderRightWidth: '1px',
          borderRightStyle: 'solid',
          borderRightColor: '#cccccc',
        }}>
          <Catch>
            <SearchBox />
          </Catch>
        </div>
      }
      { sideBarVisible &&
        <div style={{
          gridArea: 'notes',
          overflow: 'hidden',
          borderRightWidth: '1px',
          borderRightStyle: 'solid',
          borderRightColor: '#cccccc',
        }}>
          <Catch>
            <Notes />
          </Catch>
        </div>
      }
      <div style={{ gridArea: 'header' }}>
        <Header />
      </div>
      { showEditorPane &&
        <div style={{
          gridArea: 'editor',
          overflow: 'hidden',
          borderRightWidth: showDisplayPane ? '1px' : '0px',
          borderRightStyle: 'solid',
          borderRightColor: '#cccccc',
        }}>
          <Catch>
            <EditorPane
              ref={editorRef}
              selectedFile={App.selectedFileSignal}
              moduleName={SelectedNote.selectedNote}
              compiledFile={App.compiledFileSignal}
              session={App.sessionSignal}
              mouse={App.mouseSignal}
              setSession={App.setSessionSignal}
              setSelected={SelectedNote.setSelected}
            />
          </Catch>
        </div>
      }
      { showDisplayPane &&
        <div style={{
          gridArea: 'display',
          overflow: 'hidden'
        }}>
          <Catch>
            <DisplayPane
              compiledNoteSignal={Compiled.compiledNoteSignal}
            />
          </Catch>
        </div>
      }
    </div>
  );
};

export default Main;
