# Programmable Matter

### *A dynamic data-driven document development environment (DDDDDE)*

Did you ever wish your document editor were more like an IDE? Your IDE
more like a spreadsheet? Your spreadsheet more like a database? No?

Programmable Matter is a "document development environment": a rich
text document editor that supports embedded code. You can use code to
assemble documents from components, generate documents from structured
data, and even build simple UIs.

Like an IDE, it provides live feedback about your code (syntax
highlighting, error reporting, code suggestions) and navigation of the
document and code structure.

Like a spreadsheet, it provides live update of results as you make
changes to documents, data, and code; and in the presence of code
errors, the correct parts still run.

Like a database, it provides means of defining structured data tables
and working with them through a uniform interface.

## What's it good for?

(TODO)

## Status

Work in progress! Lots of unfinished parts, tons of bugs!

## Installing

```
git clone https://github.com/jaked/programmable-matter.git
cd programmable-matter
npm install
npm run compile
npm run start
```

## Platform support

I develop Programmable Matter on a Mac; it reportedly works OK on
Linux but I haven't tried it myself. I suspect it does not work well
on Windows (because I've been sloppy with some filesystem / path
stuff) but I haven't tried it.

On Linux, in the keyboard shortcuts described below, read **control**
for **command** and **alt** for **option**.

## Interface

![Programmable Matter screenshot](https://jaked.github.io/programmable-matter/img/pm.png)

In Programmable Matter you work with a folder of documents. When you
start PM you'll get an empty folder in a default location (you can
change the location with the "Set data directory" menu option in the
"File" menu).

### Search pane

The left-hand pane side shows a list of documents. Type a string in
the search box at the upper left to restrict the list to matching
documents. To create a new document, type a document name in the
search box, then press the **+** button; or just press **enter** if
there are no matching documents.

To select a document from the list, click on it; or use the up/down
arrow keys, then **enter** to move focus to the document editor. To
delete a document, select it, then type **option-delete**. To rename a
document, edit its name in the box to the right of the search box.

To hide or show the search pane, type **option-command-B**.

(TODO: document subfolder support)

### Editor pane

The middle pane is a rich-text editor for the currently-selected
document. Changes made to the document are saved to the filesystem
automatically, and changes to the filesystem are applied to the
document.

The editor supports the following keyboard shortcuts:

| shortcut         | effect         |
| ---------------- | ---------------|
| command-B        | bold           |
| command-I        | italic         |
| command-U        | underlined     |
| command-E        | monospaced     |
| option-command-X | strikethrough  |
| option-command-0 | paragraph      |
| option-command-1 | header level 1 |
| option-command-2 | header level 2 |
| option-command-3 | header level 3 |
| option-command-4 | header level 4 |
| option-command-5 | header level 5 |
| option-command-6 | header level 6 |
| option-command-7 | bullet list    |
| option-command-8 | numbered list  |
| tab              | indent         |
| shift-tab        | dedent         |
| enter            | break          |
| shift-enter      | soft break     |
| command-enter    | hard break     |

A hard break breaks out of the current structure (list, code block,
etc.); a soft break breaks the current line but stays inside the
current structure; a regular break does one or the other depending on
the current structure.

Additionally it supports the following short Markdown-like shortcuts
(type a trailing space to expand):

