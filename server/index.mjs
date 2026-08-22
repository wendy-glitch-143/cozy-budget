import cors from 'cors'
import crypto from 'node:crypto'
import express from 'express'
import mysql from 'mysql2/promise'

const PORT = Number(process.env.PORT || 3001)
const CURRENCIES = new Set(['usd', 'php'])
const THEMES = new Set(['cozy', 'ocean', 'meadow', 'dusk'])
const KINDS = new Set(['income', 'expense', 'savings'])
const PERIODS = new Set(['monthly', 'h1', 'h2'])

const DEFAULT_CATEGORIES = [
  { name: 'Salary', kind: 'income' },
  { name: 'Freelance', kind: 'income' },
  { name: 'Gift', kind: 'income' },
  { name: 'Food', kind: 'expense' },
  { name: 'Rent', kind: 'expense' },
  { name: 'Transport', kind: 'expense' },
  { name: 'Utilities', kind: 'expense' },
  { name: 'Emergency', kind: 'savings' },
  { name: 'Vacation', kind: 'savings' },
]

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'budget',
  password: process.env.MYSQL_PASSWORD || 'budgetpass',
  database: process.env.MYSQL_DATABASE || 'personal_budget',
  waitForConnections: true,
  connectionLimit: 10,
  ssl: process.env.MYSQL_SSL === 'false'
  ? undefined
  : { minVersion: 'TLSv1.2' },
})

function currentMonthKey() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${now.getFullYear()}-${month}`
}

function isMonthKey(value) {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}

function mapCategory(row) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
  }
}

function mapRow(row) {
  return {
    id: row.id,
    name: row.name,
    amount: Number(row.amount),
    kind: row.kind,
    period: row.period,
    monthKey: row.month_key,
    categoryId: row.category_id || null,
    categoryName: row.category_name || null,
    goalId: row.goal_id || null,
    goalName: row.goal_name || null,
  }
}

function mapGoal(row) {
  const targetAmount = Number(row.target_amount) || 0
  const savedAmount = Number(row.saved_amount) || 0
  const progress =
    targetAmount > 0
      ? Math.min(100, Math.round((savedAmount / targetAmount) * 1000) / 10)
      : 0
  return {
    id: row.id,
    name: row.name,
    targetAmount,
    savedAmount,
    progress,
  }
}

async function tableHasColumn(table, column) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  )
  return rows.length > 0
}

async function ensureEnumIncludesSavings(table, column) {
  const [rows] = await pool.query(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  )
  if (!rows.length) return
  const columnType = String(rows[0].COLUMN_TYPE || '')
  if (columnType.includes("'savings'")) return
  await pool.query(
    `ALTER TABLE \`${table}\`
     MODIFY COLUMN \`${column}\` ENUM('income', 'expense', 'savings') NOT NULL`,
  )
}

async function ensureSchema() {
  const monthKey = currentMonthKey()

  await pool.query(`
    CREATE TABLE IF NOT EXISTS budget_months (
      month_key CHAR(7) PRIMARY KEY,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      id TINYINT PRIMARY KEY,
      currency ENUM('usd', 'php') NOT NULL DEFAULT 'usd',
      theme VARCHAR(20) NOT NULL DEFAULT 'cozy',
      active_month CHAR(7) NOT NULL
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id CHAR(36) PRIMARY KEY,
      name VARCHAR(60) NOT NULL,
      kind ENUM('income', 'expense', 'savings') NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_categories_name_kind (name, kind)
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS savings_goals (
      id CHAR(36) PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      target_amount DECIMAL(12, 2) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS budget_items (
      id CHAR(36) PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      amount DECIMAL(12, 2) NOT NULL,
      kind ENUM('income', 'expense', 'savings') NOT NULL,
      period ENUM('monthly', 'h1', 'h2') NOT NULL,
      month_key CHAR(7) NOT NULL,
      category_id CHAR(36) NULL,
      goal_id CHAR(36) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_budget_items_month (month_key)
    )
  `)

  if (!(await tableHasColumn('budget_items', 'month_key'))) {
    await pool.query(
      `ALTER TABLE budget_items
       ADD COLUMN month_key CHAR(7) NOT NULL DEFAULT ?`,
      [monthKey],
    )
  }

  if (!(await tableHasColumn('budget_items', 'category_id'))) {
    await pool.query(
      `ALTER TABLE budget_items
       ADD COLUMN category_id CHAR(36) NULL`,
    )
  }

  if (!(await tableHasColumn('budget_items', 'goal_id'))) {
    await pool.query(
      `ALTER TABLE budget_items
       ADD COLUMN goal_id CHAR(36) NULL`,
    )
  }

  if (!(await tableHasColumn('app_settings', 'theme'))) {
    await pool.query(
      `ALTER TABLE app_settings
       ADD COLUMN theme VARCHAR(20) NOT NULL DEFAULT 'cozy'`,
    )
  }

  await ensureEnumIncludesSavings('categories', 'kind')
  await ensureEnumIncludesSavings('budget_items', 'kind')

  await pool.query(
    'INSERT IGNORE INTO budget_months (month_key) VALUES (?)',
    [monthKey],
  )

  await pool.query(
    `INSERT IGNORE INTO app_settings (id, currency, theme, active_month)
     VALUES (1, 'usd', 'cozy', ?)`,
    [monthKey],
  )

  const [existingCats] = await pool.query('SELECT COUNT(*) AS count FROM categories')
  if (Number(existingCats[0].count) === 0) {
    for (const category of DEFAULT_CATEGORIES) {
      await pool.query(
        'INSERT INTO categories (id, name, kind) VALUES (?, ?, ?)',
        [crypto.randomUUID(), category.name, category.kind],
      )
    }
  } else {
    for (const category of DEFAULT_CATEGORIES.filter((c) => c.kind === 'savings')) {
      await pool.query(
        'INSERT IGNORE INTO categories (id, name, kind) VALUES (?, ?, ?)',
        [crypto.randomUUID(), category.name, category.kind],
      )
    }
  }
}

