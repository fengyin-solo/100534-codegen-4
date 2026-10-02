/** 库房环境册的领域类型：监测点位、抄表读数、超标处置与器物登记待办各管一段。 */

// 每天固定三档抄表时段，时段名同时作为「同一点位同一时段」去重的键。
export const READING_SLOTS = ['早班 08:00', '午班 14:00', '晚班 20:00'] as const
export type ReadingSlot = (typeof READING_SLOTS)[number]

// 表盘仪器本身的有效量限：落出这个区间按无效值退回，不算抄表，更不算超标。
export const VALID_TEMP_MIN = -20
export const VALID_TEMP_MAX = 60
export const VALID_HUMIDITY_MIN = 0
export const VALID_HUMIDITY_MAX = 100

export type MonitorPoint = {
  id: number
  code: string
  name: string
  // 库房允许（控制）区间：读数落出这里即构成超标时段。
  tempMin: number
  tempMax: number
  humidityMin: number
  humidityMax: number
  // 仪表有效量限，登记时按常量写入。
  validTempMin: number
  validTempMax: number
  validHumidityMin: number
  validHumidityMax: number
}

export type EnvReading = {
  id: number
  pointId: number
  date: string
  slot: ReadingSlot
  temperature: number
  humidity: number
  recorder: string
  createdAt: string
}

// 处置状态只能顺次流转：记录 → 判定 → 整改 → 复核。
export const DISPOSAL_STATUSES = ['已记录', '已判定', '已整改', '已复核'] as const
export type DisposalStatus = (typeof DISPOSAL_STATUSES)[number]

export type DisposalHistoryEntry = {
  action: string
  operator: string
  time: string
}

export type EnvDisposal = {
  id: number
  pointId: number
  date: string
  slot: ReadingSlot
  // 温度、湿度在登记处置时从点位记录原样带出，保证两处台账读到的是同一个值。
  temperature: number
  humidity: number
  exceedKinds: string[]
  exceedDetail: string
  owner: string
  judgeNote: string
  rectifyMeasure: string
  reviewNote: string
  status: DisposalStatus
  history: DisposalHistoryEntry[]
  createdAt: string
}

// 判定完成后落到器物登记待办里的环境复核项，复核完成时勾销。
export type EnvTodo = {
  id: number
  disposalId: number
  title: string
  pointCode: string
  date: string
  slot: ReadingSlot
  judgeNote: string
  owner: string
  done: boolean
  createdAt: string
}

export type EnvironmentDb = {
  points: MonitorPoint[]
  readings: EnvReading[]
  disposals: EnvDisposal[]
  todos: EnvTodo[]
  seq: { point: number; reading: number; disposal: number; todo: number }
}
