<template>
  <section class="page" data-module="find">
    <header class="page-head">
      <div>
        <h2>出土物登记管理</h2>
        <p class="page-desc">维护出土物，围绕器物编号、出土探方、出土层位、器物类别做登记、筛选与状态流转。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记出土物</button>
        <button class="btn" type="button" @click="exportRows">导出出土物登记清单</button>
      </div>
    </header>

    <section class="env-todo">
      <div class="env-todo-head">
        <span class="env-todo-title">器物登记待办 · 环境复核项（来自库房环境册）</span>
        <button class="btn" type="button" @click="loadTodos">刷新待办</button>
      </div>
      <p v-if="!todos.length" class="env-todo-empty">暂无环境复核待办，判定完成的超标处置会在这里落成一条复核项。</p>
      <ul v-else class="env-todo-list">
        <li v-for="todo in todos" :key="todo.id" class="env-todo-item" :class="{ 'is-done': todo.done }">
          <div class="env-todo-main">
            <span>{{ todo.title }}</span>
            <span class="env-todo-meta">判定批复：{{ todo.judgeNote || '—' }}</span>
            <span class="env-todo-meta">跟进人：{{ todo.owner }}</span>
          </div>
          <div class="env-todo-side">
            <span v-if="todo.done" class="ok-tag">已复核勾销</span>
            <span v-else class="warn-tag">待复核</span>
            <RouterLink class="link" :to="{ path: '/environment', query: { focus: String(todo.disposalId), date: todo.date } }">
              去处理
            </RouterLink>
          </div>
        </li>
      </ul>
    </section>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
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
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无出土物登记数据，可先登记出土物</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条出土物登记记录</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  downloadEntries,
  listEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import { listTodos } from '@/api/environment-service'
import type { EnvTodo } from '@/data/environment/types'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('find')
const columns = ["器物编号", "出土探方", "出土层位", "器物类别", "质地", "完残程度", "最大尺寸", "登记状态"]
const actions = ["提交登记", "完成编目", "提交复检"]
const statuses = ["待登记", "已登记", "已编目", "待复检"]
const stats = [{"label": "待登记器物", "value": 0}, {"label": "已编目器物", "value": 0}, {"label": "本月出土件数", "value": 0}]

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)
const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '出土物登记入口尚未接入审批流'
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '出土物登记列表读取失败'
  }
}

const todos = ref<EnvTodo[]>([])

function loadTodos() {
  // 待办由环境册判定环节写入：未复核的排前面，已复核的保留为痕迹。
  todos.value = listTodos(true)
}

onMounted(() => {
  reload()
  loadTodos()
})
</script>
