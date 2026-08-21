<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  formatMoney,
  formatMonthLabel,
  type BudgetItem,
  type Currency,
  type Period,
} from '../composables/useBudget'

const props = defineProps<{
  currency: Currency
  defaultYear: number
  availableYears: number[]
}>()

export interface YearlyRow {
  monthKey: string
  income: number
  expenses: number
  savings: number
  balance: number
}

const PERIOD_LABELS: Record<Period, string> = {
  monthly: 'Monthly',
  h1: '1–15',
  h2: '16–end',
}

const year = ref(props.defaultYear)
const rows = ref<YearlyRow[]>([])
const totals = ref({ income: 0, expenses: 0, savings: 0, balance: 0 })
const loading = ref(false)
const error = ref('')
const generated = ref(false)

const detailMonth = ref<string | null>(null)
const detailItems = ref<BudgetItem[]>([])
const detailLoading = ref(false)
const detailError = ref('')

const yearOptions = computed(() => {
  const set = new Set(props.availableYears)
  set.add(props.defaultYear)
  set.add(year.value)
  return [...set].sort((a, b) => b - a)
})

const detailIncome = computed(() =>
  detailItems.value.filter((item) => item.kind === 'income'),
)

const detailExpenses = computed(() =>
  detailItems.value.filter((item) => item.kind === 'expense'),
)

const detailSavings = computed(() =>
  detailItems.value.filter((item) => item.kind === 'savings'),
)

async function generate() {
  loading.value = true
  error.value = ''
  detailMonth.value = null
  detailItems.value = []
  try {
    const res = await fetch(`/api/report/yearly?year=${year.value}`)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || 'Could not generate report.')
    }
    const data = (await res.json()) as {
      rows: YearlyRow[]
      totals: {
        income: number
        expenses: number
        savings: number
        balance: number
      }
    }
    rows.value = data.rows
    totals.value = data.totals
    generated.value = true
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not generate report.'
    rows.value = []
    generated.value = false
  } finally {
    loading.value = false
  }
}

async function toggleDetails(monthKey: string) {
  if (detailMonth.value === monthKey) {
    detailMonth.value = null
    detailItems.value = []
    detailError.value = ''
    return
  }

  detailMonth.value = monthKey
  detailLoading.value = true
  detailError.value = ''
  detailItems.value = []

  try {
    const res = await fetch(`/api/items?month=${encodeURIComponent(monthKey)}`)
    if (!res.ok) throw new Error('Could not load month details.')
    detailItems.value = (await res.json()) as BudgetItem[]
  } catch (err) {
    detailError.value =
      err instanceof Error ? err.message : 'Could not load month details.'
  } finally {
    detailLoading.value = false
  }
}
</script>

