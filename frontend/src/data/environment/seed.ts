import {
  READING_SLOTS,
  VALID_HUMIDITY_MAX,
  VALID_HUMIDITY_MIN,
  VALID_TEMP_MAX,
  VALID_TEMP_MIN,
} from './types'
import type {
  DisposalHistoryEntry,
  EnvDisposal,
  EnvReading,
  EnvTodo,
  EnvironmentDb,
  MonitorPoint,
  ReadingSlot,
} from './types'

// 示例数据：沿用 2026-10-02 当班视角，覆盖达标、超标、缺档与处置四个阶段，便于演示校验。
function point(
  id: number,
  code: string,
  name: string,
  tempMin: number,
  tempMax: number,
  humidityMin: number,
  humidityMax: number,
): MonitorPoint {
  return {
    id,
    code,
    name,
    tempMin,
    tempMax,
    humidityMin,
    humidityMax,
    validTempMin: VALID_TEMP_MIN,
    validTempMax: VALID_TEMP_MAX,
    validHumidityMin: VALID_HUMIDITY_MIN,
    validHumidityMax: VALID_HUMIDITY_MAX,
  }
}

const points: MonitorPoint[] = [
  point(1, 'KF-01', '一号综合文物库房', 15, 22, 45, 60),
  point(2, 'KF-02', '二号书画库房', 14, 20, 50, 55),
  point(3, 'KF-03', '三号金属器库房', 10, 18, 35, 50),
]

// [点位, 日期, 时段下标, 温度, 湿度, 抄表员]
type ReadingSeed = [number, string, number, number, number, string]

const readingSeeds: ReadingSeed[] = [
  // 2026-09-30：三号库午班干燥超标，后经整改复核闭环。
  [1, '2026-09-30', 0, 18.4, 52, '王秀兰'],
  [1, '2026-09-30', 1, 20.6, 55, '王秀兰'],
  [1, '2026-09-30', 2, 18.0, 53, '王秀兰'],
  [2, '2026-09-30', 0, 16.2, 52, '冯素珍'],
  [2, '2026-09-30', 1, 18.8, 54, '冯素珍'],
  [2, '2026-09-30', 2, 16.0, 52, '冯素珍'],
  [3, '2026-09-30', 0, 14.2, 42, '赵启年'],
  [3, '2026-09-30', 1, 19.6, 32, '赵启年'],
  [3, '2026-09-30', 2, 16.8, 44, '赵启年'],
  // 2026-10-01：一号、二号库午班超标，三号库午班缺档（抄表记录校验时应能挑出来）。
  [1, '2026-10-01', 0, 17.8, 51, '王秀兰'],
  [1, '2026-10-01', 1, 23.4, 62, '王秀兰'],
  [1, '2026-10-01', 2, 19.2, 56, '王秀兰'],
  [2, '2026-10-01', 0, 15.6, 51, '冯素珍'],
  [2, '2026-10-01', 1, 21.2, 57, '冯素珍'],
  [2, '2026-10-01', 2, 17.4, 53, '冯素珍'],
  [3, '2026-10-01', 0, 13.6, 40, '赵启年'],
  [3, '2026-10-01', 2, 15.2, 43, '赵启年'],
  // 2026-10-02（当日）：二号库午班温湿度双超，判定已完成、待整改复核。
  [1, '2026-10-02', 0, 17.2, 50, '王秀兰'],
  [1, '2026-10-02', 1, 20.8, 54, '王秀兰'],
  [1, '2026-10-02', 2, 17.6, 52, '王秀兰'],
  [2, '2026-10-02', 0, 15.8, 51, '冯素珍'],
  [2, '2026-10-02', 1, 22.8, 58, '冯素珍'],
  [2, '2026-10-02', 2, 18.2, 54, '冯素珍'],
  [3, '2026-10-02', 0, 12.4, 39, '赵启年'],
  [3, '2026-10-02', 1, 16.2, 44, '赵启年'],
  [3, '2026-10-02', 2, 13.8, 40, '赵启年'],
]

const readings: EnvReading[] = readingSeeds.map(([pointId, date, slotIndex, temperature, humidity, recorder], index) => ({
  id: index + 1,
  pointId,
  date,
  slot: READING_SLOTS[slotIndex] as ReadingSlot,
  temperature,
  humidity,
  recorder,
  createdAt: `${date}T${String(8 + slotIndex * 6).padStart(2, '0')}:30:00`,
}))

function history(action: string, operator: string, time: string): DisposalHistoryEntry {
  return { action, operator, time }
}

