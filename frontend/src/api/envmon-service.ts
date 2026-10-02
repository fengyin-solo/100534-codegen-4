import { moduleMeta } from '@/api/local-service'
import { listRows, saveRows } from '@/data/local-store'
import type { ActionResult, EntryRow } from '@/data/types'

// 库房环境册的专用规则：抄表校验、越界生成处置、顺次流转、跨模块待办都集中在这里，
// 页面只管渲染，不在组件里做业务判断。

export const POINT_KEY = 'envmonPoint'
export const READING_KEY = 'envmonReading'
export const LEDGER_KEY = 'envmon'

// 老式表盘的有效量程：抄表读数超出这个范围按无效值退回，不进册。
const TEMP_RANGE = { min: -30, max: 60 }
const HUMI_RANGE = { min: 0, max: 100 }

export const TIME_SLOTS = ['上午', '下午', '晚上']

// 处置状态只能顺次流转：记录 → 判定 → 整改 → 复核，不能跳步也不能回头。
const FLOW: Record<string, { action: string; next: string }> = {
  已记录: { action: '提交判定', next: '已判定' },
  已判定: { action: '登记整改', next: '已整改' },
  已整改: { action: '提交复核', next: '已复核' },
}

const ACTION_VERB: Record<string, string> = {
  提交判定: '判定完成',
  登记整改: '整改已登记',
  提交复核: '复核完成',
}

function nextId(rows: EntryRow[]): number {
  return rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
}

function pad(value: number): string {
  return String(value).padStart(4, '0')
}

export function listPoints(): EntryRow[] {
  return listRows(POINT_KEY)
}

export function listReadings(): EntryRow[] {
  return listRows(READING_KEY)
}

export function listLedger(): EntryRow[] {
  return listRows(LEDGER_KEY)
}

export function pointRangeText(point: EntryRow): string {
  return `温度${point.温度下限}~${point.温度上限}℃ / 湿度${point.湿度下限}~${point.湿度上限}%`
}

export type ReadingInput = {
  监测点位: string
  记录日期: string
  时段: string
  温度读数: string
  湿度读数: string
  抄表人: string
}

export function submitReading(input: ReadingInput): ActionResult {
  // 先校验一遍抄表记录：点位、日期、时段、抄表人缺一不可
  const point = listPoints().find((row) => row.点位编号 === input.监测点位)
  if (!point) {
    return { ok: false, message: `没有找到监测点位「${input.监测点位}」` }
  }
  if (!input.记录日期 || Number.isNaN(Date.parse(input.记录日期))) {
    return { ok: false, message: '记录日期不是有效日期' }
  }
  if (!TIME_SLOTS.includes(input.时段)) {
    return { ok: false, message: `时段要从${TIME_SLOTS.join('、')}里选` }
  }
  if (!input.抄表人.trim()) {
    return { ok: false, message: '抄表人不能空着' }
  }
  if (input.温度读数.trim() === '' || Number.isNaN(Number(input.温度读数))) {
    return { ok: false, message: '温度读数要是数字' }
  }
  if (input.湿度读数.trim() === '' || Number.isNaN(Number(input.湿度读数))) {
    return { ok: false, message: '湿度读数要是数字' }
  }
  const temp = Number(input.温度读数)
  const humi = Number(input.湿度读数)
  // 读数超出允许区间（表盘量程）时按无效值退回
  if (temp < TEMP_RANGE.min || temp > TEMP_RANGE.max) {
    return { ok: false, message: `温度读数超出允许区间（${TEMP_RANGE.min}~${TEMP_RANGE.max}℃），按无效值退回` }
  }
  if (humi < HUMI_RANGE.min || humi > HUMI_RANGE.max) {
    return { ok: false, message: `湿度读数超出允许区间（${HUMI_RANGE.min}~${HUMI_RANGE.max}%），按无效值退回` }
  }

  const readings = listReadings()
  // 同一个点位同一时段重复提交只算一条
  const duplicated = readings.find(
    (row) =>
      row.监测点位 === input.监测点位 && row.记录日期 === input.记录日期 && row.时段 === input.时段,
  )
  if (duplicated) {
    return {
      ok: false,
      message: `${input.监测点位} ${input.记录日期} ${input.时段}已抄过表（${duplicated.记录编号}），重复提交只算一条`,
    }
  }

  // 越出点位允许区间的时段，自动在处置台账记一条超标处置
  const exceeded: string[] = []
  if (temp < Number(point.温度下限) || temp > Number(point.温度上限)) {
    exceeded.push('温度')
  }
  if (humi < Number(point.湿度下限) || humi > Number(point.湿度上限)) {
    exceeded.push('湿度')
  }

  const id = nextId(readings)
  const reading: EntryRow = {
    id,
    status: '有效',
    pending: false,
    abnormal: exceeded.length > 0,
    记录编号: `READ-${pad(id)}`,
    监测点位: input.监测点位,
    记录日期: input.记录日期,
    时段: input.时段,
    温度读数: temp,
    湿度读数: humi,
    抄表人: input.抄表人.trim(),
  }
  saveRows(READING_KEY, [...readings, reading])

  if (exceeded.length === 0) {
    return { ok: true, message: `抄表已登记（${reading.记录编号}），读数在允许区间内` }
  }
  const ledgerMessage = ensureLedgerEntry(point, reading, exceeded)
  return { ok: true, message: `抄表已登记（${reading.记录编号}），读数越出允许区间，${ledgerMessage}` }
}

