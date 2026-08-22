import bcrypt from 'bcrypt'
import cors from 'cors'
import crypto from 'node:crypto'
import express from 'express'
import jwt from 'jsonwebtoken'
import mysql from 'mysql2/promise'

const PORT = Number(process.env.PORT || 3001)
const JWT_SECRET = process.env.JWT_SECRET || 'dev-cozy-budget-secret'
const CURRENCIES = new Set(['usd', 'php'])
const THEMES = new Set(['cozy', 'ocean', 'meadow', 'dusk'])
const KINDS = new Set(['income', 'expense', 'savings'])
const PERIODS = new Set(['monthly', 'h1', 'h2'])
const USERNAME_RE = /^[A-Za-z0-9_]{3,32}$/

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

function publicUser(row) {
  return { id: row.id, username: row.username }
}

function signToken(user) {
  return jwt.sign({ sub: user.id, username: user.username }, JWT_SECRET, {
    expiresIn: '30d',
  })
}

async function tableHasColumn(table, column) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  )
  return rows.length > 0
}

async function tableHasIndex(table, indexName) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
     LIMIT 1`,
    [table, indexName],
  )
  return rows.length > 0
}

async function tablePrimaryKeyColumns(table) {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
       AND CONSTRAINT_NAME = 'PRIMARY'
     ORDER BY ORDINAL_POSITION`,
    [table],
  )
  return rows.map((row) => String(row.COLUMN_NAME))
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

