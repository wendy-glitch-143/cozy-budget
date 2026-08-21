<script setup lang="ts">
import { formatMonthLabel } from '../composables/useBudget'

defineProps<{
  months: string[]
  activeMonth: string
}>()

defineEmits<{
  'update:month': [string]
}>()
</script>

<template>
  <div class="month-switcher">
    <label class="control-label" for="active-month">Month</label>
    <select
      id="active-month"
      :value="activeMonth"
      @change="$emit('update:month', ($event.target as HTMLSelectElement).value)"
    >
      <option v-for="month in months" :key="month" :value="month">
        {{ formatMonthLabel(month) }}
      </option>
    </select>
  </div>
</template>

<style scoped>
.month-switcher {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin: 1.35rem 0 1.1rem;
}

.control-label {
  font-family: var(--font-body);
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ink-soft);
}

select {
  align-self: flex-start;
  min-width: 11rem;
  box-sizing: border-box;
  padding: 0.65rem 0.8rem;
  border-radius: 12px;
  border: 1.5px solid color-mix(in srgb, var(--mint) 40%, transparent);
  background: color-mix(in srgb, var(--paper) 80%, white);
  font-family: var(--font-body);
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--ink);
  outline: none;
}

@media (max-width: 560px) {
  select {
    width: 100%;
  }
}
</style>
