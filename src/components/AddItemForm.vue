<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Category, Kind, SavingsGoal } from '../composables/useBudget'

const props = defineProps<{
  categories: Category[]
  goals: SavingsGoal[]
}>()

const emit = defineEmits<{
  add: [
    name: string,
    amount: number,
    kind: Kind,
    categoryId: string | null,
    goalId: string | null,
  ]
}>()

const name = ref('')
const amount = ref('')
const kind = ref<Kind>('expense')
const categoryId = ref('')
const goalId = ref('')

const matchingCategories = computed(() =>
  props.categories.filter((category) => category.kind === kind.value),
)

watch(kind, () => {
  categoryId.value = ''
  goalId.value = ''
})

watch(matchingCategories, (list) => {
  if (categoryId.value && !list.some((category) => category.id === categoryId.value)) {
    categoryId.value = ''
  }
})

function onSubmit() {
  const parsed = Number(amount.value)
  emit(
    'add',
    name.value,
    parsed,
    kind.value,
    categoryId.value || null,
    kind.value === 'savings' ? goalId.value || null : null,
  )
  name.value = ''
  amount.value = ''
  categoryId.value = ''
  goalId.value = ''
}
</script>

<template>
  <form class="add-form" @submit.prevent="onSubmit">
    <div class="kind-toggle" role="group" aria-label="Item type">
      <button
        type="button"
        :class="{ active: kind === 'income' }"
        @click="kind = 'income'"
      >
        Income
      </button>
      <button
        type="button"
        :class="{ active: kind === 'expense' }"
        @click="kind = 'expense'"
      >
        Expense
      </button>
      <button
        type="button"
        :class="{ active: kind === 'savings' }"
        @click="kind = 'savings'"
      >
        Savings
      </button>
    </div>

    <div class="fields" :class="{ withGoal: kind === 'savings' }">
      <label class="field">
        <span>Name</span>
        <input
          v-model="name"
          type="text"
          name="item-name"
          placeholder="Coffee, paycheck…"
          maxlength="80"
          required
          autocomplete="off"
        />
      </label>

      <label class="field category">
        <span>Category</span>
        <select v-model="categoryId">
          <option value="">No category</option>
          <option
            v-for="category in matchingCategories"
            :key="category.id"
            :value="category.id"
          >
            {{ category.name }}
          </option>
        </select>
      </label>

      <label v-if="kind === 'savings'" class="field goal">
        <span>Goal</span>
        <select v-model="goalId">
          <option value="">No goal</option>
          <option v-for="goal in goals" :key="goal.id" :value="goal.id">
            {{ goal.name }}
          </option>
        </select>
      </label>

      <label class="field amount">
        <span>Amount</span>
        <input
          v-model="amount"
          type="number"
          name="item-amount"
          placeholder="0.00"
          min="0.01"
          step="0.01"
          required
        />
      </label>

      <button type="submit" class="add-btn">Add</button>
    </div>
  </form>
</template>

<style scoped>
.add-form {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  margin-bottom: 2rem;
}

.kind-toggle {
  display: inline-flex;
  align-self: flex-start;
  flex-wrap: wrap;
  padding: 0.2rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--mint) 18%, white);
  gap: 0.15rem;
}

.kind-toggle button {
  border: none;
  background: transparent;
  padding: 0.45rem 0.85rem;
  border-radius: 999px;
  font-family: var(--font-body);
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--ink-soft);
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}

.kind-toggle button.active {
  background: white;
  color: var(--ink);
  box-shadow: 0 1px 4px color-mix(in srgb, var(--ink) 8%, transparent);
}

.fields {
  display: grid;
  grid-template-columns: 1.2fr 1fr 7rem auto;
  gap: 0.65rem;
  align-items: end;
}

.fields.withGoal {
  grid-template-columns: 1fr 0.9fr 0.9fr 6.5rem auto;
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

.field input,
.field select {
  width: 100%;
  box-sizing: border-box;
  padding: 0.7rem 0.85rem;
  border-radius: 12px;
  border: 1.5px solid color-mix(in srgb, var(--mint) 40%, transparent);
  background: color-mix(in srgb, var(--paper) 80%, white);
  font-family: var(--font-body);
  font-size: 0.98rem;
  font-weight: 500;
  color: var(--ink);
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.field input:focus,
.field select:focus {
  border-color: var(--mint-deep);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--mint) 35%, transparent);
}

.add-btn {
  height: 2.7rem;
  padding: 0 1.2rem;
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, var(--mint), var(--blush));
  color: white;
  font-family: var(--font-body);
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s ease, filter 0.15s ease;
}

.add-btn:hover {
  transform: translateY(-1px);
  filter: brightness(1.03);
}

.add-btn:active {
  transform: translateY(0);
}

@media (max-width: 800px) {
  .fields,
  .fields.withGoal {
    grid-template-columns: 1fr 1fr;
  }

  .add-btn {
    grid-column: 1 / -1;
  }
}
</style>