async function ensureUserColumn(table) {
  if (await tableHasColumn(table, 'user_id')) return
  await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN user_id CHAR(36) NULL`)
}

async function ensureBudgetMonthsScope() {
  const primaryKey = await tablePrimaryKeyColumns('budget_months')
  const needsRebuild =
    !(await tableHasColumn('budget_months', 'id')) ||
    (primaryKey.length === 1 && primaryKey[0] === 'month_key')

  if (needsRebuild) {
    await pool.query('DROP TABLE IF EXISTS budget_months_v2')
    await pool.query(`
      CREATE TABLE budget_months_v2 (
        id CHAR(36) PRIMARY KEY,
        user_id CHAR(36) NULL,
        month_key CHAR(7) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_budget_months_user_month (user_id, month_key)
      )
    `)
    const hasUserId = await tableHasColumn('budget_months', 'user_id')
    const [rows] = await pool.query(
      hasUserId
        ? 'SELECT month_key, created_at, user_id FROM budget_months'
        : 'SELECT month_key, created_at FROM budget_months',
    )
    for (const row of rows) {
      await pool.query(
        `INSERT INTO budget_months_v2 (id, user_id, month_key, created_at)
         VALUES (?, ?, ?, ?)`,
        [crypto.randomUUID(), row.user_id || null, row.month_key, row.created_at],
      )
    }
    await pool.query('DROP TABLE budget_months')
    await pool.query('RENAME TABLE budget_months_v2 TO budget_months')
    return
  }

  await ensureUserColumn('budget_months')

  if (!(await tableHasIndex('budget_months', 'uq_budget_months_user_month'))) {
    await pool.query(
      'ALTER TABLE budget_months ADD UNIQUE KEY uq_budget_months_user_month (user_id, month_key)',
    )
  }
}

async function ensureCategoryScope() {
  await ensureUserColumn('categories')
  if (await tableHasIndex('categories', 'uq_categories_name_kind')) {
    await pool.query('ALTER TABLE categories DROP INDEX uq_categories_name_kind')
  }
  if (!(await tableHasIndex('categories', 'uq_categories_user_name_kind'))) {
    await pool.query(
      'ALTER TABLE categories ADD UNIQUE KEY uq_categories_user_name_kind (user_id, name, kind)',
    )
  }
}

async function ensureSchema() {
  const monthKey = currentMonthKey()

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id CHAR(36) PRIMARY KEY,
      username VARCHAR(32) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      currency ENUM('usd', 'php') NOT NULL DEFAULT 'usd',
      theme VARCHAR(20) NOT NULL DEFAULT 'cozy',
      active_month CHAR(7) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

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
  await ensureBudgetMonthsScope()
  await ensureCategoryScope()
  await ensureUserColumn('savings_goals')
  await ensureUserColumn('budget_items')
}

async function getSettings(userId) {
  const [rows] = await pool.query(
    'SELECT currency, theme, active_month FROM users WHERE id = ?',
    [userId],
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

async function getCategory(id, userId) {
  const [rows] = await pool.query(
    'SELECT id, name, kind FROM categories WHERE id = ? AND user_id = ?',
    [id, userId],
  )
  return rows[0] || null
}

async function getGoal(id, userId) {
  const [rows] = await pool.query(
    'SELECT id, name, target_amount FROM savings_goals WHERE id = ? AND user_id = ?',
    [id, userId],
  )
  return rows[0] || null
}

async function listGoals(userId) {
  const [rows] = await pool.query(
    `SELECT g.id, g.name, g.target_amount,
            COALESCE(SUM(i.amount), 0) AS saved_amount
     FROM savings_goals g
     LEFT JOIN budget_items i
       ON i.goal_id = g.id AND i.kind = 'savings' AND i.user_id = g.user_id
     WHERE g.user_id = ?
     GROUP BY g.id, g.name, g.target_amount
     ORDER BY g.created_at ASC`,
    [userId],
  )
  return rows.map(mapGoal)
}

async function listMonths(userId) {
  const [rows] = await pool.query(
    'SELECT month_key FROM budget_months WHERE user_id = ? ORDER BY month_key DESC',
    [userId],
  )
  return rows.map((row) => row.month_key)
}

async function ensureUserMonth(userId, monthKey) {
  const [existing] = await pool.query(
    'SELECT id FROM budget_months WHERE user_id = ? AND month_key = ?',
    [userId, monthKey],
  )
  if (existing.length) return
  await pool.query(
    'INSERT INTO budget_months (id, user_id, month_key) VALUES (?, ?, ?)',
    [crypto.randomUUID(), userId, monthKey],
  )
}

async function claimOrphanPlanner(userId) {
  const [settings] = await pool.query(
    'SELECT currency, theme, active_month FROM app_settings WHERE id = 1',
  )
  if (settings.length) {
    const theme = THEMES.has(settings[0].theme) ? settings[0].theme : 'cozy'
    await pool.query(
      'UPDATE users SET currency = ?, theme = ?, active_month = ? WHERE id = ?',
      [settings[0].currency, theme, settings[0].active_month, userId],
    )
  }

  await pool.query('UPDATE budget_months SET user_id = ? WHERE user_id IS NULL', [
    userId,
  ])
  await pool.query('UPDATE categories SET user_id = ? WHERE user_id IS NULL', [
    userId,
  ])
  await pool.query('UPDATE savings_goals SET user_id = ? WHERE user_id IS NULL', [
    userId,
  ])
  await pool.query('UPDATE budget_items SET user_id = ? WHERE user_id IS NULL', [
    userId,
  ])

  const [months] = await pool.query(
    'SELECT COUNT(*) AS count FROM budget_months WHERE user_id = ?',
    [userId],
  )
  if (Number(months[0].count) === 0) {
    const settingsNow = await getSettings(userId)
    await ensureUserMonth(userId, settingsNow.activeMonth)
  }
}

async function seedUserPlanner(userId) {
  const settings = await getSettings(userId)
  await ensureUserMonth(userId, settings.activeMonth)
  for (const category of DEFAULT_CATEGORIES) {
    await pool.query(
      'INSERT INTO categories (id, user_id, name, kind) VALUES (?, ?, ?, ?)',
      [crypto.randomUUID(), userId, category.name, category.kind],
    )
  }
}

async function claimOrSeedPlanner(userId) {
  const [others] = await pool.query(
    'SELECT COUNT(*) AS count FROM users WHERE id != ?',
    [userId],
  )
  if (Number(others[0].count) === 0) {
    const [counts] = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM budget_months WHERE user_id IS NULL) AS months,
        (SELECT COUNT(*) FROM categories WHERE user_id IS NULL) AS categories,
        (SELECT COUNT(*) FROM savings_goals WHERE user_id IS NULL) AS goals,
        (SELECT COUNT(*) FROM budget_items WHERE user_id IS NULL) AS items
    `)
    const orphan = counts[0]
    if (
      Number(orphan.months) ||
      Number(orphan.categories) ||
      Number(orphan.goals) ||
      Number(orphan.items)
    ) {
      await claimOrphanPlanner(userId)
      return
    }
  }
  await seedUserPlanner(userId)
}

