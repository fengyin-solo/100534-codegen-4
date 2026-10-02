<template>
  <section class="page env-page" data-module="environment">
    <header class="page-head">
      <div>
        <h2>库房环境册</h2>
        <p class="page-desc">
          按监测点位分栏记录老式表盘手抄温湿度，逐栏汇总当日最高最低值；越限时段单独突出，超标处置按
          记录 → 判定 → 整改 → 复核 顺次流转。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openReading">登记抄表读数</button>
        <button class="btn" type="button" @click="openPoint">新增监测点位</button>
        <button class="btn" type="button" @click="runVerify">校验抄表记录</button>
        <button class="btn ghost" type="button" @click="resetAll">恢复示例数据</button>
      </div>
    </header>

    <div class="stat-row">
      <article class="stat-card">
        <span class="stat-label">在册监测点位</span>
        <strong class="stat-value">{{ stats.pointCount }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">{{ date }} 抄表档数</span>
        <strong class="stat-value">{{ stats.readingSlots }}/{{ stats.pointCount * 3 }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">{{ date }} 越限时段</span>
        <strong class="stat-value" :class="{ 'stat-danger': stats.exceeded > 0 }">{{ stats.exceeded }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">处置流转中</span>
        <strong class="stat-value" :class="{ 'stat-danger': stats.flowing > 0 }">{{ stats.flowing }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">器物登记待办（环境复核）</span>
        <strong class="stat-value" :class="{ 'stat-danger': stats.openTodos > 0 }">{{ stats.openTodos }}</strong>
      </article>
    </div>

    <form class="filter-bar" @submit.prevent>
      <label class="filter-item">
        <span>台账日期</span>
        <input v-model="date" type="date" @change="reload" />
      </label>
      <button class="btn" type="button" @click="reload">刷新台账</button>
    </form>

    <h3 class="block-title">一、点位分栏台账（{{ date }}）</h3>
    <div class="ledger-columns">
      <article v-for="column in ledger" :key="column.point.id" class="point-column" :class="{ 'column-danger': column.exceededSlots.length > 0 }">
        <header class="point-column-head">
          <strong>{{ column.point.code }} {{ column.point.name }}</strong>
          <span class="range-hint">
            温 {{ column.point.tempMin }}~{{ column.point.tempMax }}℃ · 湿 {{ column.point.humidityMin }}~{{ column.point.humidityMax }}%RH
          </span>
        </header>
        <div class="extreme-grid">
          <div class="extreme-cell">
            <span class="extreme-label">温度最低</span>
            <strong>{{ column.tempMin === null ? '—' : column.tempMin + '℃' }}</strong>
          </div>
          <div class="extreme-cell">
            <span class="extreme-label">温度最高</span>
            <strong :class="{ 'cell-danger': isTempOver(column) }">{{ column.tempMax === null ? '—' : column.tempMax + '℃' }}</strong>
          </div>
          <div class="extreme-cell">
            <span class="extreme-label">湿度最低</span>
            <strong>{{ column.humidityMin === null ? '—' : column.humidityMin + '%RH' }}</strong>
          </div>
          <div class="extreme-cell">
            <span class="extreme-label">湿度最高</span>
            <strong :class="{ 'cell-danger': isHumidityOver(column) }">{{ column.humidityMax === null ? '—' : column.humidityMax + '%RH' }}</strong>
          </div>
        </div>
        <p class="column-foot">
          已抄 {{ column.readingCount }}/3 档
          <span v-if="column.readingCount < 3" class="warn-text">（有缺档，校验时会提示）</span>
        </p>
      </article>
    </div>

    <h3 class="block-title danger-title">
      二、越限时段（{{ date }}）
      <span class="title-hint">落出允许区间的时段单独突出，处置跟进人写在这里</span>
    </h3>
    <table class="data-table exceed-table">
      <thead>
        <tr>
          <th>监测点位</th><th>时段</th><th>温度读数</th><th>湿度读数</th><th>超标情况</th>
          <th>处置跟进人</th><th>处置单号/状态</th><th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in exceededRows" :key="`${row.pointId}-${row.slot}`" class="exceed-row">
          <td>{{ row.pointLabel }}</td>
          <td>{{ row.slot }}</td>
          <td class="cell-danger">{{ row.reading.temperature }}℃</td>
          <td class="cell-danger">{{ row.reading.humidity }}%RH</td>
          <td>{{ row.kinds.join('、') }}</td>
          <td>{{ row.owner || '待指派' }}</td>
          <td>
            <span v-if="row.disposal">{{ row.disposalNo }} · {{ row.disposal.status }}</span>
            <span v-else class="warn-text">未登记处置</span>
          </td>
          <td class="row-actions">
            <button v-if="!row.disposal" class="link danger-link" type="button" @click="openRegister(row.reading)">
              登记超标处置
            </button>
            <RouterLink v-else class="link" :to="{ path: '/environment', query: { focus: String(row.disposal.id), date } }">
              查看处置
            </RouterLink>
          </td>
        </tr>
        <tr v-if="!exceededRows.length">
          <td colspan="8" class="empty-state">{{ date }} 各点位温湿度均在允许区间内，无越限时段</td>
        </tr>
      </tbody>
    </table>

    <div class="block-head-row">
      <h3 class="block-title">三、当日抄表明细</h3>
      <div class="legend-inline">
        <span class="legend-item">仪表有效量限：温度 -20~60℃ · 湿度 0~100%RH，超出按无效值退回</span>
      </div>
    </div>
    <table class="data-table">
      <thead>
        <tr><th>监测点位</th><th>时段</th><th>温度</th><th>湿度</th><th>抄表员</th><th>是否越限</th></tr>
      </thead>
      <tbody>
        <tr v-for="reading in dayReadings" :key="reading.id" :class="{ 'exceed-row': isExceeded(reading) }">
          <td>{{ pointLabel(reading.pointId) }}</td>
          <td>{{ reading.slot }}</td>
          <td :class="{ 'cell-danger': isExceeded(reading) }">{{ reading.temperature }}℃</td>
          <td :class="{ 'cell-danger': isExceeded(reading) }">{{ reading.humidity }}%RH</td>
          <td>{{ reading.recorder }}</td>
          <td>
            <span v-if="isExceeded(reading)" class="danger-tag">越限</span>
            <span v-else class="ok-tag">达标</span>
          </td>
        </tr>
        <tr v-if="!dayReadings.length">
          <td colspan="6" class="empty-state">{{ date }} 还没有抄表记录，点击右上角「登记抄表读数」开始抄表</td>
        </tr>
      </tbody>
    </table>

    <div class="block-head-row">
      <h3 class="block-title">四、超标处置台账</h3>
      <div class="status-filter">
        <button
          v-for="item in statusFilters"
          :key="item"
          class="chip"
          :class="{ 'chip-active': statusFilter === item }"
          type="button"
          @click="statusFilter = item"
        >
          {{ item }}
        </button>
      </div>
    </div>
    <p class="status-legend">
      <span class="legend-item">顺次流转：已记录 → 已判定 → 已整改 → 已复核，不允许跳步；未填整改措施不许复核</span>
    </p>
    <table class="data-table disposal-table">
      <thead>
        <tr>
          <th>处置单号</th><th>监测点位</th><th>超标时段</th><th>温度/湿度（与点位记录一致）</th>
          <th>超标情况</th><th>跟进人</th><th>整改措施</th><th>状态</th><th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="disposal in filteredDisposals" :key="disposal.id" :data-disposal-id="disposal.id" :class="{ 'focus-row': focusedDisposalId === disposal.id }">
          <td>{{ disposalNo(disposal) }}</td>
          <td>{{ pointLabel(disposal.pointId) }}</td>
          <td>{{ disposal.date }} {{ disposal.slot }}</td>
          <td>{{ disposal.temperature }}℃ / {{ disposal.humidity }}%RH</td>
          <td>{{ disposal.exceedKinds.join('、') }}</td>
          <td>{{ disposal.owner }}</td>
          <td class="measure-cell">{{ disposal.rectifyMeasure || '—' }}</td>
          <td><span class="status-tag" :class="`status-${disposal.status}`">{{ disposal.status }}</span></td>
          <td class="row-actions">
            <button v-if="disposal.status === '已记录'" class="link" type="button" @click="openJudge(disposal)">判定</button>
            <button v-if="disposal.status === '已判定'" class="link" type="button" @click="openRectify(disposal)">整改</button>
            <button v-if="disposal.status === '已整改'" class="link" type="button" @click="openReview(disposal)">复核</button>
            <span v-if="disposal.status === '已复核'" class="muted-text">已闭环</span>
          </td>
        </tr>
        <tr v-if="!filteredDisposals.length">
          <td colspan="9" class="empty-state">没有符合条件的超标处置记录</td>
        </tr>
      </tbody>
    </table>

    <h3 class="block-title">五、监测点位册</h3>
    <table class="data-table">
      <thead>
        <tr>
          <th>点位编号</th><th>点位名称</th><th>温度允许区间</th><th>湿度允许区间</th><th>仪表有效量限</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="point in points" :key="point.id">
          <td>{{ point.code }}</td>
          <td>{{ point.name }}</td>
          <td>{{ point.tempMin }}~{{ point.tempMax }}℃</td>
          <td>{{ point.humidityMin }}~{{ point.humidityMax }}%RH</td>
          <td>{{ point.validTempMin }}~{{ point.validTempMax }}℃ · {{ point.validHumidityMin }}~{{ point.validHumidityMax }}%RH</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>数据保存在本机浏览器；器物登记页设有「环境复核」待办栏，与处置状态联动</span>
      <span v-if="serviceMessage" :class="serviceOk ? 'ok-text' : 'error-text'">{{ serviceMessage }}</span>
    </footer>

    <!-- 抄表读数录入 -->
    <div v-if="readingModal.open" class="modal-mask" @click.self="closeModals">
      <div class="modal-card">
        <h3>登记抄表读数</h3>
        <p class="modal-hint">同一点位同一时段重复提交只算一条；读数超出仪表有效量限按无效值退回。</p>
        <label class="form-row">
          <span>监测点位</span>
          <select v-model="readingModal.pointId">
            <option v-for="point in points" :key="point.id" :value="point.id">{{ point.code }} {{ point.name }}</option>
          </select>
        </label>
        <label class="form-row">
          <span>抄表日期</span>
          <input v-model="readingModal.date" type="date" />
        </label>
        <label class="form-row">
          <span>抄表时段</span>
          <select v-model="readingModal.slot">
            <option v-for="slot in slots" :key="slot" :value="slot">{{ slot }}</option>
          </select>
        </label>
        <label class="form-row">
          <span>温度读数（℃，有效 -20~60）</span>
          <input v-model.number="readingModal.temperature" type="number" step="0.1" min="-20" max="60" placeholder="如 22.5" />
        </label>
        <label class="form-row">
          <span>湿度读数（%RH，有效 0~100）</span>
          <input v-model.number="readingModal.humidity" type="number" step="1" min="0" max="100" placeholder="如 55" />
        </label>
        <label class="form-row">
          <span>抄表员</span>
          <input v-model="readingModal.recorder" placeholder="签上手抄表盘的人" />
        </label>
        <p v-if="readingModal.error" class="error-text">{{ readingModal.error }}</p>
        <div class="modal-actions">
          <button class="btn ghost" type="button" @click="closeModals">取消</button>
          <button class="btn primary" type="button" @click="saveReading">提交读数</button>
        </div>
      </div>
    </div>

    <!-- 超标处置登记 -->
    <div v-if="registerModal.open" class="modal-mask" @click.self="closeModals">
      <div class="modal-card">
        <h3>登记超标处置</h3>
        <p class="modal-hint">温度湿度直接取自点位记录，两账必须一致；跟进人写清由谁处理。</p>
        <label class="form-row">
          <span>监测点位</span>
          <select v-model="registerModal.pointId">
            <option v-for="point in points" :key="point.id" :value="point.id">{{ point.code }} {{ point.name }}</option>
          </select>
        </label>
        <label class="form-row">
          <span>超标日期</span>
          <input v-model="registerModal.date" type="date" />
        </label>
        <label class="form-row">
          <span>超标时段</span>
          <select v-model="registerModal.slot">
            <option v-for="slot in slots" :key="slot" :value="slot">{{ slot }}</option>
          </select>
        </label>
        <label class="form-row">
          <span>跟进人</span>
          <input v-model="registerModal.owner" placeholder="该超标处置由谁跟进" />
        </label>
        <p v-if="registerModal.error" class="error-text">{{ registerModal.error }}</p>
        <div class="modal-actions">
          <button class="btn ghost" type="button" @click="closeModals">取消</button>
          <button class="btn primary" type="button" @click="saveRegister">登记处置</button>
        </div>
      </div>
    </div>

    <!-- 判定 / 整改 / 复核 共用弹窗 -->
    <div v-if="actionModal.open" class="modal-mask" @click.self="closeModals">
      <div class="modal-card">
        <h3>{{ actionModal.title }}</h3>
        <p class="modal-hint">{{ actionModal.hint }}</p>
        <div v-if="actionModal.disposal" class="form-readonly">
          {{ disposalNo(actionModal.disposal) }} · {{ pointLabel(actionModal.disposal.pointId) }}
          · {{ actionModal.disposal.date }} {{ actionModal.disposal.slot }}
          · {{ actionModal.disposal.temperature }}℃/{{ actionModal.disposal.humidity }}%RH
        </div>
        <label v-if="actionModal.mode === 'judge'" class="form-row">
          <span>判定批复意见</span>
          <textarea v-model="actionModal.note" rows="3" placeholder="判定是否构成超标、原因初判与处置要求"></textarea>
        </label>
        <label v-if="actionModal.mode === 'rectify'" class="form-row">
          <span>整改措施（不填不许进入复核）</span>
          <textarea v-model="actionModal.note" rows="3" placeholder="写明采取的措施、复测结果"></textarea>
        </label>
        <label v-if="actionModal.mode === 'review'" class="form-row">
          <span>复核意见</span>
          <textarea v-model="actionModal.note" rows="3" placeholder="复核是否通过、可否销项"></textarea>
        </label>
        <label class="form-row">
          <span>经办人</span>
          <input v-model="actionModal.operator" />
        </label>
        <p v-if="actionModal.error" class="error-text">{{ actionModal.error }}</p>
        <div class="modal-actions">
          <button class="btn ghost" type="button" @click="closeModals">取消</button>
          <button class="btn primary" type="button" @click="saveAction">确认{{ actionModal.title }}</button>
        </div>
      </div>
    </div>

    <!-- 新增监测点位 -->
    <div v-if="pointModal.open" class="modal-mask" @click.self="closeModals">
      <div class="modal-card">
        <h3>新增监测点位</h3>
        <label class="form-row">
          <span>点位编号</span>
          <input v-model="pointModal.code" placeholder="如 KF-04" />
        </label>
        <label class="form-row">
          <span>点位名称</span>
          <input v-model="pointModal.name" placeholder="如 四号陶瓷库房" />
        </label>
        <div class="form-grid-2">
          <label class="form-row">
            <span>温度下限（℃）</span>
            <input v-model.number="pointModal.tempMin" type="number" step="0.5" />
          </label>
          <label class="form-row">
            <span>温度上限（℃）</span>
            <input v-model.number="pointModal.tempMax" type="number" step="0.5" />
          </label>
          <label class="form-row">
            <span>湿度下限（%RH）</span>
            <input v-model.number="pointModal.humidityMin" type="number" step="1" />
          </label>
          <label class="form-row">
            <span>湿度上限（%RH）</span>
            <input v-model.number="pointModal.humidityMax" type="number" step="1" />
          </label>
        </div>
        <p v-if="pointModal.error" class="error-text">{{ pointModal.error }}</p>
        <div class="modal-actions">
          <button class="btn ghost" type="button" @click="closeModals">取消</button>
          <button class="btn primary" type="button" @click="savePoint">登记点位</button>
        </div>
      </div>
    </div>

    <!-- 抄表校验报告 -->
    <div v-if="verifyReport" class="modal-mask" @click.self="verifyReport = null">
      <div class="modal-card modal-wide">
        <h3>抄表记录校验报告</h3>
        <p class="modal-hint">校验时刻：{{ verifyReport.checkedAt }}</p>
        <p>
          <span class="danger-tag" v-if="verifyReport.errorCount">错误 {{ verifyReport.errorCount }} 项</span>
          <span class="warn-tag" v-if="verifyReport.warnCount">提醒 {{ verifyReport.warnCount }} 项</span>
          <span v-if="!verifyReport.errorCount && !verifyReport.warnCount" class="ok-tag">全部通过：无效值、重复、缺档、两账一致、流转合规与超标处置均无问题</span>
        </p>
        <div v-for="group in verifyReport.groups" :key="group.name" class="verify-group">
          <h4 class="verify-group-title">
            {{ group.name }}
            <span :class="group.items.length ? 'warn-text' : 'ok-text'">（{{ group.items.length }} 项）</span>
          </h4>
          <ul v-if="group.items.length" class="verify-list">
            <li v-for="(item, index) in group.items" :key="index" :class="item.level === 'error' ? 'error-text' : 'warn-text'">
              {{ item.message }}
            </li>
          </ul>
          <p v-else class="ok-text verify-ok">通过</p>
        </div>
        <div class="modal-actions">
          <button class="btn primary" type="button" @click="verifyReport = null">知道了</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useSessionStore } from '@/stores/session'
import {
  buildLedger,
  createPoint,
  disposalNumber,
  judgeDisposal,
  listDisposals,
  listPoints,
  listReadings,
  listTodos,
  pointLabel,
  rectifyDisposal,
  registerDisposal,
  resetLedger,
  reviewDisposal,
  submitReading,
  verifyReadings,
  type LedgerColumn,
  type ServiceResult,
  type VerifyReport,
} from '@/api/environment-service'
import type {
  EnvDisposal,
  EnvReading,
  MonitorPoint,
  ReadingSlot,
} from '@/data/environment/types'
import { READING_SLOTS } from '@/data/environment/types'

const session = useSessionStore()
const route = useRoute()
const router = useRouter()

const slots = READING_SLOTS
function today(): string {
  const nowDate = new Date()
  const month = String(nowDate.getMonth() + 1).padStart(2, '0')
  const day = String(nowDate.getDate()).padStart(2, '0')
  return `${nowDate.getFullYear()}-${month}-${day}`
}

const date = ref(today())
const points = ref<MonitorPoint[]>([])
const ledger = ref<LedgerColumn[]>([])
const dayReadings = ref<EnvReading[]>([])
const disposals = ref<EnvDisposal[]>([])
const statusFilter = ref('全部')
const statusFilters = ['全部', '已记录', '已判定', '已整改', '已复核']
const focusedDisposalId = ref<number | null>(null)

const serviceMessage = ref('')
const serviceOk = ref(true)

const readingModal = reactive({
  open: false,
  pointId: 1,
  date: today(),
  slot: '早班 08:00' as ReadingSlot,
  temperature: undefined as number | undefined,
  humidity: undefined as number | undefined,
  recorder: session.operator,
  error: '',
})

const registerModal = reactive({
  open: false,
  pointId: 1,
  date: today(),
  slot: '早班 08:00' as ReadingSlot,
  owner: session.operator,
  error: '',
})

const actionModal = reactive({
  open: false,
  mode: 'judge' as 'judge' | 'rectify' | 'review',
  title: '',
  hint: '',
  disposal: null as EnvDisposal | null,
  note: '',
  operator: session.operator,
  error: '',
})

const pointModal = reactive({
  open: false,
  code: '',
  name: '',
  tempMin: 15,
  tempMax: 22,
  humidityMin: 45,
  humidityMax: 60,
  error: '',
})

const verifyReport = ref<VerifyReport | null>(null)

const stats = computed(() => {
  const exceeded = ledger.value.reduce((sum, column) => sum + column.exceededSlots.length, 0)
  const readingSlots = ledger.value.reduce((sum, column) => sum + column.readingCount, 0)
  return {
    pointCount: points.value.length,
    readingSlots,
    exceeded,
    flowing: disposals.value.filter((row) => row.status !== '已复核').length,
    openTodos: listTodos(false).length,
  }
})

const exceededRows = computed(() =>
  ledger.value.flatMap((column) =>
    column.exceededSlots.map((item) => {
      const disposal = disposals.value.find((row) => row.id === item.disposalId)
      return {
        pointId: column.point.id,
        pointLabel: `${column.point.code} ${column.point.name}`,
        slot: item.slot,
        reading: item.reading,
        kinds: item.kinds,
        owner: disposal?.owner ?? '',
        disposal,
        disposalNo: disposal ? disposalNumber(disposal) : '',
      }
    }),
  ),
)

const filteredDisposals = computed(() =>
  statusFilter.value === '全部'
    ? disposals.value
    : disposals.value.filter((row) => row.status === statusFilter.value),
)

function isTempOver(column: LedgerColumn): boolean {
  return (
    (column.tempMax !== null && column.tempMax > column.point.tempMax) ||
    (column.tempMin !== null && column.tempMin < column.point.tempMin)
  )
}

function isHumidityOver(column: LedgerColumn): boolean {
  return (
    (column.humidityMax !== null && column.humidityMax > column.point.humidityMax) ||
    (column.humidityMin !== null && column.humidityMin < column.point.humidityMin)
  )
}

function isExceeded(reading: EnvReading): boolean {
  const point = points.value.find((row) => row.id === reading.pointId)
  if (!point) {
    return false
  }
  return (
    reading.temperature > point.tempMax || reading.temperature < point.tempMin ||
    reading.humidity > point.humidityMax || reading.humidity < point.humidityMin
  )
}

function disposalNo(disposal: EnvDisposal): string {
  return disposalNumber(disposal)
}

function flash(message: string, ok: boolean) {
  serviceMessage.value = message
  serviceOk.value = ok
}

function reload() {
  points.value = listPoints()
  ledger.value = buildLedger(date.value)
  dayReadings.value = listReadings(date.value)
  disposals.value = listDisposals()
}

function resetAll() {
  if (!window.confirm('确定恢复为示例环境册数据？本机已登记的读数与处置将被覆盖。')) {
    return
  }
  resetLedger()
  date.value = today()
  focusedDisposalId.value = null
  reload()
  flash('已恢复示例数据', true)
}

function closeModals() {
  readingModal.open = false
  registerModal.open = false
  actionModal.open = false
  pointModal.open = false
}

function openReading() {
  Object.assign(readingModal, {
    open: true,
    pointId: points.value[0]?.id ?? 1,
    date: date.value,
    slot: '早班 08:00' as ReadingSlot,
    temperature: undefined,
    humidity: undefined,
    recorder: session.operator,
    error: '',
  })
}

function saveReading() {
  if (readingModal.temperature === undefined || readingModal.humidity === undefined) {
    readingModal.error = '温度与湿度读数都要填写'
    return
  }
  const result = submitReading({
    pointId: Number(readingModal.pointId),
    date: readingModal.date,
    slot: readingModal.slot,
    temperature: Number(readingModal.temperature),
    humidity: Number(readingModal.humidity),
    recorder: readingModal.recorder,
  })
  if (!result.ok) {
    readingModal.error = result.message
    return
  }
  closeModals()
  reload()
  flash(result.message, true)
}

function openRegister(reading?: EnvReading) {
  Object.assign(registerModal, {
    open: true,
    pointId: reading?.pointId ?? points.value[0]?.id ?? 1,
    date: reading?.date ?? date.value,
    slot: (reading?.slot ?? '早班 08:00') as ReadingSlot,
    owner: session.operator,
    error: '',
  })
}

function saveRegister() {
  const result = registerDisposal({
    pointId: Number(registerModal.pointId),
    date: registerModal.date,
    slot: registerModal.slot,
    owner: registerModal.owner,
  })
  if (!result.ok) {
    registerModal.error = result.message
    return
  }
  closeModals()
  reload()
  if (result.data) {
    focusedDisposalId.value = result.data.id
  }
  flash(result.message, true)
}

function openJudge(disposal: EnvDisposal) {
  Object.assign(actionModal, {
    open: true,
    mode: 'judge',
    title: '判定',
    hint: '判定批复完成后，环境复核项会自动落到器物登记的待办里。',
    disposal,
    note: disposal.judgeNote,
    operator: session.operator,
    error: '',
  })
}

function openRectify(disposal: EnvDisposal) {
  Object.assign(actionModal, {
    open: true,
    mode: 'rectify',
    title: '整改',
    hint: '整改措施是进入复核的前置条件，没写措施不许提交。',
    disposal,
    note: disposal.rectifyMeasure,
    operator: session.operator,
    error: '',
  })
}

function openReview(disposal: EnvDisposal) {
  Object.assign(actionModal, {
    open: true,
    mode: 'review',
    title: '复核',
    hint: '记录、判定、整改走完才轮到复核；复核通过后器物登记待办自动勾销。',
    disposal,
    note: disposal.reviewNote,
    operator: session.operator,
    error: '',
  })
}

function saveAction() {
  if (!actionModal.disposal) {
    return
  }
  const id = actionModal.disposal.id
  let result: ServiceResult<EnvDisposal>
  if (actionModal.mode === 'judge') {
    result = judgeDisposal(id, actionModal.operator, actionModal.note)
  } else if (actionModal.mode === 'rectify') {
    result = rectifyDisposal(id, actionModal.operator, actionModal.note)
  } else {
    result = reviewDisposal(id, actionModal.operator, actionModal.note)
  }
  if (!result.ok) {
    actionModal.error = result.message
    return
  }
  const finishedId = id
  closeModals()
  reload()
  focusedDisposalId.value = finishedId
  flash(result.message, true)
}

function openPoint() {
  Object.assign(pointModal, {
    open: true,
    code: '',
    name: '',
    tempMin: 15,
    tempMax: 22,
    humidityMin: 45,
    humidityMax: 60,
    error: '',
  })
}

function savePoint() {
  const result = createPoint({
    code: pointModal.code,
    name: pointModal.name,
    tempMin: Number(pointModal.tempMin),
    tempMax: Number(pointModal.tempMax),
    humidityMin: Number(pointModal.humidityMin),
    humidityMax: Number(pointModal.humidityMax),
  })
  if (!result.ok) {
    pointModal.error = result.message
    return
  }
  closeModals()
  reload()
  flash(result.message, true)
}

function runVerify() {
  verifyReport.value = verifyReadings()
}

onMounted(() => {
  reload()
  const focus = route.query.focus
  const queryDate = typeof route.query.date === 'string' ? route.query.date : ''
  if (queryDate) {
    date.value = queryDate
    reload()
  }
  if (focus) {
    focusedDisposalId.value = Number(focus)
    statusFilter.value = '全部'
    window.setTimeout(() => {
      document
        .querySelector(`[data-disposal-id="${focus}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
    router.replace({ path: '/environment' })
  }
})
</script>
