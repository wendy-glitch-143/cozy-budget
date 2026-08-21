<script setup lang="ts">
import { ref } from 'vue'
import type { Category, Kind } from '../composables/useBudget'

defineProps<{
  incomeCategories: Category[]
  expenseCategories: Category[]
  savingsCategories: Category[]
}>()

const emit = defineEmits<{
  add: [name: string, kind: Kind]
  remove: [id: string]
}>()

const name = ref('')
const kind = ref<Kind>('expense')

function onSubmit() {
  emit('add', name.value, kind.value)
  name.value = ''
}
</script>

<template>
  <section class="category-panel" aria-label="Categories">
    <h2>Categories</h2>
    <p class="hint">Each category is tagged as income, expense, or savings.</p>

    <form class="category-form" @submit.prevent="onSubmit">
      <div class="kind-toggle" role="group" aria-label="Category type">
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

      <div class="fields">
        <label class="field">
          <span>Category name</span>
          <input
            v-model="name"
            type="text"
            maxlength="60"
            placeholder="Salary, Food, Emergency…"
            required
            autocomplete="off"
          />
        </label>
        <button type="submit" class="add-btn">Add category</button>
      </div>
    </form>

    <div class="lists">
      <div class="list-block income">
        <h3>Income</h3>
        <ul v-if="incomeCategories.length">
          <li v-for="category in incomeCategories" :key="category.id">
            <span>{{ category.name }}</span>
            <button
              type="button"
              class="remove-btn"
              :aria-label="`Remove ${category.name}`"
              @click="emit('remove', category.id)"
            >
              ×
            </button>
          </li>
        </ul>
        <p v-else class="empty">No income categories yet.</p>
      </div>

      <div class="list-block expense">
        <h3>Expense</h3>
        <ul v-if="expenseCategories.length">
          <li v-for="category in expenseCategories" :key="category.id">
            <span>{{ category.name }}</span>
            <button
              type="button"
              class="remove-btn"
              :aria-label="`Remove ${category.name}`"
              @click="emit('remove', category.id)"
            >
              ×
            </button>
          </li>
        </ul>
        <p v-else class="empty">No expense categories yet.</p>
      </div>

      <div class="list-block savings">
        <h3>Savings</h3>
        <ul v-if="savingsCategories.length">
          <li v-for="category in savingsCategories" :key="category.id">
            <span>{{ category.name }}</span>
            <button
              type="button"
              class="remove-btn"
              :aria-label="`Remove ${category.name}`"
              @click="emit('remove', category.id)"
            >
              ×
            </button>
          </li>
        </ul>
        <p v-else class="empty">No savings categories yet.</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.category-panel {
  margin: 0;
  padding: 0.35rem 0 0;
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

.category-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.kind-toggle {
  display: inline-flex;
  flex-wrap: wrap;
  align-self: flex-start;
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
}

.kind-toggle button.active {
  background: white;
  color: var(--ink);
  box-shadow: 0 1px 4px color-mix(in srgb, var(--ink) 8%, transparent);
}

.fields {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.65rem;
  align-items: end;
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
  outline: none;
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

.lists {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 1rem;
}

.list-block h3 {
  margin: 0 0 0.5rem;
  font-family: var(--font-display);
  font-size: 1rem;
}

.list-block.income h3 {
  color: var(--mint-deep);
}

.list-block.expense h3 {
  color: var(--blush-deep);
}

.list-block.savings h3 {
  color: color-mix(in srgb, var(--mint-deep) 55%, var(--blush-deep));
}

ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.55rem 0.7rem;
  border-radius: 12px;
  background: color-mix(in srgb, var(--paper) 72%, white);
  border: 1px solid color-mix(in srgb, var(--mint) 28%, transparent);
  font-family: var(--font-body);
  font-size: 0.92rem;
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

.empty {
  margin: 0;
  font-family: var(--font-body);
  font-size: 0.9rem;
  color: var(--ink-soft);
}

@media (max-width: 720px) {
  .fields,
  .lists {
    grid-template-columns: 1fr;
  }
}
</style>