async function requireAuth(req, res, next) {
  const header = String(req.headers.authorization || '')
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) {
    return res.status(401).json({ error: 'Sign in to continue.' })
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    const [rows] = await pool.query(
      'SELECT id, username, currency, theme, active_month FROM users WHERE id = ?',
      [payload.sub],
    )
    if (!rows.length) {
      return res.status(401).json({ error: 'Sign in to continue.' })
    }
    req.user = rows[0]
    next()
  } catch {
    return res.status(401).json({ error: 'Sign in to continue.' })
  }
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

app.post('/api/auth/signup', async (req, res) => {
  try {
    const username = String(req.body?.username || '').trim()
    const password = String(req.body?.password || '')

    if (!USERNAME_RE.test(username)) {
      return res.status(400).json({
        error: 'Username must be 3–32 letters, numbers, or _.',
      })
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' })
    }

    const id = crypto.randomUUID()
    const passwordHash = await bcrypt.hash(password, 10)
    try {
      await pool.query(
        `INSERT INTO users (id, username, password_hash, currency, theme, active_month)
         VALUES (?, ?, ?, 'usd', 'cozy', ?)`,
        [id, username, passwordHash, currentMonthKey()],
      )
    } catch (error) {
      if (error?.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'That username is taken.' })
      }
      throw error
    }

    try {
      await claimOrSeedPlanner(id)
    } catch (seedError) {
      console.error('Could not seed planner for new user:', seedError)
      try {
        await seedUserPlanner(id)
      } catch (fallbackError) {
        console.error('Could not seed default planner:', fallbackError)
      }
    }
    const token = signToken({ id, username })
    res.status(201).json({ token, user: { id, username } })
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) })
  }
})

app.post('/api/auth/login', async (req, res) => {
  try {
    const username = String(req.body?.username || '').trim()
    const password = String(req.body?.password || '')
    const [rows] = await pool.query(
      'SELECT id, username, password_hash FROM users WHERE username = ?',
      [username],
    )
    const match =
      rows.length > 0 && (await bcrypt.compare(password, rows[0].password_hash))
    if (!match) {
      return res.status(401).json({ error: 'Invalid username or password.' })
    }

    const user = { id: rows[0].id, username: rows[0].username }
    res.json({ token: signToken(user), user })
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) })
  }
})

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json(publicUser(req.user))
})

app.get('/api/settings', requireAuth, async (req, res) => {
  try {
    res.json(await getSettings(req.user.id))
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) })
  }
})

app.put('/api/settings', requireAuth, async (req, res) => {
  try {
    const current = await getSettings(req.user.id)
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

    await ensureUserMonth(req.user.id, activeMonth)
    await pool.query(
      `UPDATE users
       SET currency = ?, theme = ?, active_month = ?
       WHERE id = ?`,
      [currency, theme, activeMonth, req.user.id],
    )

    res.json({ currency, theme, activeMonth })
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) })
  }
})

app.get('/api/months', requireAuth, async (req, res) => {
  try {
    res.json(await listMonths(req.user.id))
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) })
  }
})

app.post('/api/months', requireAuth, async (req, res) => {
  try {
    const monthKey = String(req.body?.monthKey || '').trim()
    if (!isMonthKey(monthKey)) {
      return res.status(400).json({ error: 'monthKey must be YYYY-MM.' })
    }

    await ensureUserMonth(req.user.id, monthKey)
    await pool.query('UPDATE users SET active_month = ? WHERE id = ?', [
      monthKey,
      req.user.id,
    ])

    res.status(201).json({
      monthKey,
      months: await listMonths(req.user.id),
    })
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) })
  }
})

app.get('/api/categories', requireAuth, async (req, res) => {
  try {
    const kind = req.query.kind
    if (kind && !KINDS.has(kind)) {
      return res.status(400).json({ error: 'kind must be income, expense, or savings.' })
    }

    const [rows] = kind
      ? await pool.query(
          `SELECT id, name, kind FROM categories
           WHERE user_id = ? AND kind = ?
           ORDER BY name ASC`,
          [req.user.id, kind],
        )
      : await pool.query(
          `SELECT id, name, kind FROM categories
           WHERE user_id = ?
           ORDER BY kind ASC, name ASC`,
          [req.user.id],
        )

    res.json(rows.map(mapCategory))
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) })
  }
})

