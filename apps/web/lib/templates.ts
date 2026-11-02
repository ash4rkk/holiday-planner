import 'server-only'
import { asc, type CardTemplate, cardTemplates, getDb } from '@planer/core/db'

export type TemplateOption = Pick<
  CardTemplate,
  'id' | 'name' | 'type' | 'markdown' | 'defaultFields'
>

export async function listTemplates(): Promise<TemplateOption[]> {
  return getDb()
    .select({
      id: cardTemplates.id,
      name: cardTemplates.name,
      type: cardTemplates.type,
      markdown: cardTemplates.markdown,
      defaultFields: cardTemplates.defaultFields,
    })
    .from(cardTemplates)
    .orderBy(asc(cardTemplates.sortOrder), asc(cardTemplates.createdAt))
}

export async function createTemplate(values: Omit<TemplateOption, 'id'>): Promise<TemplateOption> {
  const [row] = await getDb().insert(cardTemplates).values(values).returning()
  if (!row) throw new Error('Nie udało się zapisać szablonu')
  return row
}
