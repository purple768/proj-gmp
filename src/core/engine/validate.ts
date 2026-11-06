import type { DocConfig, FieldDef } from './types'

export interface FieldError {
  key: string
  message: string
}

function isEmpty(v: any): boolean {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)
}

/** 逐字段校验，返回全部错误（不短路），供 UI 标红并滚动到首个 */
export function validateRow(cfg: DocConfig, row: any): FieldError[] {
  const errors: FieldError[] = []
  for (const f of cfg.fields) {
    if (f.type === 'computed' || f.type === 'attachment' || f.formHidden) continue
    const v = row?.[f.key]

    if (f.required && isEmpty(v)) {
      errors.push({ key: f.key, message: `${f.label}不能为空` })
      continue
    }
    if (isEmpty(v)) continue

    if (f.type === 'money' || f.type === 'number' || f.type === 'percent') {
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        errors.push({ key: f.key, message: `${f.label}必须是数字` })
        continue
      }
      if (f.type === 'percent' && (v < 0 || v > 100)) {
        errors.push({ key: f.key, message: `${f.label}必须在 0~100 之间` })
        continue
      }
      if (f.min !== undefined && v < f.min) {
        errors.push({ key: f.key, message: `${f.label}不能小于 ${f.min}` })
        continue
      }
      if (f.max !== undefined && v > f.max) {
        errors.push({ key: f.key, message: `${f.label}不能大于 ${f.max}` })
        continue
      }
      if (f.type === 'percent' && f.max === undefined && v > 100) {
        errors.push({ key: f.key, message: `${f.label}不能大于 100` })
        continue
      }
    }

    if (f.options && (f.type === 'select' || f.type === 'radio')) {
      const values = f.options.map((o) => (typeof o === 'string' ? o : o.value))
      if (!values.includes(v)) errors.push({ key: f.key, message: `${f.label}取值不合法` })
    }
  }
  return errors
}

/** 计算 computed 字段，返回新对象（不修改入参） */
export function applyComputed(cfg: DocConfig, row: any): any {
  const out = { ...row }
  for (const f of cfg.fields) {
    if (f.type === 'computed' && typeof f.computed === 'function') {
      try {
        out[f.key] = f.computed(out)
      } catch {
        out[f.key] = null
      }
    }
  }
  return out
}

/** 表单默认值 */
export function defaultRow(cfg: DocConfig, projectId?: string | null): any {
  const row: any = { projectId: projectId || '' }
  for (const f of cfg.fields) {
    if (f.defaultValue !== undefined) row[f.key] = f.defaultValue
    else if (f.type === 'percent') row[f.key] = 0
  }
  return row
}

/** 金额/数量在保存前的数值规整（R-16） */
export function normalizeNumbers(cfg: DocConfig, row: any): any {
  const out = { ...row }
  for (const f of cfg.fields) {
    if (f.type === 'money' || f.type === 'number' || f.type === 'percent') {
      const v = out[f.key]
      if (v === '' || v === null || v === undefined) continue
      const n = Number(v)
      if (!Number.isFinite(n)) continue
      const digits = f.type === 'money' ? 2 : f.precision ?? (f.type === 'percent' ? 0 : 3)
      out[f.key] = f.type === 'percent' ? Math.round(n) : Math.round(n * Math.pow(10, digits)) / Math.pow(10, digits)
    }
  }
  return out
}

export function fieldByKey(cfg: DocConfig, key: string): FieldDef | undefined {
  return cfg.fields.find((f) => f.key === key)
}

export function listFields(cfg: DocConfig): FieldDef[] {
  return cfg.fields.filter((f) => !f.listHidden)
}

export function formFields(cfg: DocConfig): FieldDef[] {
  return cfg.fields.filter((f) => !f.formHidden)
}
