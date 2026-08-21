<script setup lang="ts">
import { formatMoney, type Currency } from '../composables/useBudget'

defineProps<{
  income: number
  expenses: number
  savings: number
  balance: number
  currency: Currency
}>()
</script>

<template>
  <section class="summary" aria-label="Budget totals">
    <div class="summary-item income">
      <span class="label">Income</span>
      <span class="value">{{ formatMoney(income, currency) }}</span>
    </div>
    <div class="summary-item expense">
      <span class="label">Expenses</span>
      <span class="value">{{ formatMoney(expenses, currency) }}</span>
    </div>
    <div class="summary-item savings">
      <span class="label">Savings</span>
      <span class="value">{{ formatMoney(savings, currency) }}</span>
    </div>
    <div class="summary-item balance" :class="{ negative: balance < 0 }">
      <span class="label">Remaining</span>
      <Transition name="tick" mode="out-in">
        <span :key="`${balance}-${currency}`" class="value">{{ formatMoney(balance, currency) }}</span>
      </Transition>
    </div>
  </section>
</template>

<style scoped>
.summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.75rem 1rem;
  margin: 1.75rem 0 2rem;
  padding: 1rem 0;
  border-top: 1px solid color-mix(in srgb, var(--mint) 35%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--mint) 35%, transparent);
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 0;
}

.label {
  font-family: var(--font-body);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ink-soft);
}

.value {
  font-family: var(--font-display);
  font-size: clamp(1.05rem, 2.6vw, 1.4rem);
  font-weight: 600;
  color: var(--ink);
  line-height: 1.2;
  word-break: break-word;
}

.income .value {
  color: var(--mint-deep);
}

.expense .value {
  color: var(--blush-deep);
}

.savings .value {
  color: color-mix(in srgb, var(--mint-deep) 55%, var(--blush-deep));
}

.balance .value {
  color: var(--ink);
}

.balance.negative .value {
  color: var(--blush-deep);
}

.tick-enter-active,
.tick-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.tick-enter-from {
  opacity: 0;
  transform: translateY(4px);
}

.tick-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (max-width: 700px) {
  .summary {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
