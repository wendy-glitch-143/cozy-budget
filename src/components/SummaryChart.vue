<script setup lang="ts">
import { computed } from 'vue'
import { formatMoney, type Currency } from '../composables/useBudget'

const props = defineProps<{
  income: number
  expenses: number
  savings: number
  currency: Currency
}>()

const slices = computed(() => {
  const parts = [
    { key: 'income', label: 'Income', amount: props.income },
    { key: 'expense', label: 'Expenses', amount: props.expenses },
    { key: 'savings', label: 'Savings', amount: props.savings },
  ].filter((part) => part.amount > 0)

  const total = parts.reduce((sum, part) => sum + part.amount, 0)
  let angle = 0

  return parts.map((part) => {
    const start = angle
    const sweep = total > 0 ? (part.amount / total) * 360 : 0
    angle += sweep
    return { ...part, start, end: angle, percent: total ? part.amount / total : 0 }
  })
})

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
}

function slicePath(start: number, end: number) {
  if (end - start >= 359.99) {
    return 'M 50 2 A 48 48 0 1 1 49.99 2 Z'
  }
  const [x1, y1] = polar(50, 50, 48, start)
  const [x2, y2] = polar(50, 50, 48, end)
  const large = end - start > 180 ? 1 : 0
  return `M 50 50 L ${x1} ${y1} A 48 48 0 ${large} 1 ${x2} ${y2} Z`
}
</script>

<template>
  <section class="chart" aria-label="Income, expenses, and savings chart">
    <p class="chart-title">This period</p>
    <p v-if="!slices.length" class="empty">Add a record to see the chart.</p>
    <div
      v-else
      class="pie-wrap"
      role="img"
      :aria-label="`Income ${formatMoney(income, currency)}, expenses ${formatMoney(expenses, currency)}, savings ${formatMoney(savings, currency)}`"
    >
      <svg class="pie" viewBox="0 0 100 100" aria-hidden="true">
        <path
          v-for="slice in slices"
          :key="slice.key"
          :d="slicePath(slice.start, slice.end)"
          :class="slice.key"
        />
      </svg>
      <ul class="legend">
        <li v-for="slice in slices" :key="slice.key">
          <i :class="slice.key" />
          <span class="name">{{ slice.label }}</span>
          <span class="amount">{{ formatMoney(slice.amount, currency) }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.chart {
  margin: 0 0 1.25rem;
  padding: 1rem 1rem 1.1rem;
  border-radius: 16px;
  background: color-mix(in srgb, var(--paper) 55%, white);
  border: 1px solid color-mix(in srgb, var(--mint) 28%, transparent);
}

.chart-title {
  margin: 0 0 0.85rem;
  font-family: var(--font-body);
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ink-soft);
}

.empty {
  margin: 0;
  font-family: var(--font-body);
  font-size: 0.92rem;
  text-align: center;
  color: var(--ink-soft);
}

.pie-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1.25rem;
}

.pie {
  width: 8.5rem;
  height: 8.5rem;
  flex-shrink: 0;
}

.pie path.income,
.legend i.income {
  fill: var(--mint-deep);
  background: var(--mint-deep);
}

.pie path.expense,
.legend i.expense {
  fill: var(--blush-deep);
  background: var(--blush-deep);
}

.pie path.savings,
.legend i.savings {
  fill: color-mix(in srgb, var(--mint-deep) 55%, var(--blush-deep));
  background: color-mix(in srgb, var(--mint-deep) 55%, var(--blush-deep));
}

.legend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  min-width: 0;
}

.legend li {
  display: grid;
  grid-template-columns: 0.7rem 1fr auto;
  align-items: center;
  gap: 0.5rem;
}

.legend i {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 999px;
}

.name {
  font-family: var(--font-body);
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--ink-soft);
}

.amount {
  font-family: var(--font-display);
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--ink);
}

</style>