async function getSettings() {
  const [rows] = await pool.query(
    'SELECT currency, theme, active_month FROM app_settings WHERE id = 1',
  )
  if (!rows.length) {
    const monthKey = currentMonthKey()
    return { currency: 'usd', theme: 'cozy', activeMonth: monthKey }
  }
  return {
    currency: rows[0].currency,
    theme: THEMES.has(rows[0].theme) ? rows[0].theme : 'cozy',
    activeMonth: rows[0].active_month,
  }
}

async function getCategory(id) {
  const [rows] = await pool.query(
    'SELECT id, name, kind FROM categories WHERE id = ?',
    [id],
  )
  return rows[0] || null
}

async function getGoal(id) {
  const [rows] = await pool.query(
    'SELECT id, name, target_amount FROM savings_goals WHERE id = ?',
    [id],
  )
  return rows[0] || null
}

async function listGoals() {
  const [rows] = await pool.query(
    `SELECT g.id, g.name, g.target_amount,
            COALESCE(SUM(i.amount), 0) AS saved_amount
     FROM savings_goals g
     LEFT JOIN budget_items i
       ON i.goal_id = g.id AND i.kind = 'savings'
     GROUP BY g.id, g.name, g.target_amount
     ORDER BY g.created_at ASC`,
  )
  return rows.map(mapGoal)
}

const app = express()
app.use(cors())
app.use(express.json())

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ ok: true })
  } catch (error) {
    res.status(503).json({ ok: false, error: String(error.message || error) })
  }
})

app.get('/api/settings', async (_req, res) => {
  try {
    res.json(await getSettings())
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) })
  }
})

app.put('/api/settings', async (req, res) => {
  try {
    const current = await getSettings()
    const currency = req.body?.currency ?? current.currency
    const theme = req.body?.theme ?? current.theme
    const activeMonth = req.body?.activeMonth ?? current.activeMonth

    if (!CURRENCIES.has(currency)) {
      return res.status(400).json({ error: 'Currency must be usd or php.' })
    }
    if (!THEMES.has(theme)) {
      return res.status(400).json({ error: 'Invalid theme.' })
    }
    if (!isMonthKey(activeMonth)) {
      return res.status(400).json({ error: 'Invalid active month.' })
    }

    await pool.query(
      'INSERT IGNORE INTO budget_months (month_key) VALUES (?)',
      [activeMonth],
    )
    await pool.query(
      `UPDATE app_settings
       SET currency = ?, theme = ?, active_month = ?
       WHERE id = 1`,
      [currency, theme, activeMonth],
    )

    res.json({ currency, theme, activeMonth })
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) })
  }
})

app.get('/api/months', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT month_key FROM budget_months ORDER BY month_key DESC',
    )
    res.json(rows.map((row) => row.month_key))
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) })
  }
})

