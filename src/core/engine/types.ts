export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'money'
  | 'percent'
  | 'date'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'ref'
  | 'wbs'
  | 'autoCode'
  | 'attachment'
  | 'computed'
  | 'readonly'

export interface Option {
  label: string
  value: any
}

export interface FieldDef {
  key: string
  label: string
  type: FieldType
  required?: boolean
  span?: 8 | 12 | 16 | 24
  options?: (string | Option)[]
  min?: number
  max?: number
  precision?: number
  computed?: (row: any) => any
  filter?: boolean
  searchable?: boolean
  listWidth?: number
  listHidden?: boolean
  formHidden?: boolean
  readonly?: boolean
  placeholder?: string
  ref?: string
  refLabel?: string
  refSearch?: string[]
  unit?: string
  help?: string
  rows?: number
  format?: 'money' | 'date' | 'percent' | 'qty' | 'text' | 'status' | 'attachment'
  defaultValue?: any
}

export interface DocConfig {
  key: string
  table: string
  title: string
  prefix: string
  group: string
  tab?: string
  icon?: string
  fields: FieldDef[]
  searchFields?: string[]
  dateField?: string
  codeField?: string
  statusField?: string
  lock?: (row: any) => boolean
  lockReason?: string
  print?: { template: 'standard' | 'table'; title: string }
  order?: number
  desc?: string
}

export function defineDoc(cfg: DocConfig): DocConfig {
  const codeField = cfg.codeField || 'code'
  const searchFields =
    cfg.searchFields ||
    Array.from(
      new Set([
        codeField,
        ...cfg.fields.filter((f) => f.type === 'text' || f.type === 'textarea' || f.searchable).map((f) => f.key)
      ])
    )
  return { ...cfg, codeField, searchFields, dateField: cfg.dateField || 'createdAt' }
}