app.post('/api/categories', requireAuth, async (req, res) => {
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
        'INSERT INTO categories (id, user_id, name, kind) VALUES (?, ?, ?, ?)',
        [id, req.user.id, name, kind],
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

app.delete('/api/categories/:id', requireAuth, async (req, res) => {
  try {
    await pool.query(
      'UPDATE budget_items SET category_id = NULL WHERE category_id = ? AND user_id = ?',
      [req.params.id, req.user.id],
    )
    const [result] = await pool.query(
      'DELETE FROM categories WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id],
    )
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Category not found.' })
    }
    res.status(204).end()
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) })
  }
})

app.get('/api/goals', requireAuth, async (req, res) => {
  try {
    res.json(await listGoals(req.user.id))
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) })
  }
})

app.post('/api/goals', requireAuth, async (req, res) => {
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
      'INSERT INTO savings_goals (id, user_id, name, target_amount) VALUES (?, ?, ?, ?)',
      [id, req.user.id, name, rounded],
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

app.delete('/api/goals/:id', requireAuth, async (req, res) => {
  try {
    await pool.query(
      'UPDATE budget_items SET goal_id = NULL WHERE goal_id = ? AND user_id = ?',
      [req.params.id, req.user.id],
    )
    const [result] = await pool.query(
      'DELETE FROM savings_goals WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id],
    )
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Goal not found.' })
    }
    res.status(204).end()
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) })
  }
})

app.get('/api/report/yearly', requireAuth, async (req, res) => {
  try {
    const year = Number(req.query.year)
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return res.status(400).json({ error: 'year must be a valid number.' })
    }

    const prefix = `${year}-`
    const [monthRows] = await pool.query(
      `SELECT month_key FROM budget_months
       WHERE user_id = ? AND month_key LIKE ?
       ORDER BY month_key ASC`,
      [req.user.id, `${prefix}%`],
    )
    const [sumRows] = await pool.query(
      `SELECT
         month_key,
         SUM(CASE WHEN kind = 'income' THEN amount ELSE 0 END) AS income,
         SUM(CASE WHEN kind = 'expense' THEN amount ELSE 0 END) AS expenses,
         SUM(CASE WHEN kind = 'savings' THEN amount ELSE 0 END) AS savings
       FROM budget_items
       WHERE user_id = ? AND month_key LIKE ?
       GROUP BY month_key
       ORDER BY month_key ASC`,
      [req.user.id, `${prefix}%`],
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

app.get('/api/items', requireAuth, async (req, res) => {
  try {
    const settings = await getSettings(req.user.id)
    const monthKey = isMonthKey(req.query.month)
      ? String(req.query.month)
      : settings.activeMonth

    const [rows] = await pool.query(
      `SELECT i.id, i.name, i.amount, i.kind, i.period, i.month_key,
              i.category_id, c.name AS category_name,
              i.goal_id, g.name AS goal_name
       FROM budget_items i
       LEFT JOIN categories c ON c.id = i.category_id AND c.user_id = i.user_id
       LEFT JOIN savings_goals g ON g.id = i.goal_id AND g.user_id = i.user_id
       WHERE i.user_id = ? AND i.month_key = ?
       ORDER BY i.created_at ASC`,
      [req.user.id, monthKey],
    )
    res.json(rows.map(mapRow))
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) })
  }
})

app.post('/api/items', requireAuth, async (req, res) => {
  try {
    const settings = await getSettings(req.user.id)
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
      const category = await getCategory(categoryId, req.user.id)
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
      const goal = await getGoal(goalId, req.user.id)
      if (!goal) {
        return res.status(400).json({ error: 'Goal not found.' })
      }
      resolvedGoalId = goal.id
      goalName = goal.name
    }

    await ensureUserMonth(req.user.id, monthKey)

    const id = crypto.randomUUID()
    const rounded = Math.round(amount * 100) / 100

    await pool.query(
      `INSERT INTO budget_items
        (id, user_id, name, amount, kind, period, month_key, category_id, goal_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.user.id, name, rounded, kind, period, monthKey, categoryId, resolvedGoalId],
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

app.delete('/api/items/:id', requireAuth, async (req, res) => {
  try {
    const [result] = await pool.query(
      'DELETE FROM budget_items WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id],
    )
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
