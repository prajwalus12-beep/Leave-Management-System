-- ============================================================
--  LEAVE MANAGEMENT SYSTEM — Supabase SQL Setup
--  Run this entire script in the Supabase SQL Editor
-- ============================================================

-- 1. USERS TABLE (authentication)
CREATE TABLE IF NOT EXISTS public.users (
    id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    username   TEXT        UNIQUE NOT NULL,
    password_hash TEXT     NOT NULL,
    email      TEXT        NOT NULL DEFAULT 'sandeepjain200019@gmail.com',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. EMPLOYEES TABLE
CREATE TABLE IF NOT EXISTS public.employees (
    id                  SERIAL PRIMARY KEY,
    name                TEXT    NOT NULL,
    role                TEXT    NOT NULL DEFAULT 'Engineering',
    pl_brought_forward  NUMERIC DEFAULT 0,
    pl_used             NUMERIC DEFAULT 0,
    pl_adjustment       NUMERIC DEFAULT 0,
    cl_sl_used          NUMERIC DEFAULT 0,
    cl_sl_adjustment    NUMERIC DEFAULT 0,
    comp_total          NUMERIC DEFAULT 0,
    comp_used           NUMERIC DEFAULT 0,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- 3. LEAVE REQUESTS TABLE (pending approvals)
CREATE TABLE IF NOT EXISTS public.leave_requests (
    id          SERIAL PRIMARY KEY,
    emp_id      INTEGER     REFERENCES public.employees(id) ON DELETE CASCADE,
    emp_name    TEXT        NOT NULL,
    start_date  DATE        NOT NULL,
    end_date    DATE        NOT NULL,
    leave_type  TEXT        NOT NULL,   -- PL | CL | SL | COMP | LOP | MAT
    days        NUMERIC     NOT NULL,
    is_half_day BOOLEAN     DEFAULT FALSE,
    half_type   TEXT,                   -- 'First Half' | 'Second Half'
    reason      TEXT,
    stage       TEXT        DEFAULT 'Manager Review',  -- Manager Review | HR Review | Rejected
    document_url TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 4. APPROVED LEAVES TABLE
CREATE TABLE IF NOT EXISTS public.approved_leaves (
    id          SERIAL PRIMARY KEY,
    emp_id      INTEGER     REFERENCES public.employees(id) ON DELETE CASCADE,
    emp_name    TEXT        NOT NULL,
    date_str    DATE        NOT NULL,
    leave_type  TEXT        NOT NULL,
    is_half_day BOOLEAN     DEFAULT FALSE,
    half_type   TEXT,
    days        NUMERIC     DEFAULT 1,
    reason      TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 5. COMP OFF REQUESTS TABLE
CREATE TABLE IF NOT EXISTS public.comp_requests (
    id          SERIAL PRIMARY KEY,
    emp_id      INTEGER     REFERENCES public.employees(id) ON DELETE CASCADE,
    emp_name    TEXT        NOT NULL,
    date_str    DATE        NOT NULL,
    days        NUMERIC     DEFAULT 1,
    reason      TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 6. PUBLIC HOLIDAYS TABLE
CREATE TABLE IF NOT EXISTS public.public_holidays (
    id       SERIAL PRIMARY KEY,
    date_str DATE   UNIQUE NOT NULL,
    name     TEXT   NOT NULL
);

-- 7. SYSTEM CONFIG TABLE (key-value settings)
CREATE TABLE IF NOT EXISTS public.system_config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- ============================================================
--  SEED DATA
-- ============================================================

-- Default system configuration
INSERT INTO public.system_config (key, value) VALUES
    ('sandwich_rule',              'true'),
    ('pl_accrual_days_worked_rate','20'),
    ('cl_sl_total_per_year',       '14'),
    ('max_carry_forward',          '30'),
    ('multi_level_approval',       'true'),
    ('auto_approve_sick_leave',    'true'),
    ('allow_comp_leave',           'true'),
    ('active_leave_year',          '2026'),
    ('system_date',                '2026-03-28')
ON CONFLICT (key) DO NOTHING;

-- Default public holidays
INSERT INTO public.public_holidays (date_str, name) VALUES
    ('2026-03-03', 'Holi'),
    ('2026-03-19', 'Gudi Padwa'),
    ('2026-04-03', 'Good Friday'),
    ('2026-08-15', 'Independence Day'),
    ('2026-10-02', 'Gandhi Jayanti'),
    ('2026-12-25', 'Christmas')
ON CONFLICT (date_str) DO NOTHING;

-- Sample employees
INSERT INTO public.employees (name, role, pl_brought_forward, pl_used, cl_sl_used, comp_total, comp_used) VALUES
    ('Alice Johnson',   'Engineering', 8,  2, 3, 1, 0),
    ('Bob Smith',       'Design',      5,  1, 2, 0, 0),
    ('Charlie Davis',   'Engineering', 3,  0, 1, 2, 1),
    ('Diana Prince',    'HR',          10, 4, 5, 0, 0),
    ('Evan Wright',     'Marketing',   6,  3, 2, 1, 0),
    ('Fiona Gallagher', 'Sales',       4,  2, 4, 0, 0),
    ('George Miller',   'Product',     7,  1, 3, 3, 2),
    ('Hannah Abbott',   'Engineering', 2,  0, 6, 1, 0)
ON CONFLICT DO NOTHING;

-- ============================================================
--  ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approved_leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comp_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_config  ENABLE ROW LEVEL SECURITY;

-- Allow full access via anon key (app handles its own auth)
CREATE POLICY "anon_all_users"           ON public.users           FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_employees"       ON public.employees       FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_leave_requests"  ON public.leave_requests  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_approved_leaves" ON public.approved_leaves FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_comp_requests"   ON public.comp_requests   FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_holidays"        ON public.public_holidays  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_system_config"   ON public.system_config   FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============================================================
--  AUTO-UPDATE updated_at trigger for users
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
