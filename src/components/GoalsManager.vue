<script setup lang="ts">
import { ref } from 'vue'
import { formatMoney, type Currency, type SavingsGoal } from '../composables/useBudget'

defineProps<{
  goals: SavingsGoal[]
  currency: Currency
}>()

const emit = defineEmits<{
  add: [name: string, targetAmount: number]
  remove: [id: string]
}>()

const name = ref('')
const target = ref('')

function onSubmit() {
  emit('add', name.value, Number(target.value))
  name.value = ''
  target.value = ''
}
</script>

<template>
  <section class="goals-panel" aria-label="Savings goals">
    <h2>Savings Goals</h2>
    <p class="hint">Set targets and track progress from savings contributions.</p>

    <form class="goal-form" @submit.prevent="onSubmit">
      <label class="field">
        <span>Goal name</span>
        <input
          v-model="name"
          type="text"
          maxlength="80"
          placeholder="Emergency fund…"
          required
          autocomplete="off"
        />
      </label>
      <label class="field target">
        <span>Target</span>
        <input
          v-model="target"
          type="number"
          min="0.01"
          step="0.01"
          placeholder="0.00"
          required
        />
      </label>
      <button type="submit" class="add-btn">Add goal</button>
    </form>

    <ul v-if="goals.length" class="goal-list">
      <li v-for="goal in goals" :key="goal.id">
        <div class="goal-top">
          <div>
            <strong>{{ goal.name }}</strong>
            <p>
              {{ formatMoney(goal.savedAmount, currency) }}
              of
              {{ formatMoney(goal.targetAmount, currency) }}
              ({{ goal.progress }}%)
            </p>
          </div>
          <button
            type="button"
            class="remove-btn"
            :aria-label="`Remove ${goal.name}`"
            @click="emit('remove', goal.id)"
          >
            ×
          </button>
        </div>
        <div class="progress" aria-hidden="true">
          <span :style="{ width: `${Math.min(100, goal.progress)}%` }" />
        </div>
      </li>
    </ul>
    <p v-else class="empty">No saving goals yet.</p>
  </section>
</template>

<style scoped>
.goals-panel {
  margin: 0;
  padding: 0.85rem 0 0;
  border-top: 1px solid color-mix(in srgb, var(--mint) 30%, transparent);
}

h2 {
  margin: 0 0 0.25rem;
  font-family: var(--font-display);
  font-size: 1.25rem;
  color: var(--ink);
}

.hint {
  margin: 0 0 0.9rem;
  font-family: var(--font-body);
  font-size: 0.92rem;
  color: var(--ink-soft);
}

.goal-form {
  display: grid;
  grid-template-columns: 1fr 7.5rem auto;
  gap: 0.65rem;
  align-items: end;
  margin-bottom: 1rem;
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

.field input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.7rem 0.85rem;
  border-radius: 12px;
  border: 1.5px solid color-mix(in srgb, var(--mint) 40%, transparent);
  background: color-mix(in srgb, var(--paper) 80%, white);
  font-family: var(--font-body);
  font-size: 0.98rem;
  color: var(--ink);
}

.add-btn {
  height: 2.7rem;
  padding: 0 1rem;
  border: none;
  border-radius: 12px;
  background: color-mix(in srgb, var(--mint) 55%, white);
  color: var(--mint-deep);
  font-family: var(--font-body);
  font-weight: 700;
  cursor: pointer;
}

.goal-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

li {
  padding: 0.75rem 0.8rem;
  border-radius: 14px;
  background: color-mix(in srgb, var(--paper) 72%, white);
  border: 1px solid color-mix(in srgb, var(--mint) 28%, transparent);
}

.goal-top {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.55rem;
}

.goal-top strong {
  font-family: var(--font-body);
  color: var(--ink);
}

.goal-top p {
  margin: 0.2rem 0 0;
  font-size: 0.85rem;
  color: var(--ink-soft);
}

.remove-btn {
  width: 1.6rem;
  height: 1.6rem;
  border: none;
  border-radius: 999px;
  background: color-mix(in srgb, var(--blush) 35%, white);
  color: var(--blush-deep);
  cursor: pointer;
}

.progress {
  height: 0.55rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--mint) 20%, white);
  overflow: hidden;
}

.progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--mint), var(--blush));
}

.empty {
  margin: 0;
  font-family: var(--font-body);
  font-size: 0.9rem;
  color: var(--ink-soft);
}

@media (max-width: 560px) {
  .goal-form {
    grid-template-columns: 1fr;
  }
}
</style>
