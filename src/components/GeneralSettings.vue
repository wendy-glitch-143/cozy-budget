<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import CategoryManager from './CategoryManager.vue'
import GoalsManager from './GoalsManager.vue'
import {
  THEME_OPTIONS,
  type Category,
  type Currency,
  type Kind,
  type SavingsGoal,
  type Theme,
} from '../composables/useBudget'

defineProps<{
  currency: Currency
  theme: Theme
  incomeCategories: Category[]
  expenseCategories: Category[]
  savingsCategories: Category[]
  goals: SavingsGoal[]
}>()

const emit = defineEmits<{
  'update:currency': [Currency]
  'update:theme': [Theme]
  'add-month': [string]
  'add-category': [name: string, kind: Kind]
  'remove-category': [id: string]
  'add-goal': [name: string, targetAmount: number]
  'remove-goal': [id: string]
}>()

const open = ref(false)
const newMonth = ref('')

function openSettings() {
  open.value = true
}

function closeSettings() {
  open.value = false
}

function onAddMonth() {
  if (!newMonth.value) return
  emit('add-month', newMonth.value)
  newMonth.value = ''
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) closeSettings()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

defineExpose({ openSettings })
</script>

<template>
  <div class="settings-root">
    <button
      type="button"
      class="settings-icon-btn"
      aria-label="Open general settings"
      @click="openSettings"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" width="22" height="22">
        <path
          fill="currentColor"
          d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 14.9 2h-3.8a.5.5 0 0 0-.49.42l-.36 2.54c-.6.24-1.14.55-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L3.71 8.48a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.43.34.68.22l2.39-.96c.49.39 1.03.7 1.63.94l.36 2.54c.05.24.25.42.49.42h3.8c.24 0 .44-.18.49-.42l.36-2.54c.6-.24 1.14-.55 1.63-.94l2.39.96c.25.12.54.02.68-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM13 15.5A3.5 3.5 0 1 1 13 8.5a3.5 3.5 0 0 1 0 7Z"
        />
      </svg>
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        class="settings-overlay"
        @click.self="closeSettings"
      >
        <div
          class="settings-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-title"
        >
          <header class="modal-header">
            <h2 id="settings-title">General Settings</h2>
            <button
              type="button"
              class="close-btn"
              aria-label="Close settings"
              @click="closeSettings"
            >
              ×
            </button>
          </header>

          <div class="settings-body">
            <div class="control-block">
              <span class="control-label">Themes</span>
              <div class="theme-grid" role="group" aria-label="Theme">
                <button
                  v-for="option in THEME_OPTIONS"
                  :key="option.id"
                  type="button"
                  class="theme-btn"
                  :class="[option.id, { active: theme === option.id }]"
                  @click="emit('update:theme', option.id)"
                >
                  <span class="swatches" aria-hidden="true">
                    <i /><i /><i />
                  </span>
                  {{ option.label }}
                </button>
              </div>
            </div>

            <div class="control-block">
              <span class="control-label">Currency</span>
              <div class="segment" role="group" aria-label="Currency">
                <button
                  type="button"
                  :class="{ active: currency === 'usd' }"
                  @click="emit('update:currency', 'usd')"
                >
                  Dollar ($)
                </button>
                <button
                  type="button"
                  :class="{ active: currency === 'php' }"
                  @click="emit('update:currency', 'php')"
                >
                  Peso (₱)
                </button>
              </div>
            </div>

            <div class="control-block">
              <span class="control-label">Add Month</span>
              <div class="add-month">
                <input v-model="newMonth" type="month" aria-label="New month" />
                <button type="button" class="add-month-btn" @click="onAddMonth">
                  Add
                </button>
              </div>
            </div>

            <CategoryManager
              :income-categories="incomeCategories"
              :expense-categories="expenseCategories"
              :savings-categories="savingsCategories"
              @add="(name, kind) => emit('add-category', name, kind)"
              @remove="(id) => emit('remove-category', id)"
            />

            <GoalsManager
              :goals="goals"
              :currency="currency"
              @add="(name, target) => emit('add-goal', name, target)"
              @remove="(id) => emit('remove-goal', id)"
            />
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.settings-root {
  display: inline-flex;
}

.settings-icon-btn {
  width: 2.6rem;
  height: 2.6rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid color-mix(in srgb, var(--mint) 40%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--paper) 85%, white);
  color: var(--ink);
  cursor: pointer;
  transition: transform 0.15s ease, background 0.15s ease;
}

