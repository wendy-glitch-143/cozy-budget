import { computed, ref } from 'vue'
import { clearSession, getToken } from './useAuth'

export type Period = 'monthly' | 'h1' | 'h2'
export type Kind = 'income' | 'expense' | 'savings'
export type Currency = 'usd' | 'php'
export type Theme = 'cozy' | 'ocean' | 'meadow' | 'dusk'

export const THEME_OPTIONS: { id: Theme; label: string }[] = [
  { id: 'cozy', label: 'Cozy mint' },
  { id: 'ocean', label: 'Ocean blue' },
  { id: 'meadow', label: 'Meadow green' },
  { id: 'dusk', label: 'Soft dusk' },
]

export interface Category {
  id: string
  name: string
  kind: Kind
}

export interface SavingsGoal {
  id: string
  name: string
  targetAmount: number
  savedAmount: number
  progress: number
}

export interface BudgetItem {
  id: string
  name: string
  amount: number
  kind: Kind
  period: Period
  monthKey: string
  categoryId: string | null
  categoryName: string | null
  goalId: string | null
  goalName: string | null
}

const items = ref<BudgetItem[]>([])
const categories = ref<Category[]>([])
const goals = ref<SavingsGoal[]>([])
const months = ref<string[]>([])
const currency = ref<Currency>('usd')
const theme = ref<Theme>('cozy')
const activeMonth = ref(currentMonthKey())
const activePeriod = ref<Period>('monthly')
const loading = ref(true)
const saving = ref(false)
const error = ref('')

function applyTheme(next: Theme) {
  document.documentElement.dataset.theme = next
}

