-- ─── Eiden AI CRM — Supabase Schema ─────────────────────────────────────────
-- Run this once in your Supabase dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS workspaces (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id BIGINT
);

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT DEFAULT 'Commercial',
  workspace_id BIGINT REFERENCES workspaces(id)
);

CREATE TABLE IF NOT EXISTS knowledge_base (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contacts (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT,
  email TEXT,
  phone TEXT,
  status TEXT DEFAULT 'Lead',
  source TEXT,
  ltv NUMERIC DEFAULT 0,
  notes TEXT,
  workspace_id BIGINT REFERENCES workspaces(id),
  last_contact TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deals (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  value NUMERIC DEFAULT 0,
  stage TEXT DEFAULT 'Lead',
  contact_id BIGINT REFERENCES contacts(id),
  workspace_id BIGINT REFERENCES workspaces(id),
  risk_score INTEGER DEFAULT 0,
  win_probability INTEGER DEFAULT 20,
  expected_revenue NUMERIC DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  assignee_id BIGINT REFERENCES users(id),
  related_deal_id BIGINT REFERENCES deals(id),
  workspace_id BIGINT REFERENCES workspaces(id),
  due_date TEXT,
  status TEXT DEFAULT 'Pending',
  priority TEXT DEFAULT 'Medium',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_log (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id),
  action TEXT NOT NULL,
  related_to TEXT,
  type TEXT DEFAULT 'system',
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  workspace_id BIGINT NOT NULL REFERENCES workspaces(id),
  user_id BIGINT REFERENCES users(id),
  user_name TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_settings (
  workspace_id BIGINT PRIMARY KEY REFERENCES workspaces(id),
  meeting_link TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS zoom_tokens (
  workspace_id BIGINT PRIMARY KEY REFERENCES workspaces(id),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  zoom_user_id TEXT DEFAULT '',
  zoom_email TEXT DEFAULT ''
);

-- Global app settings (AI provider persistence across serverless calls)
CREATE TABLE IF NOT EXISTS global_settings (
  id INT PRIMARY KEY DEFAULT 1,
  ai_provider TEXT DEFAULT 'groq',
  CONSTRAINT single_row CHECK (id = 1)
);
INSERT INTO global_settings (id, ai_provider) VALUES (1, 'groq') ON CONFLICT DO NOTHING;

-- Enable Supabase Realtime on chat_messages (replaces WebSocket)
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