.settings-icon-btn:hover {
  transform: rotate(18deg);
  background: white;
}

.settings-overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: color-mix(in srgb, var(--ink) 35%, transparent);
  backdrop-filter: blur(2px);
}

.settings-modal {
  width: min(560px, 100%);
  max-height: min(88vh, 820px);
  overflow: auto;
  border-radius: 20px;
  background: var(--paper);
  box-shadow: 0 18px 50px color-mix(in srgb, var(--ink) 22%, transparent);
  padding: 1.1rem 1.15rem 1.35rem;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.modal-header h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.45rem;
  color: var(--ink);
}

.close-btn {
  width: 2.1rem;
  height: 2.1rem;
  border: none;
  border-radius: 999px;
  background: color-mix(in srgb, var(--blush) 30%, white);
  color: var(--blush-deep);
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
}

.settings-body {
  display: flex;
  flex-direction: column;
  gap: 1.15rem;
}

.control-block {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.control-label {
  font-family: var(--font-body);
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ink-soft);
}

.segment {
  display: inline-flex;
  align-self: flex-start;
  padding: 0.2rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--mint) 18%, white);
  gap: 0.15rem;
}

.segment button {
  border: none;
  background: transparent;
  padding: 0.45rem 0.95rem;
  border-radius: 999px;
  font-family: var(--font-body);
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--ink-soft);
  cursor: pointer;
}

.segment button.active {
  background: white;
  color: var(--ink);
  box-shadow: 0 1px 4px color-mix(in srgb, var(--ink) 8%, transparent);
}

.theme-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.55rem;
}

.theme-btn {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.45rem;
  padding: 0.7rem 0.75rem;
  border-radius: 14px;
  border: 1.5px solid color-mix(in srgb, var(--mint) 30%, transparent);
  background: color-mix(in srgb, var(--paper) 70%, white);
  font-family: var(--font-body);
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--ink);
  cursor: pointer;
  text-align: left;
}

.theme-btn.active {
  border-color: var(--mint-deep);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--mint) 45%, transparent);
}

.swatches {
  display: flex;
  gap: 0.25rem;
}

.swatches i {
  width: 0.85rem;
  height: 0.85rem;
  border-radius: 999px;
}

.theme-btn.cozy .swatches i:nth-child(1) { background: #9fd8c5; }
.theme-btn.cozy .swatches i:nth-child(2) { background: #f3b6a8; }
.theme-btn.cozy .swatches i:nth-child(3) { background: #fff8f3; border: 1px solid #ddd; }

.theme-btn.ocean .swatches i:nth-child(1) { background: #8ecae6; }
.theme-btn.ocean .swatches i:nth-child(2) { background: #2a6f97; }
.theme-btn.ocean .swatches i:nth-child(3) { background: #f4f9fc; border: 1px solid #ddd; }

.theme-btn.meadow .swatches i:nth-child(1) { background: #b7d4a5; }
.theme-btn.meadow .swatches i:nth-child(2) { background: #d9c48a; }
.theme-btn.meadow .swatches i:nth-child(3) { background: #f7faf3; border: 1px solid #ddd; }

.theme-btn.dusk .swatches i:nth-child(1) { background: #c4b7a6; }
.theme-btn.dusk .swatches i:nth-child(2) { background: #d4a5a5; }
.theme-btn.dusk .swatches i:nth-child(3) { background: #f7f3ef; border: 1px solid #ddd; }

.add-month {
  display: inline-flex;
  gap: 0.4rem;
  align-items: center;
}

.add-month input {
  box-sizing: border-box;
  padding: 0.65rem 0.8rem;
  border-radius: 12px;
  border: 1.5px solid color-mix(in srgb, var(--mint) 40%, transparent);
  background: color-mix(in srgb, var(--paper) 80%, white);
  font-family: var(--font-body);
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--ink);
}

.add-month-btn {
  height: 2.5rem;
  padding: 0 0.95rem;
  border: none;
  border-radius: 12px;
  background: color-mix(in srgb, var(--mint) 55%, white);
  color: var(--mint-deep);
  font-family: var(--font-body);
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
}

@media (max-width: 560px) {
  .theme-grid,
  .add-month {
    grid-template-columns: 1fr;
  }

  .add-month {
    width: 100%;
  }

  .add-month input {
    flex: 1;
  }
}
</style>
