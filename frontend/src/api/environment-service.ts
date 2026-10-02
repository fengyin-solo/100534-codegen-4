import {
  DISPOSAL_STATUSES,
  READING_SLOTS,
  VALID_HUMIDITY_MAX,
  VALID_HUMIDITY_MIN,
  VALID_TEMP_MAX,
  VALID_TEMP_MIN,
} from '@/data/environment/types'
import type {
  DisposalStatus,
  EnvDisposal,
  EnvReading,
  EnvTodo,
  EnvironmentDb,
  MonitorPoint,
  ReadingSlot,
} from '@/data/environment/types'
import { envDb, resetEnvDb, saveEnvDb } from '@/data/environment/store'

// 仅供校验脚本构造历史脏数据：按单号改写处置台账读数，模拟两处台账被人抄花的情形。
export function __tamperDisposalReadingForVerify(id: number, temperature: number): void {
  const db = envDb()
  const disposal = db.disposals.find((row) => row.id === id)
  if (disposal) {
    disposal.temperature = temperature
    saveEnvDb({ ...db })
  }
}

export type ServiceResult<T> = { ok: boolean; message: string; data?: T }

export type ReadingInput = {
  pointId: number
  date: string
  slot: ReadingSlot
  temperature: number
  humidity: number
  recorder: string
}

export type PointInput = {
  code: string
  name: string
  tempMin: number
  tempMax: number
  humidityMin: number
  humidityMax: number
}

export type DisposalInput = {
  pointId: number
  date: string
  slot: ReadingSlot
  owner: string
}

// 点位分栏台账：一栏一个监测点位，当日温湿度最高最低与越限时段都在这一栏里。
export type LedgerColumn = {
  point: MonitorPoint
  readingCount: number
  tempMin: number | null
  tempMax: number | null
  humidityMin: number | null
  humidityMax: number | null
  exceededSlots: { slot: ReadingSlot; reading: EnvReading; kinds: string[]; detail: string; disposalId: number | null }[]
  hasReading: boolean
}

export type VerifyItem = { level: 'error' | 'warn'; message: string }
export type VerifyReport = {
  checkedAt: string
  groups: { name: string; items: VerifyItem[] }[]
  errorCount: number
  warnCount: number
}

function now(): string {
  // 本环境运行在现代浏览器里，toLocaleString 足够给到「2026/10/02 14:05:03」这样的时刻。
  return new Date().toLocaleString('zh-CN', { hour12: false })
}

function nextId(db: EnvironmentDb, key: keyof EnvironmentDb['seq']): number {
  db.seq[key] += 1
  return db.seq[key]
}

function findPoint(db: EnvironmentDb, pointId: number): MonitorPoint | undefined {
  return db.points.find((point) => point.id === pointId)
}

function findReading(db: EnvironmentDb, pointId: number, date: string, slot: ReadingSlot): EnvReading | undefined {
  return db.readings.find(
    (row) => row.pointId === pointId && row.date === date && row.slot === slot,
  )
}

function findDisposal(db: EnvironmentDb, pointId: number, date: string, slot: ReadingSlot): EnvDisposal | undefined {
  return db.disposals.find(
    (row) => row.pointId === pointId && row.date === date && row.slot === slot,
  )
}

export function exceedDetailFor(point: MonitorPoint, temperature: number, humidity: number): { kinds: string[]; detail: string } {
  const kinds: string[] = []
  if (temperature > point.tempMax) kinds.push('温度超上限')
  if (temperature < point.tempMin) kinds.push('温度低于下限')
  if (humidity > point.humidityMax) kinds.push('湿度超上限')
  if (humidity < point.humidityMin) kinds.push('湿度低于下限')
  const detail =
    `温度 ${temperature}℃（允许 ${point.tempMin}~${point.tempMax}℃），` +
    `湿度 ${humidity}%RH（允许 ${point.humidityMin}~${point.humidityMax}%RH）`
  return { kinds, detail }
}

export function isReadingExceeded(point: MonitorPoint, reading: EnvReading): boolean {
  return (
    reading.temperature > point.tempMax ||
    reading.temperature < point.tempMin ||
    reading.humidity > point.humidityMax ||
    reading.humidity < point.humidityMin
  )
}