function currentMonthKey() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${now.getFullYear()}-${month}`
}

export function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number)
  if (!year || !month) return monthKey
  return new Date(year, month - 1, 1).toLocaleString(undefined, {
    month: 'long',
    year: 'numeric',
  })
}

export function formatMoney(amount: number, selected: Currency = 'usd') {
  const sign = amount < 0 ? '-' : ''
  const symbol = selected === 'php' ? '₱' : '$'
  return `${sign}${symbol}${Math.abs(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/** Empty locally (Vite proxy); set VITE_API_BASE on Vercel to the Render API URL. */
const API_BASE = String(import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')

export function apiUrl(path: string) {
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const res = await fetch(apiUrl(path), { ...init, headers })
  if (res.status === 401) clearSession()
  return res
}

async function fetchSettings() {
  const res = await apiFetch('/api/settings')
  if (!res.ok) throw new Error('Could not load settings.')
  const data = (await res.json()) as {
    currency: Currency
    theme: Theme
    activeMonth: string
  }
  currency.value = data.currency
  theme.value = data.theme || 'cozy'
  activeMonth.value = data.activeMonth
  applyTheme(theme.value)
}

async function fetchMonths() {
  const res = await apiFetch('/api/months')
  if (!res.ok) throw new Error('Could not load months.')
  months.value = (await res.json()) as string[]
}

async function fetchCategories() {
  const res = await apiFetch('/api/categories')
  if (!res.ok) throw new Error('Could not load categories.')
  categories.value = (await res.json()) as Category[]
}

async function fetchGoals() {
  const res = await apiFetch('/api/goals')
  if (!res.ok) throw new Error('Could not load goals.')
  goals.value = (await res.json()) as SavingsGoal[]
}

async function fetchItems() {
  const res = await apiFetch(
    `/api/items?month=${encodeURIComponent(activeMonth.value)}`,
  )
  if (!res.ok) throw new Error('Could not load budget items.')
  items.value = (await res.json()) as BudgetItem[]
}

export async function bootstrap() {
  loading.value = true
  error.value = ''
  try {
    await fetchSettings()
    await Promise.all([fetchMonths(), fetchCategories(), fetchGoals(), fetchItems()])
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not load budget.'
    items.value = []
  } finally {
    loading.value = false
  }
}

export function resetBudget() {
  items.value = []
  categories.value = []
  goals.value = []
  months.value = []
  currency.value = 'usd'
  theme.value = 'cozy'
  applyTheme('cozy')
  activeMonth.value = currentMonthKey()
  activePeriod.value = 'monthly'
  loading.value = false
  error.value = ''
}

export function useBudget() {

  const filteredItems = computed(() =>
    items.value.filter((item) => item.period === activePeriod.value),
  )

  const incomeItems = computed(() =>
    filteredItems.value.filter((item) => item.kind === 'income'),
  )

  const expenseItems = computed(() =>
    filteredItems.value.filter((item) => item.kind === 'expense'),
  )

  const savingsItems = computed(() =>
    filteredItems.value.filter((item) => item.kind === 'savings'),
  )

  const incomeCategories = computed(() =>
    categories.value.filter((category) => category.kind === 'income'),
  )

  const expenseCategories = computed(() =>
    categories.value.filter((category) => category.kind === 'expense'),
  )

  const savingsCategories = computed(() =>
    categories.value.filter((category) => category.kind === 'savings'),
  )

  const totalIncome = computed(() =>
    incomeItems.value.reduce((sum, item) => sum + item.amount, 0),
  )

  const totalExpenses = computed(() =>
    expenseItems.value.reduce((sum, item) => sum + item.amount, 0),
  )

  const totalSavings = computed(() =>
    savingsItems.value.reduce((sum, item) => sum + item.amount, 0),
  )

  const balance = computed(
    () => totalIncome.value - totalExpenses.value - totalSavings.value,
  )

  async function saveSettings(patch: {
    currency?: Currency
    theme?: Theme
    activeMonth?: string
  }) {
    const res = await apiFetch('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({
        currency: patch.currency ?? currency.value,
        theme: patch.theme ?? theme.value,
        activeMonth: patch.activeMonth ?? activeMonth.value,
      }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || 'Could not save settings.')
    }
    return (await res.json()) as {
      currency: Currency
      theme: Theme
      activeMonth: string
    }
  }

  async function setCurrency(next: Currency) {
    if (next === currency.value) return
    const previous = currency.value
    currency.value = next
    try {
      await saveSettings({ currency: next })
    } catch (err) {
      currency.value = previous
      error.value = err instanceof Error ? err.message : 'Could not save currency.'
    }
  }

  async function setTheme(next: Theme) {
    if (next === theme.value) return
    const previous = theme.value
    theme.value = next
    applyTheme(next)
    try {
      await saveSettings({ theme: next })
    } catch (err) {
      theme.value = previous
      applyTheme(previous)
      error.value = err instanceof Error ? err.message : 'Could not save theme.'
    }
  }

  async function setActiveMonth(monthKey: string) {
    if (monthKey === activeMonth.value) return
    const previous = activeMonth.value
    activeMonth.value = monthKey
    loading.value = true
    error.value = ''
    try {
      await saveSettings({ activeMonth: monthKey })
      await fetchItems()
    } catch (err) {
      activeMonth.value = previous
      error.value = err instanceof Error ? err.message : 'Could not switch month.'
    } finally {
      loading.value = false
    }
  }

  async function addMonth(monthKey: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) {
      error.value = 'Pick a valid month.'
      return
    }

    saving.value = true
    error.value = ''
    try {
      const res = await apiFetch('/api/months', {
        method: 'POST',
        body: JSON.stringify({ monthKey }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Could not add month.')
      }
      const data = (await res.json()) as { monthKey: string; months: string[] }
      months.value = data.months
      activeMonth.value = data.monthKey
      await fetchItems()
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Could not add month.'
    } finally {
      saving.value = false
    }
  }

  async function addCategory(name: string, kind: Kind) {
    const trimmed = name.trim()
    if (!trimmed) return

    saving.value = true
    error.value = ''
    try {
      const res = await apiFetch('/api/categories', {
        method: 'POST',
        body: JSON.stringify({ name: trimmed, kind }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Could not add category.')
      }
      const created = (await res.json()) as Category
      categories.value = [...categories.value, created].sort((a, b) => {
        if (a.kind === b.kind) return a.name.localeCompare(b.name)
        return a.kind.localeCompare(b.kind)
      })
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Could not add category.'
    } finally {
      saving.value = false
    }
  }

  async function removeCategory(id: string) {
    saving.value = true
    error.value = ''
    const previousCategories = categories.value
    const previousItems = items.value
    categories.value = categories.value.filter((category) => category.id !== id)
    items.value = items.value.map((item) =>
      item.categoryId === id
        ? { ...item, categoryId: null, categoryName: null }
        : item,
    )
    try {
      const res = await apiFetch(`/api/categories/${id}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 404) {
        throw new Error('Could not remove category.')
      }
    } catch (err) {
      categories.value = previousCategories
      items.value = previousItems
      error.value = err instanceof Error ? err.message : 'Could not remove category.'
    } finally {
      saving.value = false
    }
  }

  async function addGoal(name: string, targetAmount: number) {
    const trimmed = name.trim()
    if (!trimmed || !Number.isFinite(targetAmount) || targetAmount <= 0) return

    saving.value = true
    error.value = ''
    try {
      const res = await apiFetch('/api/goals', {
        method: 'POST',
        body: JSON.stringify({
          name: trimmed,
          targetAmount: Math.round(targetAmount * 100) / 100,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Could not add goal.')
      }
      const created = (await res.json()) as SavingsGoal
      goals.value = [...goals.value, created]
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Could not add goal.'
    } finally {
      saving.value = false
    }
  }

  async function removeGoal(id: string) {
    saving.value = true
    error.value = ''
    const previousGoals = goals.value
    const previousItems = items.value
    goals.value = goals.value.filter((goal) => goal.id !== id)
    items.value = items.value.map((item) =>
      item.goalId === id ? { ...item, goalId: null, goalName: null } : item,
    )
    try {
      const res = await apiFetch(`/api/goals/${id}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 404) {
        throw new Error('Could not remove goal.')
      }
    } catch (err) {
      goals.value = previousGoals
      items.value = previousItems
      error.value = err instanceof Error ? err.message : 'Could not remove goal.'
    } finally {
      saving.value = false
    }
  }

  async function addItem(
    name: string,
    amount: number,
    kind: Kind,
    categoryId: string | null,
    goalId: string | null = null,
  ) {
    const trimmed = name.trim()
    if (!trimmed || !Number.isFinite(amount) || amount <= 0) return

    saving.value = true
    error.value = ''
    try {
      const res = await apiFetch('/api/items', {
        method: 'POST',
        body: JSON.stringify({
          name: trimmed,
          amount: Math.round(amount * 100) / 100,
          kind,
          period: activePeriod.value,
          monthKey: activeMonth.value,
          categoryId,
          goalId: kind === 'savings' ? goalId : null,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Could not save item.')
      }
      const created = (await res.json()) as BudgetItem
      items.value = [...items.value, created]
      if (kind === 'savings') {
        await fetchGoals()
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Could not save item.'
    } finally {
      saving.value = false
    }
  }

  async function removeItem(id: string) {
    saving.value = true
    error.value = ''
    const previous = items.value
    const removed = items.value.find((item) => item.id === id)
    items.value = items.value.filter((item) => item.id !== id)
    try {
      const res = await apiFetch(`/api/items/${id}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 404) {
        throw new Error('Could not remove item.')
      }
      if (removed?.kind === 'savings') {
        await fetchGoals()
      }
    } catch (err) {
      items.value = previous
      error.value = err instanceof Error ? err.message : 'Could not remove item.'
    } finally {
      saving.value = false
    }
  }

  function setPeriod(period: Period) {
    activePeriod.value = period
  }

  function categoriesForKind(kind: Kind) {
    return categories.value.filter((category) => category.kind === kind)
  }

  return {
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
    filteredItems,
    incomeItems,
    expenseItems,
    savingsItems,
    totalIncome,
    totalExpenses,
    totalSavings,
    balance,
    loading,
    saving,
    error,
    addItem,
    removeItem,
    addCategory,
    removeCategory,
    addGoal,
    removeGoal,
    categoriesForKind,
    setPeriod,
    setCurrency,
    setTheme,
    setActiveMonth,
    addMonth,
    bootstrap,
    resetBudget,
    refresh: bootstrap,
  }
}