const disposals: EnvDisposal[] = [
  {
    id: 1,
    pointId: 1,
    date: '2026-10-01',
    slot: '午班 14:00',
    temperature: 23.4,
    humidity: 62,
    exceedKinds: ['温度超上限', '湿度超上限'],
    exceedDetail: '温度 23.4℃（上限 22℃），湿度 62%RH（上限 60%RH）',
    owner: '周明远',
    judgeNote: '午后空调机组停机导致温湿度双超，已安排设备排查。',
    rectifyMeasure: '重启空调机组并设定 18℃ 恒温运行，加开除湿机一台，16 时复测回落至 20.1℃/57%RH。',
    reviewNote: '',
    status: '已整改',
    history: [
      history('登记超标', '王秀兰', '2026-10-01T14:35:00'),
      history('判定超标', '钱守拙', '2026-10-01T15:10:00'),
      history('提交整改', '孙立德', '2026-10-01T16:40:00'),
    ],
    createdAt: '2026-10-01T14:35:00',
  },
  {
    id: 2,
    pointId: 2,
    date: '2026-10-01',
    slot: '午班 14:00',
    temperature: 21.2,
    humidity: 57,
    exceedKinds: ['温度超上限', '湿度超上限'],
    exceedDetail: '温度 21.2℃（上限 20℃），湿度 57%RH（上限 55%RH）',
    owner: '冯素珍',
    judgeNote: '',
    rectifyMeasure: '',
    reviewNote: '',
    status: '已记录',
    history: [history('登记超标', '冯素珍', '2026-10-01T14:40:00')],
    createdAt: '2026-10-01T14:40:00',
  },
  {
    id: 3,
    pointId: 3,
    date: '2026-09-30',
    slot: '午班 14:00',
    temperature: 19.6,
    humidity: 32,
    exceedKinds: ['温度超上限', '湿度低于下限'],
    exceedDetail: '温度 19.6℃（上限 18℃），湿度 32%RH（下限 35%RH）',
    owner: '赵启年',
    judgeNote: '门窗密封老化进风，午间干燥超标。',
    rectifyMeasure: '更换库门密封条，地面增湿并增配加湿器一台，次日湿度恢复至 40%RH 以上。',
    reviewNote: '复测连续两日达标，同意销项。',
    status: '已复核',
    history: [
      history('登记超标', '赵启年', '2026-09-30T14:35:00'),
      history('判定超标', '钱守拙', '2026-09-30T15:00:00'),
      history('提交整改', '孙立德', '2026-09-30T17:10:00'),
      history('复核通过', '钱守拙', '2026-10-02T09:20:00'),
    ],
    createdAt: '2026-09-30T14:35:00',
  },
  {
    id: 4,
    pointId: 2,
    date: '2026-10-02',
    slot: '午班 14:00',
    temperature: 22.8,
    humidity: 58,
    exceedKinds: ['温度超上限', '湿度超上限'],
    exceedDetail: '温度 22.8℃（上限 20℃），湿度 58%RH（上限 55%RH）',
    owner: '冯素珍',
    judgeNote: '午间温湿度双超，初步判断冷机风量不足，已通知设备检修。',
    rectifyMeasure: '',
    reviewNote: '',
    status: '已判定',
    history: [
      history('登记超标', '冯素珍', '2026-10-02T14:35:00'),
      history('判定超标', '钱守拙', '2026-10-02T15:05:00'),
    ],
    createdAt: '2026-10-02T14:35:00',
  },
]

// 待办与处置一一对应：判定时落入器物登记待办，复核时勾销。
const todos: EnvTodo[] = [
  {
    id: 1,
    disposalId: 1,
    title: '环境复核：KF-01 一号综合文物库房 2026-10-01 午班温湿度双超',
    pointCode: 'KF-01',
    date: '2026-10-01',
    slot: '午班 14:00',
    judgeNote: '午后空调机组停机导致温湿度双超，已安排设备排查。',
    owner: '周明远',
    done: false,
    createdAt: '2026-10-01T15:10:00',
  },
  {
    id: 2,
    disposalId: 3,
    title: '环境复核：KF-03 三号金属器库房 2026-09-30 午班温湿度超标',
    pointCode: 'KF-03',
    date: '2026-09-30',
    slot: '午班 14:00',
    judgeNote: '门窗密封老化进风，午间干燥超标。',
    owner: '赵启年',
    done: true,
    createdAt: '2026-09-30T15:00:00',
  },
  {
    id: 3,
    disposalId: 4,
    title: '环境复核：KF-02 二号书画库房 2026-10-02 午班温湿度双超',
    pointCode: 'KF-02',
    date: '2026-10-02',
    slot: '午班 14:00',
    judgeNote: '午间温湿度双超，初步判断冷机风量不足，已通知设备检修。',
    owner: '冯素珍',
    done: false,
    createdAt: '2026-10-02T15:05:00',
  },
]

export const SEED_ENVIRONMENT: EnvironmentDb = {
  points,
  readings,
  disposals,
  todos,
  seq: { point: points.length, reading: readings.length, disposal: disposals.length, todo: todos.length },
}
