import { html } from '@codemirror/lang-html'
import {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view'
import CodeMirror from '@uiw/react-codemirror'

// The Emails editor's HTML box: CodeMirror with HTML highlighting, and every {{…}} (a Handlebars variable, #if, #each)
// marked in royal so the parts that change per guest stand out. Loaded only on that page (React.lazy), so guests'
// pages never download it.

const handlebars = new MatchDecorator({
  regexp: /\{\{[^}]*\}\}/g,
  decoration: Decoration.mark({ class: 'cm-hbs' }),
})

const marks = ViewPlugin.fromClass(
  class {
    decorations
    constructor(view: EditorView) {
      this.decorations = handlebars.createDeco(view)
    }
    update(u: ViewUpdate) {
      this.decorations = handlebars.updateDeco(u, this.decorations)
    }
  },
  { decorations: (v) => v.decorations }
)

const theme = EditorView.theme({
  '&': { fontSize: '13px', border: '1px solid #5B6B80', borderRadius: '10px', overflow: 'hidden' },
  '&.cm-focused': { outline: '2px solid #5A2D91', outlineOffset: '0' },
  '.cm-scroller': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    lineHeight: '1.6',
  },
  '.cm-gutters': { backgroundColor: '#F3F6F5', borderRight: '1px solid #E2E8EA', color: '#4A5568' },
  '.cm-hbs': {
    color: '#5A2D91',
    backgroundColor: '#F1ECF8',
    borderRadius: '3px',
    fontWeight: '600',
  },
})

export default function HtmlEditor({
  id,
  value,
  onChange,
  onFocus,
  onReady,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  onFocus: () => void
  /** The editor, so the page can put a variable where its cursor is. */
  onReady: (view: EditorView) => void
}) {
  return (
    <CodeMirror
      id={id}
      value={value}
      height="70vh"
      minHeight="420px"
      extensions={[html(), marks, theme, EditorView.lineWrapping]}
      basicSetup={{ foldGutter: false, highlightActiveLine: false }}
      onChange={onChange}
      onFocus={onFocus}
      onCreateEditor={onReady}
    />
  )
}
