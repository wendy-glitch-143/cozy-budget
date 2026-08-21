import cors from 'cors'
import crypto from 'node:crypto'
import express from 'express'
import mysql from 'mysql2/promise'

const PORT = Number(process.env.PORT || 3001)
const CURRENCIES = new Set(['usd', 'php'])
const THEMES = new Set(['cozy', 'ocean', 'meadow', 'dusk'])
const KINDS = new Set(['income', 'expense'])
const PERIODS = new Set(['monthly', 'h1', 'h2'])

const DEFAULT_CATEGORIES = [
  { name: 'Salary', kind: 'income' },
  { name: 'Freelance', kind: 'income' },
  { name: 'Gift', kind: 'income' },
  { name: 'Food', kind: 'expense' },
  { name: 'Rent', kind: 'expense' },
  { name: 'Transport', kind: 'expense' },
  { name: 'Utilities', kind: 'expense' },
]

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'budget',
  password: process.env.MYSQL_PASSWORD || 'budgetpass',
  database: process.env.MYSQL_DATABASE || 'personal_budget',
  waitForConnections: true,
  connectionLimit: 10,
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
      kind ENUM('income', 'expense') NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_categories_name_kind (name, kind)
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS budget_items (
      id CHAR(36) PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      amount DECIMAL(12, 2) NOT NULL,
      kind ENUM('income', 'expense') NOT NULL,
      period ENUM('monthly', 'h1', 'h2') NOT NULL,
      month_key CHAR(7) NOT NULL,
      category_id CHAR(36) NULL,
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

  if (!(await tableHasColumn('app_settings', 'theme'))) {
    await pool.query(
      `ALTER TABLE app_settings
       ADD COLUMN theme VARCHAR(20) NOT NULL DEFAULT 'cozy'`,
    )
  }

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
      return res.status(400).json({ error: 'kind must be income or expense.' })
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
      return res.status(400).json({ error: 'Category must be income or expense.' })
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

app.get('/api/items', async (req, res) => {
  try {
    const settings = await getSettings()
    const monthKey = isMonthKey(req.query.month)
      ? String(req.query.month)
      : settings.activeMonth

    const [rows] = await pool.query(
      `SELECT i.id, i.name, i.amount, i.kind, i.period, i.month_key,
              i.category_id, c.name AS category_name
       FROM budget_items i
       LEFT JOIN categories c ON c.id = i.category_id
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

    await pool.query(
      'INSERT IGNORE INTO budget_months (month_key) VALUES (?)',
      [monthKey],
    )

    const id = crypto.randomUUID()
    const rounded = Math.round(amount * 100) / 100

    await pool.query(
      `INSERT INTO budget_items
        (id, name, amount, kind, period, month_key, category_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, name, rounded, kind, period, monthKey, categoryId],
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
  console.log(`Personal Budget Planner API on http://127.0.0.1:${PORT}`)
})
