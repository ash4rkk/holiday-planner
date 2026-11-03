import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { Extension } from '@tiptap/react'

// Podświetla kwoty `/+300`, `/+50 €` w edytorze (te same zasady co parseAmounts w @planer/core).
const AMOUNT = /\/\+\d+(?:[.,]\d{1,2})?(?!\d)(?:\s?(?:zł|zl|€|\$|£|[a-z]{3})(?![a-ząćęłńóśźż]))?/gi

export const AmountHighlight = Extension.create({
  name: 'amountHighlight',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('amountHighlight'),
        props: {
          decorations(state) {
            const decorations: Decoration[] = []
            state.doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return
              for (const m of node.text.matchAll(AMOUNT)) {
                const from = pos + (m.index ?? 0)
                decorations.push(
                  Decoration.inline(from, from + m[0].length, { class: 'amount-mark' }),
                )
              }
            })
            return DecorationSet.create(state.doc, decorations)
          },
        },
      }),
    ]
  },
})