app.post('/api/months', async (req, res) => {
  try {
    const monthKey = String(req.body?.monthKey || '').trim()
    if (!isMonthKey(monthKey)) {
      return res.status(400).json({ error: 'monthKey must be YYYY-MM.' })
    }

    await pool.query(
      'INSERT IGNORE INTO budget_months (month_key) VALUES (?)',
      [monthKey],
    )
    await pool.query(
      'UPDATE app_settings SET active_month = ? WHERE id = 1',
      [monthKey],
    )

    const [rows] = await pool.query(
      'SELECT month_key FROM budget_months ORDER BY month_key DESC',
    )
    res.status(201).json({
      monthKey,
      months: rows.map((row) => row.month_key),
    })
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) })
  }
})

app.get('/api/categories', async (req, res) => {
  try {
    const kind = req.query.kind
    if (kind && !KINDS.has(kind)) {
      return res.status(400).json({ error: 'kind must be income, expense, or savings.' })
    }

    const [rows] = kind
      ? await pool.query(
          'SELECT id, name, kind FROM categories WHERE kind = ? ORDER BY name ASC',
          [kind],
        )
      : await pool.query(
          'SELECT id, name, kind FROM categories ORDER BY kind ASC, name ASC',
        )

    res.json(rows.map(mapCategory))
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) })
  }
})

app.post('/api/categories', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim()
    const kind = req.body?.kind

    if (!name || name.length > 60) {
      return res.status(400).json({ error: 'Name is required (max 60 chars).' })
    }
    if (!KINDS.has(kind)) {
      return res.status(400).json({ error: 'Category must be income, expense, or savings.' })
    }

    const id = crypto.randomUUID()
    try {
      await pool.query(
        'INSERT INTO categories (id, name, kind) VALUES (?, ?, ?)',
        [id, name, kind],
      )
    } catch (error) {
      if (error?.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'That category already exists.' })
      }
      throw error
    }

    res.status(201).json({ id, name, kind })
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) })
  }
})

app.delete('/api/categories/:id', async (req, res) => {
  try {
    await pool.query(
      'UPDATE budget_items SET category_id = NULL WHERE category_id = ?',
      [req.params.id],
    )
    const [result] = await pool.query('DELETE FROM categories WHERE id = ?', [
      req.params.id,
    ])
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Category not found.' })
    }
    res.status(204).end()
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) })
  }
})

app.get('/api/goals', async (_req, res) => {
  try {
    res.json(await listGoals())
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) })
  }
})

app.post('/api/goals', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim()
    const targetAmount = Number(req.body?.targetAmount)

    if (!name || name.length > 80) {
      return res.status(400).json({ error: 'Name is required (max 80 chars).' })
    }
    if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
      return res.status(400).json({ error: 'Target must be a positive number.' })
    }

    const id = crypto.randomUUID()
    const rounded = Math.round(targetAmount * 100) / 100
    await pool.query(
      'INSERT INTO savings_goals (id, name, target_amount) VALUES (?, ?, ?)',
      [id, name, rounded],
    )

    res.status(201).json({
      id,
      name,
      targetAmount: rounded,
      savedAmount: 0,
      progress: 0,
    })
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) })
  }
})

app.delete('/api/goals/:id', async (req, res) => {
  try {
    await pool.query(
      'UPDATE budget_items SET goal_id = NULL WHERE goal_id = ?',
      [req.params.id],
    )
    const [result] = await pool.query('DELETE FROM savings_goals WHERE id = ?', [
      req.params.id,
    ])
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Goal not found.' })
    }
    res.status(204).end()
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) })
  }
})