function ensureLedgerEntry(point: EntryRow, reading: EntryRow, exceeded: string[]): string {
  const ledger = listLedger()
  const period = `${reading.记录日期} ${reading.时段}`
  // 同一时段的超标只记一次，避免同一段超时被记两次
  const existing = ledger.find((row) => row.监测点位 === reading.监测点位 && row.超标时段 === period)
  if (existing) {
    return `该时段超标已登记为${existing.处置编号}，不重复记录`
  }
  const id = nextId(ledger)
  const entry: EntryRow = {
    id,
    status: '已记录',
    pending: true,
    abnormal: true,
    处置编号: `ENVM-${pad(id)}`,
    监测点位: reading.监测点位,
    超标时段: period,
    超标项目: exceeded.join('、'),
    温度读数: reading.温度读数,
    湿度读数: reading.湿度读数,
    允许区间: pointRangeText(point),
    跟进人: String(point.责任人),
    整改措施: '',
    处置状态: '已记录',
  }
  saveRows(LEDGER_KEY, [...ledger, entry])
  return `已生成超标处置${entry.处置编号}，由${entry.跟进人}跟进`
}

export function runEnvmonAction(id: number, action: string, measure?: string): ActionResult {
  const meta = moduleMeta(LEDGER_KEY)
  const ledger = listLedger()
  const index = ledger.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的${meta.entity}` }
  }
  const row = ledger[index]
  const step = FLOW[String(row.status)]
  if (!step) {
    return { ok: false, message: `${meta.entity}已复核结案，不能再流转` }
  }
  if (step.action !== action) {
    return { ok: false, message: `超标处置只能顺次流转，当前状态「${row.status}」，下一步只能${step.action}` }
  }
  let 整改措施 = String(row.整改措施 ?? '')
  if (action === '登记整改') {
    整改措施 = (measure ?? '').trim()
    if (!整改措施) {
      return { ok: false, message: '登记整改时要写清整改措施' }
    }
  }
  // 没写整改措施的不许进入复核
  if (action === '提交复核' && !整改措施.trim()) {
    return { ok: false, message: '没写整改措施的不许进入复核' }
  }
  const updated: EntryRow = {
    ...row,
    status: step.next,
    处置状态: step.next,
    整改措施,
    pending: step.next !== '已复核',
  }
  const next = [...ledger]
  next[index] = updated
  saveRows(LEDGER_KEY, next)

  // 判定完成的批复落到器物登记的待办，那边会有一条环境复核项
  if (action === '提交判定') {
    const todoMessage = ensureFindTodo(updated)
    return { ok: true, message: `超标处置${ACTION_VERB[action]}，${todoMessage}` }
  }
  return { ok: true, message: `超标处置${ACTION_VERB[action]}，当前状态「${step.next}」` }
}

function ensureFindTodo(ledgerRow: EntryRow): string {
  const finds = listRows('find')
  const code = `ENVJ-${pad(Number(ledgerRow.id))}`
  if (finds.some((row) => row.器物编号 === code)) {
    return `器物登记已有待办${code}，不重复落`
  }
  const todo: EntryRow = {
    id: nextId(finds),
    status: '待登记',
    pending: true,
    abnormal: false,
    器物编号: code,
    出土探方: '库房环境册',
    出土层位: String(ledgerRow.监测点位),
    器物类别: '环境复核项',
    质地: `超标时段 ${ledgerRow.超标时段}`,
    完残程度: `跟进人 ${ledgerRow.跟进人}`,
    最大尺寸: String(ledgerRow.处置编号),
    登记状态: '待登记',
  }
  saveRows('find', [...finds, todo])
  return `器物登记已落待办${code}（环境复核项）`
}

export type PointSummary = {
  point: EntryRow
  count: number
  tempMax: number | null
  tempMin: number | null
  humiMax: number | null
  humiMin: number | null
}

// 按监测点位分栏：逐栏汇总当日温度、湿度读数的最高最低值
export function summarizeDay(points: EntryRow[], readings: EntryRow[], date: string): PointSummary[] {
  const valid = readings.filter((row) => row.记录日期 === date && row.status === '有效')
  return points.map((point) => {
    const mine = valid.filter((row) => row.监测点位 === point.点位编号)
    const temps = mine.map((row) => Number(row.温度读数))
    const humis = mine.map((row) => Number(row.湿度读数))
    return {
      point,
      count: mine.length,
      tempMax: temps.length ? Math.max(...temps) : null,
      tempMin: temps.length ? Math.min(...temps) : null,
      humiMax: humis.length ? Math.max(...humis) : null,
      humiMin: humis.length ? Math.min(...humis) : null,
    }
  })
}

// 点位记录与处置台账两处读到的温度读数要一致，逐条对一遍
export function consistencyIssues(readings: EntryRow[], ledger: EntryRow[]): string[] {
  const issues: string[] = []
  for (const row of ledger) {
    const [date, slot] = String(row.超标时段).split(' ')
    const reading = readings.find(
      (item) => item.监测点位 === row.监测点位 && item.记录日期 === date && item.时段 === slot,
    )
    if (!reading) {
      issues.push(`${row.处置编号} 找不到对应的抄表记录`)
      continue
    }
    if (Number(reading.温度读数) !== Number(row.温度读数)) {
      issues.push(`${row.处置编号} 温度读数不一致：台账记 ${row.温度读数}℃，抄表记 ${reading.温度读数}℃`)
    }
  }
  return issues
}
