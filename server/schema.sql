CREATE TABLE IF NOT EXISTS budget_months (
  month_key CHAR(7) PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app_settings (
  id TINYINT PRIMARY KEY,
  currency ENUM('usd', 'php') NOT NULL DEFAULT 'usd',
  theme VARCHAR(20) NOT NULL DEFAULT 'cozy',
  active_month CHAR(7) NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(60) NOT NULL,
  kind ENUM('income', 'expense', 'savings') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_categories_name_kind (name, kind)
);

CREATE TABLE IF NOT EXISTS savings_goals (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  target_amount DECIMAL(12, 2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
  INDEX idx_budget_items_month (month_key),
  CONSTRAINT fk_budget_items_category
    FOREIGN KEY (category_id) REFERENCES categories(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_budget_items_goal
    FOREIGN KEY (goal_id) REFERENCES savings_goals(id)
    ON DELETE SET NULL
);
