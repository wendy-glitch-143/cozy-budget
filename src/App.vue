<script setup lang="ts">
import AddItemForm from './components/AddItemForm.vue'
import AuthScreen from './components/AuthScreen.vue'
import GeneralSettings from './components/GeneralSettings.vue'
import ItemList from './components/ItemList.vue'
import MonthSwitcher from './components/MonthSwitcher.vue'
import SummaryCards from './components/SummaryCards.vue'
import YearlyReport from './components/YearlyReport.vue'
import { computed, watch } from 'vue'
import { useAuth } from './composables/useAuth'
import { useBudget, type Period } from './composables/useBudget'

const { user, ready, authError, authBusy, login, signup, logout } = useAuth()
const {
  activePeriod,
  activeMonth,
  months,
  currency,
  theme,
  categories,
  goals,
  incomeCategories,
  expenseCategories,
  savingsCategories,
  incomeItems,
  expenseItems,
  savingsItems,
  totalIncome,
  totalExpenses,
  totalSavings,
  balance,
  loading,
  error,
  addItem,
  removeItem,
  addCategory,
  removeCategory,
  addGoal,
  removeGoal,
  setPeriod,
  setCurrency,
  setTheme,
  setActiveMonth,
  addMonth,
  bootstrap,
  resetBudget,
} = useBudget()

watch(user, (next) => {
  if (next) void bootstrap()
  else resetBudget()
})

const periods: { id: Period; label: string }[] = [
  { id: 'monthly', label: 'Monthly' },
  { id: 'h1', label: '1–15' },
  { id: 'h2', label: '16–end' },
]

const reportYears = computed(() => {
  const years = months.value
    .map((month) => Number(month.slice(0, 4)))
    .filter((year) => Number.isFinite(year))
  return [...new Set(years)].sort((a, b) => b - a)
})

const defaultReportYear = computed(() => {
  const fromActive = Number(activeMonth.value.slice(0, 4))
  return Number.isFinite(fromActive) ? fromActive : new Date().getFullYear()
})
</script>

<template>
  <div class="shell" :class="{ centered: !user }">
  <div class="page">
    <p v-if="!ready" class="status">Loading…</p>
    <AuthScreen
      v-else-if="!user"
      :busy="authBusy"
      :error="authError"
      @login="login"
      @signup="signup"
    />
    <template v-else>
    <header class="hero">
      <div class="hero-top">
        <p class="brand">Cozy Budget - Personal Planner</p>
        <div class="hero-actions">
          <span class="username">{{ user.username }}</span>
          <button type="button" class="logout-btn" @click="logout">Log out</button>
        <GeneralSettings
          :currency="currency"
          :theme="theme"
          :income-categories="incomeCategories"
          :expense-categories="expenseCategories"
          :savings-categories="savingsCategories"
          :goals="goals"
          @update:currency="setCurrency"
          @update:theme="setTheme"
          @add-month="addMonth"
          @add-category="addCategory"
          @remove-category="removeCategory"
          @add-goal="addGoal"
          @remove-goal="removeGoal"
        />
        </div>
      </div>
      <p class="tagline">Track income, expenses, and savings goals.</p>
    </header>

    <p v-if="error" class="status error" role="alert">{{ error }}</p>
    <p v-else-if="loading" class="status">Loading your budget…</p>

    <MonthSwitcher
      :months="months"
      :active-month="activeMonth"
      @update:month="setActiveMonth"
    />

    <nav class="period-tabs" aria-label="Budget period">
      <button
        v-for="period in periods"
        :key="period.id"
        type="button"
        class="tab"
        :class="{ active: activePeriod === period.id }"
        @click="setPeriod(period.id)"
      >
        {{ period.label }}
      </button>
      <span
        class="tab-underline"
        :style="{
          transform: `translateX(${periods.findIndex((p) => p.id === activePeriod) * 100}%)`,
        }"
      />
    </nav>

    <SummaryCards
      :income="totalIncome"
      :expenses="totalExpenses"
      :savings="totalSavings"
      :balance="balance"
      :currency="currency"
    />

    <AddItemForm :categories="categories" :goals="goals" @add="addItem" />

    <ItemList
      title="Income"
      kind="income"
      :items="incomeItems"
      :currency="currency"
      empty-message="No income yet — add a paycheck or gift."
      @remove="removeItem"
    />

    <ItemList
      title="Expenses"
      kind="expense"
      :items="expenseItems"
      :currency="currency"
      empty-message="No expenses yet — you’re living lightly."
      @remove="removeItem"
    />

    <ItemList
      title="Savings"
      kind="savings"
      :items="savingsItems"
      :currency="currency"
      empty-message="No savings yet — set some money aside."
      @remove="removeItem"
    />

    <YearlyReport
      :currency="currency"
      :default-year="defaultReportYear"
      :available-years="reportYears"
    />
    </template>
  </div>
  </div>
</template>

<style scoped>
.shell.centered {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.page {
  position: relative;
  z-index: 1;
  width: min(640px, calc(100% - 1.5rem));
  margin: 1rem auto;
  padding: 2.5rem 1.25rem 3.5rem;
  background: color-mix(in srgb, var(--paper) 14%, transparent);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border: 1px solid color-mix(in srgb, white 60%, transparent);
  border-radius: 24px;
  box-shadow: 0 8px 32px color-mix(in srgb, var(--ink) 8%, transparent);
}

.hero {
  margin-bottom: 0.25rem;
}

.hero-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.hero-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.username {
  font-family: var(--font-body);
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--ink-soft);
}

.logout-btn {
  border: 1.5px solid color-mix(in srgb, var(--mint) 40%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--paper) 85%, white);
  padding: 0.35rem 0.75rem;
  font-family: var(--font-body);
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--ink);
  cursor: pointer;
}

.brand {
  margin: 0 0 0.45rem;
  font-family: var(--font-display);
  font-size: clamp(2rem, 7vw, 2.9rem);
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: -0.02em;
  color: var(--ink);
}

.tagline {
  margin: 0;
  max-width: 34ch;
  font-family: var(--font-body);
  font-size: 1.05rem;
  line-height: 1.45;
  color: var(--ink-soft);
}

.status {
  margin: 0.75rem 0 0;
  font-family: var(--font-body);
  font-size: 0.95rem;
  color: var(--ink-soft);
}

.status.error {
  color: var(--blush-deep);
}

.period-tabs {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0;
  padding: 0.25rem;
  border-radius: 16px;
  background: color-mix(in srgb, var(--mint) 16%, white);
}

.tab {
  position: relative;
  z-index: 1;
  border: none;
  background: transparent;
  padding: 0.7rem 0.5rem;
  border-radius: 12px;
  font-family: var(--font-body);
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--ink-soft);
  cursor: pointer;
  transition: color 0.2s ease;
}

.tab.active {
  color: var(--ink);
}

.tab-underline {
  position: absolute;
  top: 0.25rem;
  left: 0.25rem;
  width: calc((100% - 0.5rem) / 3);
  height: calc(100% - 0.5rem);
  border-radius: 12px;
  background: white;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--ink) 8%, transparent);
  transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
  pointer-events: none;
}
</style>