export function listPoints(): MonitorPoint[] {
  return envDb().points
}

export function listReadings(date?: string, pointId?: number): EnvReading[] {
  return envDb()
    .readings.filter((row) => (date ? row.date === date : true))
    .filter((row) => (pointId ? row.pointId === pointId : true))
    .sort((a, b) =>
      a.date === b.date
        ? a.pointId === b.pointId
          ? READING_SLOTS.indexOf(a.slot) - READING_SLOTS.indexOf(b.slot)
          : a.pointId - b.pointId
        : a.date < b.date ? -1 : 1,
    )
}

export function listDisposals(date?: string, pointId?: number, status?: string): EnvDisposal[] {
  return envDb()
    .disposals.filter((row) => (date ? row.date === date : true))
    .filter((row) => (pointId ? row.pointId === pointId : true))
    .filter((row) => (status ? row.status === status : true))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

export function listTodos(includeDone = true): EnvTodo[] {
  return envDb()
    .todos.filter((todo) => (includeDone ? true : !todo.done))
    .sort((a, b) => Number(a.done) - Number(b.done) || (a.createdAt < b.createdAt ? 1 : -1))
}

export function createPoint(input: PointInput): ServiceResult<MonitorPoint> {
  const code = input.code.trim()
  const name = input.name.trim()
  if (!code || !name) {
    return { ok: false, message: '点位编号与点位名称都不能为空' }
  }
  const db = envDb()
  if (db.points.some((point) => point.code === code)) {
    return { ok: false, message: `点位编号 ${code} 已存在，监测点位不能重号` }
  }
  if (
    input.tempMin >= input.tempMax ||
    input.humidityMin >= input.humidityMax ||
    input.tempMin < VALID_TEMP_MIN || input.tempMax > VALID_TEMP_MAX ||
    input.humidityMin < VALID_HUMIDITY_MIN || input.humidityMax > VALID_HUMIDITY_MAX
  ) {
    return {
      ok: false,
      message: `允许区间填写有误：温度须落在仪表量限 ${VALID_TEMP_MIN}~${VALID_TEMP_MAX}℃ 内且下限小于上限，湿度须落在 ${VALID_HUMIDITY_MIN}~${VALID_HUMIDITY_MAX}%RH 内`,
    }
  }
  const point: MonitorPoint = {
    id: nextId(db, 'point'),
    code,
    name,
    tempMin: input.tempMin,
    tempMax: input.tempMax,
    humidityMin: input.humidityMin,
    humidityMax: input.humidityMax,
    validTempMin: VALID_TEMP_MIN,
    validTempMax: VALID_TEMP_MAX,
    validHumidityMin: VALID_HUMIDITY_MIN,
    validHumidityMax: VALID_HUMIDITY_MAX,
  }
  db.points.push(point)
  saveEnvDb({ ...db })
  return { ok: true, message: `监测点位 ${code} 已登记`, data: point }
}

// 提交抄表读数：先挡无效值，再挡同点位同时段重复提交；越出允许区间只做超标提示，读数照样入账。
export function submitReading(input: ReadingInput): ServiceResult<EnvReading> {
  const db = envDb()
  const point = findPoint(db, input.pointId)
  if (!point) {
    return { ok: false, message: '请先选择监测点位' }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    return { ok: false, message: '抄表日期格式应为 YYYY-MM-DD' }
  }
  if (!READING_SLOTS.includes(input.slot)) {
    return { ok: false, message: '抄表时段不在早/午/晚三档之内' }
  }
  if (!input.recorder.trim()) {
    return { ok: false, message: '抄表员必须署名，老式表盘手抄也要留人名' }
  }
  if (
    Number.isNaN(input.temperature) ||
    input.temperature < VALID_TEMP_MIN ||
    input.temperature > VALID_TEMP_MAX
  ) {
    return {
      ok: false,
      message: `温度读数 ${input.temperature}℃ 超出仪表有效量限 ${VALID_TEMP_MIN}~${VALID_TEMP_MAX}℃，按无效值退回，请核对表盘后重抄`,
    }
  }
  if (
    Number.isNaN(input.humidity) ||
    input.humidity < VALID_HUMIDITY_MIN ||
    input.humidity > VALID_HUMIDITY_MAX
  ) {
    return {
      ok: false,
      message: `湿度读数 ${input.humidity}%RH 超出仪表有效量限 ${VALID_HUMIDITY_MIN}~${VALID_HUMIDITY_MAX}%RH，按无效值退回，请核对表盘后重抄`,
    }
  }
  if (findReading(db, input.pointId, input.date, input.slot)) {
    return {
      ok: false,
      message: `${point.code} ${input.date} ${input.slot} 已有抄表记录，同一点位同一时段重复提交只算一条`,
    }
  }
  const reading: EnvReading = {
    id: nextId(db, 'reading'),
    pointId: input.pointId,
    date: input.date,
    slot: input.slot,
    temperature: Number(input.temperature.toFixed(1)),
    humidity: Number(input.humidity.toFixed(1)),
    recorder: input.recorder.trim(),
    createdAt: now(),
  }
  db.readings.push(reading)
  saveEnvDb({ ...db })
  const { kinds } = exceedDetailFor(point, reading.temperature, reading.humidity)
  if (kinds.length > 0) {
    return { ok: true, message: `读数已入账，但该时段${kinds.join('、')}，请尽快登记超标处置`, data: reading }
  }
  return { ok: true, message: '抄表读数已登记，温湿度均在允许区间内', data: reading }
}

// 按点位分栏汇总当日台账：每栏给出温湿度最高最低，并把越限时段单列出来。
export function buildLedger(date: string): LedgerColumn[] {
  const db = envDb()
  return db.points.map((point) => {
    const dayReadings = db.readings.filter(
      (row) => row.pointId === point.id && row.date === date,
    )
    const temperatures = dayReadings.map((row) => row.temperature)
    const humidities = dayReadings.map((row) => row.humidity)
    const exceededSlots = dayReadings
      .filter((reading) => isReadingExceeded(point, reading))
      .map((reading) => {
        const { kinds, detail } = exceedDetailFor(point, reading.temperature, reading.humidity)
        const disposal = db.disposals.find(
          (row) => row.pointId === point.id && row.date === reading.date && row.slot === reading.slot,
        )
        return { slot: reading.slot, reading, kinds, detail, disposalId: disposal ? disposal.id : null }
      })
    return {
      point,
      readingCount: dayReadings.length,
      tempMin: temperatures.length ? Math.min(...temperatures) : null,
      tempMax: temperatures.length ? Math.max(...temperatures) : null,
      humidityMin: humidities.length ? Math.min(...humidities) : null,
      humidityMax: humidities.length ? Math.max(...humidities) : null,
      exceededSlots,
      hasReading: dayReadings.length > 0,
    }
  })
}

// 登记超标处置：温度湿度必须与点位记录对得上；同点位同时段只允许一条处置。
export function registerDisposal(input: DisposalInput): ServiceResult<EnvDisposal> {
  const db = envDb()
  const point = findPoint(db, input.pointId)
  if (!point) {
    return { ok: false, message: '请先选择监测点位' }
  }
  if (!input.owner.trim()) {
    return { ok: false, message: '超标处置必须写清由谁跟进，跟进人不能为空' }
  }
  const reading = findReading(db, input.pointId, input.date, input.slot)
  if (!reading) {
    return {
      ok: false,
      message: `${point.code} ${input.date} ${input.slot} 查不到点位抄表记录，处置温度必须以点位记录为准，请先抄表`,
    }
  }
  const existing = findDisposal(db, input.pointId, input.date, input.slot)
  if (existing) {
    return {
      ok: false,
      message: `${point.code} ${input.date} ${input.slot} 的超标处置已登记（单号 CL-${String(existing.id).padStart(3, '0')}），同一段超时不记两次`,
    }
  }
  const { kinds, detail } = exceedDetailFor(point, reading.temperature, reading.humidity)
  if (kinds.length === 0) {
    return { ok: false, message: '该时段温湿度均在允许区间内，不构成超标，无需登记处置' }
  }
  const disposal: EnvDisposal = {
    id: nextId(db, 'disposal'),
    pointId: point.id,
    date: input.date,
    slot: input.slot,
    temperature: reading.temperature,
    humidity: reading.humidity,
    exceedKinds: kinds,
    exceedDetail: detail,
    owner: input.owner.trim(),
    judgeNote: '',
    rectifyMeasure: '',
    reviewNote: '',
    status: '已记录',
    history: [{ action: '登记超标', operator: input.owner.trim(), time: now() }],
    createdAt: now(),
  }
  db.disposals.push(disposal)
  saveEnvDb({ ...db })
  return { ok: true, message: `超标处置 CL-${String(disposal.id).padStart(3, '0')} 已登记，跟进人：${disposal.owner}`, data: disposal }
}

function advanceDisposal(
  db: EnvironmentDb,
  disposal: EnvDisposal,
  status: DisposalStatus,
  action: string,
  operator: string,
  patch: Partial<EnvDisposal>,
): void {
  Object.assign(disposal, patch, { status })
  disposal.history.push({ action, operator: operator.trim() || '值班管理员', time: now() })
}

// 判定：只能从「已记录」顺次走到「已判定」；判定批复同步落成器物登记的环境复核待办。
export function judgeDisposal(id: number, operator: string, judgeNote: string): ServiceResult<EnvDisposal> {
  const db = envDb()
  const disposal = db.disposals.find((row) => row.id === id)
  if (!disposal) {
    return { ok: false, message: `没有找到单号 CL-${String(id).padStart(3, '0')} 的处置` }
  }
  if (disposal.status !== '已记录') {
    return { ok: false, message: `当前状态为「${disposal.status}」，判定只能在记录完成后进行，状态须顺次流转` }
  }
  if (!judgeNote.trim()) {
    return { ok: false, message: '判定批复意见不能为空' }
  }
  advanceDisposal(db, disposal, '已判定', '判定超标', operator, { judgeNote: judgeNote.trim() })
  const point = findPoint(db, disposal.pointId)
  const todo: EnvTodo = {
    id: nextId(db, 'todo'),
    disposalId: disposal.id,
    title: `环境复核：${point?.code ?? ''} ${point?.name ?? ''} ${disposal.date} ${disposal.slot}${disposal.exceedKinds.join('、')}`,
    pointCode: point?.code ?? '',
    date: disposal.date,
    slot: disposal.slot,
    judgeNote: judgeNote.trim(),
    owner: disposal.owner,
    done: false,
    createdAt: now(),
  }
  db.todos.push(todo)
  saveEnvDb({ ...db })
  return { ok: true, message: `CL-${String(id).padStart(3, '0')} 已判定，环境复核项已落到器物登记待办` }
}

// 整改：只能从「已判定」走到「已整改」，且必须写明整改措施——没写措施不许进复核。
export function rectifyDisposal(id: number, operator: string, measure: string): ServiceResult<EnvDisposal> {
  const db = envDb()
  const disposal = db.disposals.find((row) => row.id === id)
  if (!disposal) {
    return { ok: false, message: `没有找到单号 CL-${String(id).padStart(3, '0')} 的处置` }
  }
  if (disposal.status !== '已判定') {
    return { ok: false, message: `当前状态为「${disposal.status}」，整改只能在判定完成后进行，状态须顺次流转` }
  }
  if (!measure.trim()) {
    return { ok: false, message: '未填写整改措施，不许提交整改，更不能进入复核环节' }
  }
  advanceDisposal(db, disposal, '已整改', '提交整改', operator, { rectifyMeasure: measure.trim() })
  saveEnvDb({ ...db })
  return { ok: true, message: `CL-${String(id).padStart(3, '0')} 整改已提交，等待复核` }
}

// 复核：只能从「已整改」走到「已复核」；复核通过后勾销器物登记待办里的对应项。
export function reviewDisposal(id: number, operator: string, reviewNote: string): ServiceResult<EnvDisposal> {
  const db = envDb()
  const disposal = db.disposals.find((row) => row.id === id)
  if (!disposal) {
    return { ok: false, message: `没有找到单号 CL-${String(id).padStart(3, '0')} 的处置` }
  }
  if (disposal.status !== '已整改') {
    return { ok: false, message: `当前状态为「${disposal.status}」，记录、判定、整改走完才轮到复核` }
  }
  if (!disposal.rectifyMeasure.trim()) {
    return { ok: false, message: '该处置没有整改措施，不许进入复核' }
  }
  advanceDisposal(db, disposal, '已复核', '复核通过', operator, { reviewNote: reviewNote.trim() })
  const todo = db.todos.find((row) => row.disposalId === disposal.id)
  if (todo) {
    todo.done = true
  }
  saveEnvDb({ ...db })
  return { ok: true, message: `CL-${String(id).padStart(3, '0')} 复核通过，器物登记待办中的环境复核项已勾销` }
}

export function disposalNumber(disposal: EnvDisposal): string {
  return `CL-${String(disposal.id).padStart(3, '0')}`
}

export function pointLabel(pointId: number): string {
  const point = envDb().points.find((row) => row.id === pointId)
  return point ? `${point.code} ${point.name}` : `点位#${pointId}`
}

export function disposalStatusIndex(status: DisposalStatus): number {
  return DISPOSAL_STATUSES.indexOf(status)
}

// 抄表记录总校验：把散在点位记录与处置台账两处的数据对着查一遍。
export function verifyReadings(): VerifyReport {
  const db = envDb()
  const groups: VerifyReport['groups'] = []

  // 一、无效读数：超出仪表有效量限的数据（正常入口挡不住历史脏数据时兜底）。
  const invalid: VerifyItem[] = []
  for (const reading of db.readings) {
    if (
      Number.isNaN(reading.temperature) ||
      reading.temperature < VALID_TEMP_MIN || reading.temperature > VALID_TEMP_MAX ||
      Number.isNaN(reading.humidity) ||
      reading.humidity < VALID_HUMIDITY_MIN || reading.humidity > VALID_HUMIDITY_MAX
    ) {
      invalid.push({
        level: 'error',
        message: `抄表记录 #${reading.id}（${pointLabel(reading.pointId)} ${reading.date} ${reading.slot}）读数超出仪表有效量限，应按无效值退回`,
      })
    }
  }
  groups.push({ name: '无效读数', items: invalid })

  // 二、重复抄表：同一点位同一时段出现一条以上记录。
  const duplicated: VerifyItem[] = []
  const seen = new Map<string, EnvReading[]>()
  for (const reading of db.readings) {
    const key = `${reading.pointId}|${reading.date}|${reading.slot}`
    const list = seen.get(key) ?? []
    list.push(reading)
    seen.set(key, list)
  }
  for (const [, list] of seen) {
    if (list.length > 1) {
      duplicated.push({
        level: 'error',
        message: `${pointLabel(list[0].pointId)} ${list[0].date} ${list[0].slot} 存在 ${list.length} 条抄表记录，同一段只应保留一条（记录号 ${list.map((row) => `#${row.id}`).join('、')}）`,
      })
    }
  }
  groups.push({ name: '重复抄表', items: duplicated })

  // 三、缺档：已登记点位某天三档抄表没抄全（只对有抄表动作的日期检查）。
  const missing: VerifyItem[] = []
  const pointDateKeys = new Set(db.readings.map((row) => `${row.pointId}|${row.date}`))
  for (const key of pointDateKeys) {
    const [pointIdText, date] = key.split('|')
    const pointId = Number(pointIdText)
    for (const slot of READING_SLOTS) {
      if (!findReading(db, pointId, date, slot)) {
        missing.push({
          level: 'warn',
          message: `${pointLabel(pointId)} ${date} ${slot} 缺抄表记录`,
        })
      }
    }
  }
  groups.push({ name: '缺档未抄', items: missing })

  // 四、两账一致性：处置台账温度/湿度必须等于点位记录里的同档读数。
  const mismatch: VerifyItem[] = []
  for (const disposal of db.disposals) {
    const reading = findReading(db, disposal.pointId, disposal.date, disposal.slot)
    if (!reading) {
      mismatch.push({
        level: 'error',
        message: `${disposalNumber(disposal)}（${pointLabel(disposal.pointId)} ${disposal.date} ${disposal.slot}）在点位记录中找不到对应抄表，两账无法核对`,
      })
      continue
    }
    if (reading.temperature !== disposal.temperature || reading.humidity !== disposal.humidity) {
      mismatch.push({
        level: 'error',
        message: `${disposalNumber(disposal)} 台账读数 ${disposal.temperature}℃/${disposal.humidity}%RH 与点位记录 ${reading.temperature}℃/${reading.humidity}%RH 不一致`,
      })
    }
  }
  groups.push({ name: '两账读数一致', items: mismatch })

  // 五、流转合规：处置必须按记录→判定→整改→复核顺次停留，且复核项必须有整改措施。
  const flow: VerifyItem[] = []
  for (const disposal of db.disposals) {
    if (disposal.status === '已复核' && !disposal.rectifyMeasure.trim()) {
      flow.push({
        level: 'error',
        message: `${disposalNumber(disposal)} 已复核却查不到整改措施，跳过了整改环节`,
      })
    }
    const expectedHistory = DISPOSAL_STATUSES.indexOf(disposal.status) + 1
    if (disposal.history.length < expectedHistory) {
      flow.push({
        level: 'error',
        message: `${disposalNumber(disposal)} 状态为「${disposal.status}」但流转记录只有 ${disposal.history.length} 步，疑似越级流转`,
      })
    }
  }
  groups.push({ name: '处置流转合规', items: flow })

  // 六、超标未处置：点位记录已越限却没有对应处置单。
  const unhandled: VerifyItem[] = []
  for (const reading of db.readings) {
    const point = findPoint(db, reading.pointId)
    if (!point) {
      continue
    }
    if (isReadingExceeded(point, reading) && !findDisposal(db, reading.pointId, reading.date, reading.slot)) {
      unhandled.push({
        level: 'warn',
        message: `${point.code} ${reading.date} ${reading.slot} 读数越限（${reading.temperature}℃/${reading.humidity}%RH），尚未登记超标处置`,
      })
    }
  }
  groups.push({ name: '超标未处置', items: unhandled })

  // 七、待办勾稽：判定后应有待办，复核后待办应已勾销。
  const todoIssues: VerifyItem[] = []
  for (const disposal of db.disposals) {
    const todo = db.todos.find((row) => row.disposalId === disposal.id)
    const index = DISPOSAL_STATUSES.indexOf(disposal.status)
    if (index >= DISPOSAL_STATUSES.indexOf('已判定') && !todo) {
      todoIssues.push({
        level: 'error',
        message: `${disposalNumber(disposal)} 已判定，但器物登记待办里没有对应的环境复核项`,
      })
    }
    if (todo && disposal.status === '已复核' && !todo.done) {
      todoIssues.push({
        level: 'error',
        message: `${disposalNumber(disposal)} 已复核，但器物登记待办的环境复核项仍未勾销`,
      })
    }
    if (todo && disposal.status !== '已复核' && todo.done) {
      todoIssues.push({
        level: 'warn',
        message: `${disposalNumber(disposal)} 尚未复核，器物登记待办却已提前勾销`,
      })
    }
  }
  groups.push({ name: '待办勾稽', items: todoIssues })

  const allItems = groups.flatMap((group) => group.items)
  return {
    checkedAt: now(),
    groups,
    errorCount: allItems.filter((item) => item.level === 'error').length,
    warnCount: allItems.filter((item) => item.level === 'warn').length,
  }
}

export function resetLedger(): void {
  resetEnvDb()
}

// 清空抄表、处置与待办（点位册保留）：用于换季重开一本环境册，也让无头校验从干净状态起步。
export function clearLedgerRecords(): void {
  const db = envDb()
  db.readings = []
  db.disposals = []
  db.todos = []
  db.seq.reading = 0
  db.seq.disposal = 0
  db.seq.todo = 0
  saveEnvDb({ ...db })
}
