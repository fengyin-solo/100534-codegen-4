// 库房环境册业务规则无头校验：jsdom 提供 localStorage，直接跑真实服务层。
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
globalThis.window = dom.window
globalThis.localStorage = dom.window.localStorage
globalThis.document = dom.window.document

const svc = await import('@/api/environment-service')

let passed = 0
let failed = 0
function check(name, cond, detail = '') {
  if (cond) {
    passed += 1
    console.log(`  ✓ ${name}`)
  } else {
    failed += 1
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}
function ok(result) {
  return result.ok
}
function bad(result) {
  return !result.ok
}

// 每个用例组先清业务数据（点位册保留），保证互不干扰。
function clearDb() {
  svc.clearLedgerRecords()
}

// 一、读数：无效值退回 + 同点位同时段去重 + 越限入账并提示
{
  clearDb()
  console.log('抄表读数')
  const badTemp = svc.submitReading({ pointId: 1, date: '2026-10-02', slot: '早班 08:00', temperature: 99, humidity: 50, recorder: '甲' })
  check('温度超出仪表量限按无效值退回', bad(badTemp), badTemp.message)
  const badHum = svc.submitReading({ pointId: 1, date: '2026-10-02', slot: '早班 08:00', temperature: 20, humidity: 120, recorder: '甲' })
  check('湿度超出仪表量限按无效值退回', bad(badHum), badHum.message)
  const noRecorder = svc.submitReading({ pointId: 1, date: '2026-10-02', slot: '早班 08:00', temperature: 20, humidity: 50, recorder: '' })
  check('未署名的抄表退回', bad(noRecorder), noRecorder.message)
  const first = svc.submitReading({ pointId: 1, date: '2026-10-02', slot: '早班 08:00', temperature: 20, humidity: 50, recorder: '甲' })
  check('正常读数入账', ok(first))
  const dup = svc.submitReading({ pointId: 1, date: '2026-10-02', slot: '早班 08:00', temperature: 21, humidity: 51, recorder: '乙' })
  check('同点位同时段重复提交只算一条', bad(dup), dup.message)
  check('重复提交未产生第二条记录', svc.listReadings('2026-10-02', 1).length === 1)
  const exceed = svc.submitReading({ pointId: 1, date: '2026-10-02', slot: '午班 14:00', temperature: 30, humidity: 70, recorder: '甲' })
  check('超出允许区间（未超量限）的读数仍入账', ok(exceed) && svc.listReadings('2026-10-02', 1).length === 2, exceed.message)
  check('越限读数入账时给出超标提示', exceed.message.includes('超标'), exceed.message)
}

// 二、分栏台账：最高最低 + 越限时段单列
{
  clearDb()
  console.log('点位分栏台账')
  svc.submitReading({ pointId: 1, date: '2026-10-02', slot: '早班 08:00', temperature: 16, humidity: 46, recorder: '甲' })
  svc.submitReading({ pointId: 1, date: '2026-10-02', slot: '午班 14:00', temperature: 23.4, humidity: 62, recorder: '甲' })
  svc.submitReading({ pointId: 1, date: '2026-10-02', slot: '晚班 20:00', temperature: 18, humidity: 55, recorder: '甲' })
  const ledger = svc.buildLedger('2026-10-02')
  const col1 = ledger.find((c) => c.point.id === 1)
  check('温度最高最低正确', col1.tempMax === 23.4 && col1.tempMin === 16, `${col1.tempMin}~${col1.tempMax}`)
  check('湿度最高最低正确', col1.humidityMax === 62 && col1.humidityMin === 46, `${col1.humidityMin}~${col1.humidityMax}`)
  check('越限时段单独挑出', col1.exceededSlots.length === 1 && col1.exceededSlots[0].slot === '午班 14:00')
  check('未登记处置时 disposalId 为空', col1.exceededSlots[0].disposalId === null)
  const emptyCol = ledger.find((c) => c.point.id === 3)
  check('无读数的栏位极值为空', emptyCol.tempMax === null && emptyCol.readingCount === 0)
}

// 三、处置：顺次流转、禁跳步、无措施禁复核、跟进人必填
{
  clearDb()
  console.log('超标处置流转')
  svc.submitReading({ pointId: 2, date: '2026-10-02', slot: '午班 14:00', temperature: 22.8, humidity: 58, recorder: '甲' })
  const noOwner = svc.registerDisposal({ pointId: 2, date: '2026-10-02', slot: '午班 14:00', owner: '' })
  check('跟进人必填', bad(noOwner), noOwner.message)
  const noReading = svc.registerDisposal({ pointId: 2, date: '2026-10-02', slot: '晚班 20:00', owner: '丙' })
  check('无点位记录时不能凭空登记处置', bad(noReading), noReading.message)
  const reg = svc.registerDisposal({ pointId: 2, date: '2026-10-02', slot: '午班 14:00', owner: '冯素珍' })
  check('超标处置登记成功', ok(reg), reg.message)
  const id = reg.data.id
  const dupReg = svc.registerDisposal({ pointId: 2, date: '2026-10-02', slot: '午班 14:00', owner: '冯素珍' })
  check('同点位同时段重复处置被挡（超时不记两次）', bad(dupReg), dupReg.message)
  check('台账温度与点位记录一致', reg.data.temperature === 22.8 && reg.data.humidity === 58)
  check('未判定时不能整改', bad(svc.rectifyDisposal(id, '人', '措施')))
  check('未判定时不能复核', bad(svc.reviewDisposal(id, '人', '意见')))
  const noNote = svc.judgeDisposal(id, '钱', '')
  check('判定批复必填', bad(noNote), noNote.message)
  check('判定前器物登记待办为空', svc.listTodos(false).length === 0)
  const judge = svc.judgeDisposal(id, '钱守拙', '冷机风量不足')
  check('判定成功', ok(judge), judge.message)
  check('判定批复落成器物登记待办', svc.listTodos(false).length === 1 && svc.listTodos(false)[0].disposalId === id)
  check('已判定不能重复判定', bad(svc.judgeDisposal(id, '钱', '再判')))
  const noMeasure = svc.rectifyDisposal(id, '孙', '')
  check('没写整改措施不许提交整改/进复核', bad(noMeasure), noMeasure.message)
  const reviewEarly = svc.reviewDisposal(id, '钱', '过')
  check('整改未完成不许复核', bad(reviewEarly), reviewEarly.message)
  check('整改前待办保持未勾销', svc.listTodos(false).length === 1)
  const rectify = svc.rectifyDisposal(id, '孙立德', '检修冷机，复测 19℃/53%')
  check('整改成功', ok(rectify), rectify.message)
  const rectifyAgain = svc.rectifyDisposal(id, '孙', '再改')
  check('已整改不能再次整改', bad(rectifyAgain), rectifyAgain.message)
  const review = svc.reviewDisposal(id, '钱守拙', '复测达标，销项')
  check('复核成功', ok(review), review.message)
  check('复核后待办自动勾销', svc.listTodos(false).length === 0 && svc.listTodos(true)[0].done === true)
  const statuses = svc.listDisposals('2026-10-02').find((d) => d.id === id)
  check('最终状态为已复核且历史四步齐全', statuses.status === '已复核' && statuses.history.length === 4)
}

// 四、抄表校验：无效值/重复/缺档/两账不一致/越级/超标未处置/待办勾稽
{
  clearDb()
  console.log('抄表记录校验')
  // 正常一天 + 一个缺档
  svc.submitReading({ pointId: 1, date: '2026-10-01', slot: '早班 08:00', temperature: 18, humidity: 50, recorder: '甲' })
  svc.submitReading({ pointId: 1, date: '2026-10-01', slot: '午班 14:00', temperature: 23, humidity: 62, recorder: '甲' })
  // 越限已处置并走到复核，待办应勾销
  const reg = svc.registerDisposal({ pointId: 1, date: '2026-10-01', slot: '午班 14:00', owner: '周' })
  svc.judgeDisposal(reg.data.id, '钱', '原因')
  svc.rectifyDisposal(reg.data.id, '孙', '措施')
  svc.reviewDisposal(reg.data.id, '钱', '通过')
  // 另一处越限不处置
  svc.submitReading({ pointId: 3, date: '2026-10-01', slot: '午班 14:00', temperature: 19.6, humidity: 32, recorder: '赵' })
  // 直接构造脏数据：两账温度不一致（校验入口兜底历史脏数据）
  svc.__tamperDisposalReadingForVerify(reg.data.id, 99)
  const report = svc.verifyReadings()
  const group = (name) => report.groups.find((g) => g.name === name)
  check('校验报告包含七个检查组', report.groups.length === 7)
  check('缺档能被挑出（一号库晚班）', group('缺档未抄').items.some((i) => i.message.includes('晚班 20:00')))
  check('两账温度不一致能被挑出', group('两账读数一致').items.some((i) => i.message.includes('不一致')))
  check('超标未处置能被挑出', group('超标未处置').items.some((i) => i.message.includes('KF-03')))
  check('正常复核闭环的处置不产生越级告警', !group('处置流转合规').items.some((i) => i.message.includes(svc.disposalNumber(reg.data))))
  check('复核后待办勾稽通过', group('待办勾稽').items.length === 0, JSON.stringify(group('待办勾稽').items))
  check('报告给出错误与提醒计数', report.errorCount >= 1 && report.warnCount >= 2, `err=${report.errorCount} warn=${report.warnCount}`)
}

// 五、干净数据校验应全部通过
{
  clearDb()
  console.log('干净数据校验')
  for (const point of svc.listPoints()) {
    for (const slot of ['早班 08:00', '午班 14:00', '晚班 20:00']) {
      svc.submitReading({ pointId: point.id, date: '2026-10-02', slot, temperature: 17, humidity: 50, recorder: '甲' })
    }
  }
  const report = svc.verifyReadings()
  check('全部达标且三档抄齐时零告警', report.errorCount === 0 && report.warnCount === 0)
}

// 六、点位册与允许区间校验
{
  clearDb()
  console.log('监测点位')
  const dup = svc.createPoint({ code: 'KF-01', name: '重号', tempMin: 15, tempMax: 22, humidityMin: 45, humidityMax: 60 })
  check('点位编号不能重号', bad(dup), dup.message)
  const badRange = svc.createPoint({ code: 'KF-09', name: '区间倒置', tempMin: 25, tempMax: 10, humidityMin: 45, humidityMax: 60 })
  check('允许区间下限>=上限退回', bad(badRange), badRange.message)
  const created = svc.createPoint({ code: 'KF-04', name: '四号库', tempMin: 12, tempMax: 20, humidityMin: 40, humidityMax: 55 })
  check('新点位登记成功', ok(created) && svc.listPoints().length === 4)
  check('新点位自带仪表有效量限', created.data.validTempMin === -20 && created.data.validHumidityMax === 100)
}

// 七、种子数据自检：示例库自带一个缺档、三个状态阶段的处置与两条待办
{
  localStorage.clear()
  svc.resetLedger()
  console.log('示例数据')
  check('种子含 3 个点位', svc.listPoints().length === 3)
  check('2026-10-02 二号库午班为越限时段', svc.buildLedger('2026-10-02').find((c) => c.point.id === 2).exceededSlots.length === 1)
  const statuses = svc.listDisposals().map((d) => d.status).sort()
  check('种子覆盖四种处置状态', ['已判定', '已复核', '已整改', '已记录'].every((s) => statuses.includes(s)))
  check('种子待办：两条未复核一条已勾销', svc.listTodos(false).length === 2 && svc.listTodos(true).filter((t) => t.done).length === 1)
  const report = svc.verifyReadings()
  check('种子校验：仅有 10-01 三号库缺档提醒，无错误', report.warnCount === 1 && report.errorCount === 0, `err=${report.errorCount} warn=${report.warnCount}`)
}

console.log(`\n结果：${passed} 通过，${failed} 失败`)
process.exit(failed === 0 ? 0 : 1)
