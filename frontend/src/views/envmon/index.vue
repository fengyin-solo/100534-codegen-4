<template>
  <section class="page" data-module="envmon">
    <header class="page-head">
      <div>
        <h2>库房环境册</h2>
        <p class="page-desc">按监测点位分栏登记当日温湿度极值，越界时段单列一栏跟进处置，按记录、判定、整改、复核顺次流转。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="formOpen = !formOpen">抄表登记</button>
        <button class="btn" type="button" @click="exportRows">导出处置台账</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <form v-if="formOpen" class="filter-bar" @submit.prevent="submitForm">
      <label class="filter-item">
        <span>监测点位</span>
        <select v-model="form.监测点位">
          <option v-for="point in points" :key="String(point.点位编号)" :value="point.点位编号">
            {{ point.点位名称 }}（{{ point.点位编号 }}）
          </option>
        </select>
      </label>
      <label class="filter-item">
        <span>记录日期</span>
        <input v-model="form.记录日期" type="date" />
      </label>
      <label class="filter-item">
        <span>时段</span>
        <select v-model="form.时段">
          <option v-for="slot in timeSlots" :key="slot" :value="slot">{{ slot }}</option>
        </select>
      </label>
      <label class="filter-item">
        <span>温度读数（℃）</span>
        <input v-model="form.温度读数" placeholder="如 21.5" />
      </label>
      <label class="filter-item">
        <span>湿度读数（%）</span>
        <input v-model="form.湿度读数" placeholder="如 52" />
      </label>
      <label class="filter-item">
        <span>抄表人</span>
        <input v-model="form.抄表人" placeholder="谁抄的表" />
      </label>
      <button class="btn primary" type="submit">提交抄表</button>
    </form>

    <div class="board-head">
      <label class="filter-item">
        <span>分栏日期</span>
        <input v-model="boardDate" type="date" />
      </label>
      <span v-if="issues.length" class="error-text">读数一致性校验未过：{{ issues.join('；') }}</span>
      <span v-else class="check-ok">读数一致性校验通过：台账与抄表记录温度一致</span>
    </div>

    <div class="board-cols">
      <article v-for="col in board" :key="String(col.point.点位编号)" class="point-col">
        <h3>{{ col.point.点位名称 }}（{{ col.point.点位编号 }}）</h3>
        <p class="col-sub">{{ col.point.存放区域 }} · 责任人 {{ col.point.责任人 }}</p>
        <p class="col-sub">允许区间：{{ rangeText(col.point) }}</p>
        <template v-if="col.count">
          <p>温度：最高 {{ col.tempMax }}℃ / 最低 {{ col.tempMin }}℃</p>
          <p>湿度：最高 {{ col.humiMax }}% / 最低 {{ col.humiMin }}%</p>
          <p class="col-sub">当日抄表 {{ col.count }} 次</p>
        </template>
        <p v-else class="col-sub">当日还没有抄表记录</p>
      </article>

      <article class="point-col exceed-col">
        <h3>越界时段</h3>
        <p class="col-sub">越出允许区间的时段单列在此，处置由跟进人负责</p>
        <div v-for="item in exceedances" :key="String(item.id)" class="exceed-item">
          <p>
            <strong>{{ item.监测点位 }}</strong> · {{ item.超标时段 }} · {{ item.超标项目 }}超标
          </p>
          <p>读数 {{ item.温度读数 }}℃ / {{ item.湿度读数 }}%（{{ item.允许区间 }}）</p>
          <p>
            跟进人：<strong>{{ item.跟进人 }}</strong> · 状态：{{ item.status }}
          </p>
        </div>
        <p v-if="!exceedances.length" class="col-sub">没有越出允许区间的时段</p>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in ledger" :key="String(row.id)">
          <td v-for="column in columns" :key="column">
            <input
              v-if="column === '整改措施' && row.status === '已判定'"
              v-model="measureDraft[Number(row.id)]"
              class="measure-input"
              placeholder="写清整改措施"
            />
            <template v-else>{{ row[column] || '—' }}</template>
          </td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!ledger.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无超标处置记录，库房环境一切正常</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ ledger.length }} 条超标处置记录</span>
      <span v-if="infoMessage" class="check-ok">{{ infoMessage }}</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import {
  TIME_SLOTS,
  consistencyIssues,
  listLedger,
  listPoints,
  listReadings,
  pointRangeText,
  runEnvmonAction,
  submitReading,
  summarizeDay,
} from '@/api/envmon-service'
import { downloadEntries, moduleMeta } from '@/api/local-service'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('envmon')
const columns = meta.fields
const actions = meta.actions
const statuses = meta.statuses
const timeSlots = TIME_SLOTS

const points = ref<EntryRow[]>([])
const readings = ref<EntryRow[]>([])
const ledger = ref<EntryRow[]>([])
const measureDraft = reactive<Record<number, string>>({})
const formOpen = ref(false)
const infoMessage = ref('')
const errorMessage = ref('')

function today(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

const boardDate = ref(today())
const form = reactive({
  监测点位: '',
  记录日期: today(),
  时段: timeSlots[0],
  温度读数: '',
  湿度读数: '',
  抄表人: '',
})

const board = computed(() => summarizeDay(points.value, readings.value, boardDate.value))
const exceedances = computed(() => [...ledger.value].sort((a, b) => Number(b.id) - Number(a.id)))
const issues = computed(() => consistencyIssues(readings.value, ledger.value))
const stats = computed(() => [
  { label: '监测点位', value: points.value.length },
  { label: '当日抄表', value: readings.value.filter((row) => row.记录日期 === boardDate.value).length },
  { label: '越界时段', value: ledger.value.length },
  { label: '待跟进处置', value: ledger.value.filter((row) => row.pending).length },
])
const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: ledger.value.filter((row) => String(row.status) === status).length,
  })),
)

function rangeText(point: EntryRow): string {
  return pointRangeText(point)
}

function exportRows() {
  downloadEntries(meta.key)
}

function submitForm() {
  infoMessage.value = ''
  errorMessage.value = ''
  const result = submitReading({ ...form })
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  infoMessage.value = result.message
  form.温度读数 = ''
  form.湿度读数 = ''
  reload()
}

function runAction(action: string, row: EntryRow) {
  infoMessage.value = ''
  errorMessage.value = ''
  const result = runEnvmonAction(Number(row.id), action, measureDraft[Number(row.id)])
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  infoMessage.value = result.message
  reload()
}

function reload() {
  points.value = listPoints()
  readings.value = listReadings()
  ledger.value = listLedger()
  if (!form.监测点位 && points.value.length) {
    form.监测点位 = String(points.value[0].点位编号)
  }
}

onMounted(reload)
</script>
