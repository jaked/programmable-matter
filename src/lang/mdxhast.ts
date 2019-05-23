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
  children: Array<Element | Text | Jsx>;
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
  jsxElement?: AcornJsxAst.JSXElement
}

export interface Import extends NodeImpl {
  type: 'import';
  value: string;
  declarations?: Array<AcornJsxAst.ImportDeclaration | AcornJsxAst.ExportNamedDeclaration | AcornJsxAst.VariableDeclaration>;
}

export interface Export extends NodeImpl {
  type: 'export';
  value: string;
  declarations?: Array<AcornJsxAst.ImportDeclaration | AcornJsxAst.ExportNamedDeclaration | AcornJsxAst.VariableDeclaration>;
}

export type Node = Root | Element | Text | Jsx | Import | Export
