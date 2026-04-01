-- ============================================================
--  RUN THIS in Supabase SQL Editor to add role-based access
--  (Run this AFTER supabase_setup.sql)
-- ============================================================

-- Add role column to users (admin | user)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';

-- Add emp_id to link a login account to an employee record
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS emp_id INTEGER REFERENCES public.employees(id) ON DELETE SET NULL;

-- Make the admin account an admin role
UPDATE public.users SET role = 'admin' WHERE username = 'admin';

-- (sandeep stays as role = 'user')