<template>
  <section class="report" aria-label="Yearly summary report">
    <div class="report-header">
      <div>
        <h2>Yearly summary</h2>
        <p class="hint">Generate a month-by-month table, then open any month for details.</p>
      </div>
    </div>

    <div class="controls">
      <label class="field">
        <span>Year</span>
        <select v-model.number="year">
          <option v-for="option in yearOptions" :key="option" :value="option">
            {{ option }}
          </option>
        </select>
      </label>
      <button type="button" class="generate-btn" :disabled="loading" @click="generate">
        {{ loading ? 'Generating…' : 'Generate summary report' }}
      </button>
    </div>

    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <div v-if="generated" class="table-wrap">
      <table v-if="rows.length">
        <thead>
          <tr>
            <th>Month</th>
            <th>Income</th>
            <th>Expenses</th>
            <th>Savings</th>
            <th>Remaining</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="row in rows" :key="row.monthKey">
            <tr>
              <td>{{ formatMonthLabel(row.monthKey) }}</td>
              <td class="income">{{ formatMoney(row.income, currency) }}</td>
              <td class="expense">{{ formatMoney(row.expenses, currency) }}</td>
              <td class="savings">{{ formatMoney(row.savings, currency) }}</td>
              <td :class="{ negative: row.balance < 0 }">
                {{ formatMoney(row.balance, currency) }}
              </td>
              <td>
                <button
                  type="button"
                  class="detail-btn"
                  @click="toggleDetails(row.monthKey)"
                >
                  {{ detailMonth === row.monthKey ? 'Hide' : 'View' }}
                </button>
              </td>
            </tr>
            <tr v-if="detailMonth === row.monthKey" class="detail-row">
              <td colspan="6">
                <div class="detail-panel">
                  <p v-if="detailLoading" class="detail-status">Loading details…</p>
                  <p v-else-if="detailError" class="error">{{ detailError }}</p>
                  <div v-else-if="!detailItems.length" class="detail-status">
                    No items recorded for this month.
                  </div>
                  <div v-else class="detail-grid">
                    <div class="detail-block income">
                      <h3>Income</h3>
                      <ul v-if="detailIncome.length">
                        <li v-for="item in detailIncome" :key="item.id">
                          <div class="item-main">
                            <span class="item-name">{{ item.name }}</span>
                            <span class="item-meta">
                              {{ PERIOD_LABELS[item.period] }}
                              <template v-if="item.categoryName">
                                · {{ item.categoryName }}
                              </template>
                            </span>
                          </div>
                          <span class="item-amount">
                            {{ formatMoney(item.amount, currency) }}
                          </span>
                        </li>
                      </ul>
                      <p v-else class="detail-status">No income items.</p>
                    </div>
                    <div class="detail-block expense">
                      <h3>Expenses</h3>
                      <ul v-if="detailExpenses.length">
                        <li v-for="item in detailExpenses" :key="item.id">
                          <div class="item-main">
                            <span class="item-name">{{ item.name }}</span>
                            <span class="item-meta">
                              {{ PERIOD_LABELS[item.period] }}
                              <template v-if="item.categoryName">
                                · {{ item.categoryName }}
                              </template>
                            </span>
                          </div>
                          <span class="item-amount">
                            {{ formatMoney(item.amount, currency) }}
                          </span>
                        </li>
                      </ul>
                      <p v-else class="detail-status">No expense items.</p>
                    </div>
                    <div class="detail-block savings">
                      <h3>Savings</h3>
                      <ul v-if="detailSavings.length">
                        <li v-for="item in detailSavings" :key="item.id">
                          <div class="item-main">
                            <span class="item-name">{{ item.name }}</span>
                            <span class="item-meta">
                              {{ PERIOD_LABELS[item.period] }}
                              <template v-if="item.categoryName">
                                · {{ item.categoryName }}
                              </template>
                              <template v-if="item.goalName">
                                · Goal: {{ item.goalName }}
                              </template>
                            </span>
                          </div>
                          <span class="item-amount">
                            {{ formatMoney(item.amount, currency) }}
                          </span>
                        </li>
                      </ul>
                      <p v-else class="detail-status">No savings items.</p>
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
        <tfoot>
          <tr>
            <th>Year total</th>
            <th class="income">{{ formatMoney(totals.income, currency) }}</th>
            <th class="expense">{{ formatMoney(totals.expenses, currency) }}</th>
            <th class="savings">{{ formatMoney(totals.savings, currency) }}</th>
            <th :class="{ negative: totals.balance < 0 }">
              {{ formatMoney(totals.balance, currency) }}
            </th>
            <th></th>
          </tr>
        </tfoot>
      </table>
      <p v-else class="empty">No months found for {{ year }}.</p>
    </div>
  </section>
</template>

<style scoped>
.report {
  margin-top: 2.25rem;
  padding-top: 1.5rem;
  border-top: 1px solid color-mix(in srgb, var(--mint) 30%, transparent);
}

.report-header h2 {
  margin: 0 0 0.25rem;
  font-family: var(--font-display);
  font-size: 1.35rem;
  color: var(--ink);
}

