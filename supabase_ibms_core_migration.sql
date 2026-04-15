-- ─── IBMS Core Migration (Clients, Workflows, Billing, AI, Time Logs) ─────────
-- Run this after supabase_migration.sql in Supabase SQL Editor.

-- Clients
CREATE TABLE IF NOT EXISTS clients (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  legal_name TEXT,
  tax_id TEXT,
  industry TEXT,
  status TEXT DEFAULT 'active',
  risk_score NUMERIC(5,2),
  custom_fields JSONB DEFAULT '{}'::jsonb,
  onboarding_stage TEXT DEFAULT 'New',
  contact_person TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  monthly_value NUMERIC DEFAULT 0,
  notes TEXT,
  workspace_id BIGINT REFERENCES workspaces(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

ALTER TABLE clients ADD COLUMN IF NOT EXISTS legal_name TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS tax_id TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS risk_score NUMERIC(5,2);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'::jsonb;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS onboarding_stage TEXT DEFAULT 'New';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_person TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS monthly_value NUMERIC DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS workspace_id BIGINT REFERENCES workspaces(id);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE clients ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS client_tags (
  client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (client_id, tag)
);

CREATE TABLE IF NOT EXISTS client_relationships (
  parent_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  child_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (parent_id, child_id)
);

-- Tasks extensions for SLA/client linkage
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS client_id BIGINT REFERENCES clients(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS overdue_reason TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS overdue_reason_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Workflow catalog + executions
CREATE TABLE IF NOT EXISTS workflow_definitions (
  id BIGSERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  definition JSONB DEFAULT '{}'::jsonb,
  version INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS workflow_executions (
  id UUID PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  temporal_run_id TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  context JSONB DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Billing
CREATE TABLE IF NOT EXISTS subscriptions (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT REFERENCES clients(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE,
  status TEXT DEFAULT 'active',
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS invoices (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT REFERENCES clients(id) ON DELETE CASCADE,
  stripe_invoice_id TEXT UNIQUE,
  amount_cents BIGINT DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  status TEXT DEFAULT 'draft',
  issued_at TIMESTAMPTZ DEFAULT NOW(),
  pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS stripe_invoice_id TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS amount_cents BIGINT DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS issued_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pdf_url TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Onboarding tracking
CREATE TABLE IF NOT EXISTS onboarding_checklists (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT REFERENCES clients(id) ON DELETE CASCADE,
  template_id TEXT,
  progress JSONB DEFAULT '{}'::jsonb,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI usage monitoring
CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id BIGSERIAL PRIMARY KEY,
  endpoint TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  cost_micro_usd BIGINT DEFAULT 0,
  user_id BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Time tracking
CREATE TABLE IF NOT EXISTS time_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  user_name TEXT NOT NULL,
  task_id BIGINT REFERENCES tasks(id) ON DELETE SET NULL,
  task_title TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  duration_minutes INTEGER DEFAULT 0,
  notes TEXT,
  workspace_id BIGINT REFERENCES workspaces(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Event log for async/event-driven workflows
CREATE TABLE IF NOT EXISTS event_log (
  id BIGSERIAL PRIMARY KEY,
  topic TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Webhook idempotency receipts (prevents double-processing)
CREATE TABLE IF NOT EXISTS webhook_receipts (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (provider, event_id)
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_clients_workspace_status ON clients(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_client_tags_tag ON client_tags(tag);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_status_due ON tasks(assignee_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_workflow_exec_status_started ON workflow_executions(status, started_at);
CREATE INDEX IF NOT EXISTS idx_subscriptions_client_status ON subscriptions(client_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_status_issued ON invoices(status, issued_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_created_at ON ai_usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_time_logs_workspace_user_start ON time_logs(workspace_id, user_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_event_log_topic_created ON event_log(topic, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_receipts_provider_created ON webhook_receipts(provider, created_at DESC);
