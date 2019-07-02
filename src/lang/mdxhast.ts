import Try from '../util/Try';
import * as AcornJsxAst from './acornJsxAst';

// See
//   https://github.com/syntax-tree/unist
//   https://github.com/syntax-tree/hast
//   https://mdxjs.com/advanced/ast/#mdxhast

export interface Point {
  line: number;
  column: number;
  offset?: number;
}

export interface Position {
  start: Point;
  end: Point;
  indent?: number
}

interface NodeImpl {
  type: string;
  position?: Position;
}

interface ParentImpl extends NodeImpl {
  children: Array<Node>;
}

export interface Root extends ParentImpl {
  type: 'root';
}

export interface Element extends ParentImpl {
  type: 'element';
  tagName: string;
  properties: Object;
}

export interface Text extends NodeImpl {
  type: 'text';
  value: string;
}

export interface Jsx extends NodeImpl {
  type: 'jsx';
  value: string;
  jsxElement?: Try<AcornJsxAst.JSXElement | AcornJsxAst.JSXFragment>;
}

type Declaration =
  AcornJsxAst.ImportDeclaration |
  AcornJsxAst.ExportNamedDeclaration |
  AcornJsxAst.VariableDeclaration;

export interface Import extends NodeImpl {
  type: 'import';
  value: string;
  declarations?: Try<Array<Declaration>>;
}

export interface Export extends NodeImpl {
  type: 'export';
  value: string;
  declarations?: Try<Array<Declaration>>;
}

export type Node = Root | Element | Text | Jsx | Import | Export