.hint {
  margin: 0;
  font-family: var(--font-body);
  font-size: 0.92rem;
  color: var(--ink-soft);
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: end;
  margin: 1rem 0;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-family: var(--font-body);
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--ink-soft);
}

.field select {
  min-width: 7rem;
  padding: 0.65rem 0.8rem;
  border-radius: 12px;
  border: 1.5px solid color-mix(in srgb, var(--mint) 40%, transparent);
  background: color-mix(in srgb, var(--paper) 80%, white);
  font-weight: 600;
  color: var(--ink);
}

.generate-btn {
  height: 2.7rem;
  padding: 0 1.1rem;
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, var(--mint), var(--blush));
  color: white;
  font-family: var(--font-body);
  font-size: 0.92rem;
  font-weight: 700;
  cursor: pointer;
}

.generate-btn:disabled {
  opacity: 0.7;
  cursor: wait;
}

.error {
  margin: 0 0 0.75rem;
  color: var(--blush-deep);
  font-family: var(--font-body);
  font-size: 0.92rem;
}

.table-wrap {
  overflow-x: auto;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--mint) 30%, transparent);
  background: color-mix(in srgb, var(--paper) 75%, white);
}

table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-body);
  font-size: 0.92rem;
}

th,
td {
  padding: 0.75rem 0.85rem;
  text-align: left;
  border-bottom: 1px solid color-mix(in srgb, var(--mint) 22%, transparent);
  vertical-align: top;
}

th {
  font-size: 0.78rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ink-soft);
  background: color-mix(in srgb, var(--mint) 12%, white);
}

td.income,
th.income {
  color: var(--mint-deep);
  font-weight: 700;
}

td.expense,
th.expense {
  color: var(--blush-deep);
  font-weight: 700;
}

td.negative,
th.negative {
  color: var(--blush-deep);
}

.detail-btn {
  border: none;
  border-radius: 999px;
  padding: 0.35rem 0.8rem;
  background: color-mix(in srgb, var(--mint) 35%, white);
  color: var(--mint-deep);
  font-family: var(--font-body);
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
}

.detail-row td {
  background: color-mix(in srgb, var(--mint) 8%, white);
  border-bottom: 1px solid color-mix(in srgb, var(--mint) 22%, transparent);
}

.detail-panel {
  padding: 0.25rem 0.1rem 0.35rem;
}

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 1rem;
}

.detail-block h3 {
  margin: 0 0 0.5rem;
  font-family: var(--font-display);
  font-size: 1rem;
}

.detail-block.income h3 {
  color: var(--mint-deep);
}

.detail-block.expense h3 {
  color: var(--blush-deep);
}

.detail-block.savings h3 {
  color: color-mix(in srgb, var(--mint-deep) 55%, var(--blush-deep));
}

td.savings,
th.savings {
  color: color-mix(in srgb, var(--mint-deep) 55%, var(--blush-deep));
  font-weight: 700;
}

.detail-block ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.detail-block li {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.55rem 0.65rem;
  border-radius: 10px;
  background: color-mix(in srgb, var(--paper) 80%, white);
  border: 1px solid color-mix(in srgb, var(--mint) 25%, transparent);
}

.item-main {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.item-name {
  font-weight: 600;
  color: var(--ink);
}

.item-meta {
  font-size: 0.78rem;
  color: var(--ink-soft);
}

.item-amount {
  font-family: var(--font-display);
  font-weight: 700;
  white-space: nowrap;
}

.detail-status {
  margin: 0;
  color: var(--ink-soft);
  font-size: 0.9rem;
}

tfoot th {
  background: color-mix(in srgb, var(--mint) 18%, white);
  font-family: var(--font-display);
  font-size: 0.95rem;
  text-transform: none;
  letter-spacing: 0;
  color: var(--ink);
  border-bottom: none;
}

.empty {
  margin: 0;
  padding: 1rem;
  color: var(--ink-soft);
  font-family: var(--font-body);
}

@media (max-width: 640px) {
  .detail-grid {
    grid-template-columns: 1fr;
  }
}
</style>
