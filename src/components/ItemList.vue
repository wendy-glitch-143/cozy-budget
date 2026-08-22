<script setup lang="ts">
import { ref } from 'vue'
import { formatMoney, type BudgetItem, type Currency } from '../composables/useBudget'

defineProps<{
  title: string
  items: BudgetItem[]
  emptyMessage: string
  kind: 'income' | 'expense' | 'savings'
  currency: Currency
}>()

defineEmits<{
  remove: [id: string]
}>()

const open = ref(true)
</script>

<template>
  <section class="item-section" :class="kind">
    <button
      type="button"
      class="section-toggle"
      :aria-expanded="open"
      @click="open = !open"
    >
      <h2>{{ title }}</h2>
      <span v-if="items.length" class="count">{{ items.length }}</span>
      <span class="chevron" aria-hidden="true">{{ open ? '▾' : '▸' }}</span>
    </button>

    <div v-show="open">
      <TransitionGroup name="list" tag="ul" class="item-list" v-if="items.length">
        <li v-for="item in items" :key="item.id" class="item-row">
          <div class="item-copy">
            <span class="item-name">{{ item.name }}</span>
            <span v-if="item.categoryName || item.goalName" class="item-category">
              <template v-if="item.categoryName">{{ item.categoryName }}</template>
              <template v-if="item.categoryName && item.goalName"> · </template>
              <template v-if="item.goalName">Goal: {{ item.goalName }}</template>
            </span>
          </div>
          <span class="item-amount">{{ formatMoney(item.amount, currency) }}</span>
          <button
            type="button"
            class="remove-btn"
            :aria-label="`Remove ${item.name}`"
            @click="$emit('remove', item.id)"
          >
            ×
          </button>
        </li>
      </TransitionGroup>

      <p v-else class="empty">{{ emptyMessage }}</p>
    </div>
  </section>
</template>

<style scoped>
.item-section {
  margin-bottom: 1.75rem;
}

.section-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  margin: 0 0 0.85rem;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  text-align: left;
}

h2 {
  margin: 0;
  flex: 1;
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--ink);
}

.count {
  font-family: var(--font-body);
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--ink-soft);
}

.chevron {
  font-size: 0.85rem;
  color: var(--ink-soft);
}

.income h2 {
  color: var(--mint-deep);
}

.expense h2 {
  color: var(--blush-deep);
}

.savings h2 {
  color: color-mix(in srgb, var(--mint-deep) 55%, var(--blush-deep));
}

.item-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.item-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 0.75rem;
  padding: 0.7rem 0.85rem;
  border-radius: 14px;
  background: color-mix(in srgb, var(--paper) 72%, white);
  border: 1px solid color-mix(in srgb, var(--mint) 28%, transparent);
}

.income .item-row {
  border-color: color-mix(in srgb, var(--mint) 40%, transparent);
}

.expense .item-row {
  border-color: color-mix(in srgb, var(--blush) 45%, transparent);
}

.savings .item-row {
  border-color: color-mix(in srgb, var(--mint) 35%, var(--blush));
}

.item-copy {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.item-name {
  font-family: var(--font-body);
  font-size: 0.98rem;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-category {
  font-family: var(--font-body);
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--ink-soft);
}

.item-amount {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 0.98rem;
  color: var(--ink);
}

.remove-btn {
  width: 1.85rem;
  height: 1.85rem;
  border: none;
  border-radius: 999px;
  background: color-mix(in srgb, var(--blush) 35%, white);
  color: var(--blush-deep);
  font-size: 1.15rem;
  line-height: 1;
  cursor: pointer;
  transition: transform 0.15s ease, background 0.15s ease;
}

.remove-btn:hover {
  transform: scale(1.06);
  background: color-mix(in srgb, var(--blush) 55%, white);
}

.empty {
  margin: 0;
  padding: 0.85rem 0.2rem;
  font-family: var(--font-body);
  font-size: 0.95rem;
  color: var(--ink-soft);
}

.list-enter-active,
.list-leave-active {
  transition: all 0.25s ease;
}

.list-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.list-leave-to {
  opacity: 0;
  transform: translateX(12px);
}

.list-move {
  transition: transform 0.25s ease;
}
</style>
