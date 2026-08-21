import { computed, onMounted, ref } from 'vue'

export type Period = 'monthly' | 'h1' | 'h2'
export type Kind = 'income' | 'expense'
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

export interface BudgetItem {
  id: string
  name: string
  amount: number
  kind: Kind
  period: Period
  monthKey: string
  categoryId: string | null
  categoryName: string | null
}

const items = ref<BudgetItem[]>([])
const categories = ref<Category[]>([])
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

async function fetchSettings() {
  const res = await fetch('/api/settings')
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
  const res = await fetch('/api/months')
  if (!res.ok) throw new Error('Could not load months.')
  months.value = (await res.json()) as string[]
}

async function fetchCategories() {
  const res = await fetch('/api/categories')
  if (!res.ok) throw new Error('Could not load categories.')
  categories.value = (await res.json()) as Category[]
}

async function fetchItems() {
  const res = await fetch(`/api/items?month=${encodeURIComponent(activeMonth.value)}`)
  if (!res.ok) throw new Error('Could not load budget items.')
  items.value = (await res.json()) as BudgetItem[]
}

async function bootstrap() {
  loading.value = true
  error.value = ''
  try {
    await fetchSettings()
    await Promise.all([fetchMonths(), fetchCategories(), fetchItems()])
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not load budget.'
    items.value = []
  } finally {
    loading.value = false
  }
}

export function useBudget() {
  onMounted(() => {
    void bootstrap()
  })

  const filteredItems = computed(() =>
    items.value.filter((item) => item.period === activePeriod.value),
  )

  const incomeItems = computed(() =>
    filteredItems.value.filter((item) => item.kind === 'income'),
  )

  const expenseItems = computed(() =>
    filteredItems.value.filter((item) => item.kind === 'expense'),
  )

  const incomeCategories = computed(() =>
    categories.value.filter((category) => category.kind === 'income'),
  )

  const expenseCategories = computed(() =>
    categories.value.filter((category) => category.kind === 'expense'),
  )

  const totalIncome = computed(() =>
    incomeItems.value.reduce((sum, item) => sum + item.amount, 0),
  )

  const totalExpenses = computed(() =>
    expenseItems.value.reduce((sum, item) => sum + item.amount, 0),
  )

  const balance = computed(() => totalIncome.value - totalExpenses.value)

  async function saveSettings(patch: {
    currency?: Currency
    theme?: Theme
    activeMonth?: string
  }) {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
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
      const res = await fetch('/api/months', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      const res = await fetch(`/api/categories/${id}`, { method: 'DELETE' })
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

  async function addItem(
    name: string,
    amount: number,
    kind: Kind,
    categoryId: string | null,
  ) {
    const trimmed = name.trim()
    if (!trimmed || !Number.isFinite(amount) || amount <= 0) return

    saving.value = true
    error.value = ''
    try {
      const res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmed,
          amount: Math.round(amount * 100) / 100,
          kind,
          period: activePeriod.value,
          monthKey: activeMonth.value,
          categoryId,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Could not save item.')
      }
      const created = (await res.json()) as BudgetItem
      items.value = [...items.value, created]
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
    items.value = items.value.filter((item) => item.id !== id)
    try {
      const res = await fetch(`/api/items/${id}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 404) {
        throw new Error('Could not remove item.')
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
    incomeCategories,
    expenseCategories,
    filteredItems,
    incomeItems,
    expenseItems,
    totalIncome,
    totalExpenses,
    balance,
    loading,
    saving,
    error,
    addItem,
    removeItem,
    addCategory,
    removeCategory,
    categoriesForKind,
    setPeriod,
    setCurrency,
    setTheme,
    setActiveMonth,
    addMonth,
    refresh: bootstrap,
  }
}
