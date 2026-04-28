-- ─── Task Enhancement Migration (Subtasks, Comments, Review Workflow) ─────────
-- Run this after supabase_ibms_core_migration.sql in Supabase SQL Editor.

-- Subtasks table
CREATE TABLE IF NOT EXISTS task_subtasks (
  id BIGSERIAL PRIMARY KEY,
  task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  due_date TEXT,
  status TEXT DEFAULT 'Pending',
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comments table
CREATE TABLE IF NOT EXISTS task_comments (
  id BIGSERIAL PRIMARY KEY,
  task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add rejection_reason to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_subtasks_task ON task_subtasks(task_id);
CREATE INDEX IF NOT EXISTS idx_comments_task ON task_comments(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subtasks_status ON task_subtasks(status);