| shortcut  | effect           |
| --------- | ---------------- |
| * / - / + | bullet list      |
| 1.        | numbered list    |
| #         | header level 1   |
| ##        | header level 2   |
| ###       | header level 3   |
| ####      | header level 4   |
| #####     | header level 5   |
| ######    | header level 6   |
| >         | blockquote       |
| {{{       | code block       |
| \*\*text**  | bold             |
| \*text*    | italic           |
| \~~text~~  | strikethrough    |
| ^text^    | superscript      |
| \_text_    | subscript        |
| \`text`    | monospaced       |
| {code}    | inline code span |
| [[url]]   | linked URL       |

Code blocks and inline code spans support a simple Typescript-like
language, see **Language** below; code in these blocks is evaluated
live and rendered into the document. Type errors in code are
highlighted in red in the document editor; hover the mouse pointer
over them to see the error message.

To show just the editor pane, press **option-command-C**; to return to
the split view press **option-command-S**.

### Display pane

The right-hand pane displays the rendered document, with code blocks
and inline code spans evaluated and rendered. The document is
re-rendered whenever it (or its dependencies) changes. Rendering skips
code errors where possible; see **Language** below for details.

To show just the display pane, press **option-command-D**; to return
to the split view press **option-command-S**.

(TODO: docs on layout mechanism)

### Caveat

Fair warning, there are lots of bugs and unfinished parts in the
editor, and it's easy to trash a document. (I'm working on global
undo, which will make it easier to recover when this happens---and
also working on fixing the bugs of course.)

## Language

Code blocks and inline code spans support a simple Typescript-like
language (I'll refer to it as TS-- here).

There are several design differences from actual Typescript:

* TS-- evaluates reactively (like a spreadsheet): expressions are
  compiled and evaluated with respect to whatever state they depend on
  (documents and the code in them, and also transient in-memory
  state), and recompiled / reevaluated on demand when the state
  changes.

* TS-- tolerates type errors: when an erroneous expression appears in
  a position that can accept `undefined` (e.g. an optional function
  argument or object field, the test of an `if`, a top-level rendered
  expression, etc.), it evaluates to `undefined`; in an arithmetic
  expression (e.g. `7 + <error>`) the erroneous part is dropped (so
  `7 + <error>` evaluates to `1`); otherwise the error propagates to
  the enclosing expression (which may itself be in a position that can
  accept `undefined`). In all cases the error is highlighted in the
  editor, not silently ignored.

* TS-- has sound typechecking (modulo bugs): there are no `any` types,
  casts, or other holes in the typesystem; and code that doesn't
  typecheck is not run.

* TS-- restricts mutable state: state variables may be defined only
  at the top level of a document, and may only be mutated inside event
  handlers (currently this is not enforced). You can think of state in
  TS-- like a model in the [Elm
  architecture](https://guide.elm-lang.org/architecture/), or a store
  in [Redux](https://redux.js.org/api/store). (However, TS-- does not
  enforce the action / command pattern; you can mutate state
  directly.) (I may add back a separate notion of "local" state to
  support imperative loops etc., but this would not interact with
  reactivity, it would just be another way to write an externally pure
  computation.)

* TS-- doesn't have Typescript's expression / statement separation,
  everything is an expression (so e.g. you can use an `if` as a
  subexpression). However I'm currently using a stock Typescript
  parser (Babel) so there aren't many places where we can actually
  parse a statement in an expression position (I plan to change this).

There are lots of places where TS-- currently lacks parity with
Typescript:

* no parameterized types (I plan to support this)

* no recursive types (I plan to support this)

* no type-level computation (I probably won't support this in the
  user-accessible language but it might make sense for describing
  external libraries)

* no `class` support (I probably won't add this, unless it's really
  necessary to interface with some external library)

* no standard library (there is not much standard library in actual
  Typescript to begin with; I will probably add a richer standard
  library)

* lots of other unimplemented bits

### Rendering code blocks and inline code spans

Code blocks are parsed as
[`Program`](https://github.com/estree/estree/blob/master/es5.md#programs)
nonterminals; top-level expressions in code blocks are rendered into
the document. Code blocks may also contain imports, exports, and
variable definitions, which are not rendered.

Inline code spans are parsed as
[`Expression`](https://github.com/estree/estree/blob/master/es5.md#expressions)
nonterminals and rendered into the document.

Expressions may be given in JSX syntax (returning a `React.ReactElement`). Components may be defined as functions (as in React) and used in JSX tags; however other aspects of React (hooks etc.) are not supported.

Rendered expressions must have type `React.ReactNode`; that is, they
must be a `string`, `number`, `boolean`, `null`, `undefined`,
`React.ReactElement`, or `Array<React.ReactNode>`.

Type-incorrect expressions are skipped when rendering.

### Imports and exports

Top-level variable definitions may be exported and imported between documents as usual in Typescript; the file name in an import is the name of the document as shown in the document list pane.

### Declaring state variables

A constant binding is defined as usual with
```typescript
const x = 7
```
or
```typescript
const x: number = 7
```
where the initializer may be any expression; however, a "constant"
binding may still be dynamic, so e.g. the value of
```javascript
const x = now % 1000
```
is the milliseconds part of the current time.

A mutable state variable is defined with
```typescript
let x: Session<number> = 7
```
or
```typescript
let x: Code<number> = 7
```
The type constructor syntax is used to specify the lifetime of the
state: `Session` state is transient, in-memory state lasting for the
lifetime of the user's session; `Code` state is persistent state
stored in the code itself (changing its value updates the
initializer).

The actual type of mutable state variables is given by the argument to
the type constructor, so here it's just `number`. (When I get around
to switching out the parser I plan to implement an annotation syntax
here, e.g. `@code` or `@session`.)

The initializer of a mutable state variable must be a constant
expression; it may not contain identifiers. (I plan to relax this to
permit identifiers that name constant values.)

Mutable state variables may be updated with Typescript assignment syntax:
```typescript
x = x + 1
```
or for a structured variable:
```typescript
x.foo = 7
```

Mutable variables may only be defined at the top level of a
document.

### Built-in functions and components

There is patchy support for the usual HTML tags in JSX, see `src/lang/Render/initEnv` if something you need is missing. (I'd like to find a way to use the actual Typescript definitions from [React](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/react/index.d.ts) and [CSSType](https://github.com/frenic/csstype#readme).)

(TODO)

### Caveat

Fair warning, there are lots of bugs and unfinished parts in the
compiler, and it's easy to trash a document.

(TODO: more detailed docs)

## Preview server

There is a preview server running at `localhost:3001`; you can view
the rendering of a document named `foo` through a web browser by
visiting `localhost:3001/foo`. (There is no UI to change the port but
you can change it, see `src/server.ts`.)

This is different from the display pane in that it compiles out static
HTML and Javascript (which can be published to an external site, see
**Publishing** below) rather than evaluating and rendering the
document on demand. Not everything supported in the display pane is
currently supported in compiled code (in particular, `import`s are not
supported).

A document is not visible through the preview server unless its
`publish` flag is set; there is no UI for this right now, but you can
edit the file in the filesystem: look for the `meta` object and add a
`publish: true` field to it.

## Publishing

It's possible to publish the current PM folder to Github Pages (see
**Publish Site** in the **File** menu) but right now it is hard-coded
to publish my personal web site (don't worry, you don't have my Github
credentials). You can change this to point to your own Github Pages
site (see `src/ghPages.ts`).

A document is not published unless its `publish` flag is set; there is
no UI for this right now, but you can edit the file in the filesystem:
look for the `meta` object and add a `publish: true` field to it.

## File format

Documents are stored with a `.pm` extension in JSON format. The
top-level object contains a `nodes` field, which is a list of nodes
representing the document structure; and a `meta` field containing
metadata about the document.

(TODO: docs on nodes and metadata)

## Implementation

(TODO)

## Roadmap

(TODO)