app.get('/api/report/yearly', async (req, res) => {
  try {
    const year = Number(req.query.year)
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return res.status(400).json({ error: 'year must be a valid number.' })
    }

    const prefix = `${year}-`
    const [monthRows] = await pool.query(
      `SELECT month_key FROM budget_months
       WHERE month_key LIKE ?
       ORDER BY month_key ASC`,
      [`${prefix}%`],
    )
    const [sumRows] = await pool.query(
      `SELECT
         month_key,
         SUM(CASE WHEN kind = 'income' THEN amount ELSE 0 END) AS income,
         SUM(CASE WHEN kind = 'expense' THEN amount ELSE 0 END) AS expenses,
         SUM(CASE WHEN kind = 'savings' THEN amount ELSE 0 END) AS savings
       FROM budget_items
       WHERE month_key LIKE ?
       GROUP BY month_key
       ORDER BY month_key ASC`,
      [`${prefix}%`],
    )

    const byMonth = new Map(
      sumRows.map((row) => [
        row.month_key,
        {
          income: Number(row.income) || 0,
          expenses: Number(row.expenses) || 0,
          savings: Number(row.savings) || 0,
        },
      ]),
    )

    const monthKeys = [
      ...new Set([
        ...monthRows.map((row) => row.month_key),
        ...sumRows.map((row) => row.month_key),
      ]),
    ].sort()

    const rows = monthKeys.map((monthKey) => {
      const totals = byMonth.get(monthKey) || {
        income: 0,
        expenses: 0,
        savings: 0,
      }
      const income = Math.round(totals.income * 100) / 100
      const expenses = Math.round(totals.expenses * 100) / 100
      const savings = Math.round(totals.savings * 100) / 100
      return {
        monthKey,
        income,
        expenses,
        savings,
        balance: Math.round((income - expenses - savings) * 100) / 100,
      }
    })

    const totals = rows.reduce(
      (acc, row) => ({
        income: acc.income + row.income,
        expenses: acc.expenses + row.expenses,
        savings: acc.savings + row.savings,
        balance: acc.balance + row.balance,
      }),
      { income: 0, expenses: 0, savings: 0, balance: 0 },
    )

    res.json({
      year,
      rows,
      totals: {
        income: Math.round(totals.income * 100) / 100,
        expenses: Math.round(totals.expenses * 100) / 100,
        savings: Math.round(totals.savings * 100) / 100,
        balance: Math.round(totals.balance * 100) / 100,
      },
    })
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) })
  }
})

app.get('/api/items', async (req, res) => {
  try {
    const settings = await getSettings()
    const monthKey = isMonthKey(req.query.month)
      ? String(req.query.month)
      : settings.activeMonth

    const [rows] = await pool.query(
      `SELECT i.id, i.name, i.amount, i.kind, i.period, i.month_key,
              i.category_id, c.name AS category_name,
              i.goal_id, g.name AS goal_name
       FROM budget_items i
       LEFT JOIN categories c ON c.id = i.category_id
       LEFT JOIN savings_goals g ON g.id = i.goal_id
       WHERE i.month_key = ?
       ORDER BY i.created_at ASC`,
      [monthKey],
    )
    res.json(rows.map(mapRow))
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) })
  }
})

app.post('/api/items', async (req, res) => {
  try {
    const settings = await getSettings()
    const name = String(req.body?.name || '').trim()
    const amount = Number(req.body?.amount)
    const kind = req.body?.kind
    const period = req.body?.period
    const categoryId = req.body?.categoryId || null
    const goalId = req.body?.goalId || null
    const monthKey = isMonthKey(req.body?.monthKey)
      ? String(req.body.monthKey)
      : settings.activeMonth

    if (!name || name.length > 80) {
      return res.status(400).json({ error: 'Name is required (max 80 chars).' })
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number.' })
    }
    if (!KINDS.has(kind) || !PERIODS.has(period)) {
      return res.status(400).json({ error: 'Invalid kind or period.' })
    }

    let categoryName = null
    if (categoryId) {
      const category = await getCategory(categoryId)
      if (!category) {
        return res.status(400).json({ error: 'Category not found.' })
      }
      if (category.kind !== kind) {
        return res.status(400).json({
          error: `Category "${category.name}" is for ${category.kind}, not ${kind}.`,
        })
      }
      categoryName = category.name
    }

    let goalName = null
    let resolvedGoalId = null
    if (goalId) {
      if (kind !== 'savings') {
        return res.status(400).json({ error: 'Only savings items can link to a goal.' })
      }
      const goal = await getGoal(goalId)
      if (!goal) {
        return res.status(400).json({ error: 'Goal not found.' })
      }
      resolvedGoalId = goal.id
      goalName = goal.name
    }

    await pool.query(
      'INSERT IGNORE INTO budget_months (month_key) VALUES (?)',
      [monthKey],
    )

    const id = crypto.randomUUID()
    const rounded = Math.round(amount * 100) / 100

    await pool.query(
      `INSERT INTO budget_items
        (id, name, amount, kind, period, month_key, category_id, goal_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, rounded, kind, period, monthKey, categoryId, resolvedGoalId],
    )

    res.status(201).json({
      id,
      name,
      amount: rounded,
      kind,
      period,
      monthKey,
      categoryId,
      categoryName,
      goalId: resolvedGoalId,
      goalName,
    })
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) })
  }
})

app.delete('/api/items/:id', async (req, res) => {
  try {
    const id = req.params.id
    const [result] = await pool.query('DELETE FROM budget_items WHERE id = ?', [id])
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Item not found.' })
    }
    res.status(204).end()
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) })
  }
})

await ensureSchema()

app.listen(PORT, () => {
  console.log(`Cozy Budget API on http://127.0.0.1:${PORT}`)
})
