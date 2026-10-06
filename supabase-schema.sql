-- ==============================================================================
-- SplitEase Supabase Database Schema
-- Copy and paste this script into your Supabase SQL Editor and click RUN
-- ==============================================================================

-- 1. Create Groups Table
CREATE TABLE IF NOT EXISTS public.groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT 'My Group',
    currency TEXT NOT NULL DEFAULT '₹',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create Members Table
CREATE TABLE IF NOT EXISTS public.members (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#3b82f6',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Create Expenses Table
CREATE TABLE IF NOT EXISTS public.expenses (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    category TEXT DEFAULT 'Other',
    paid_by TEXT NOT NULL,
    date DATE DEFAULT CURRENT_DATE,
    split_mode TEXT DEFAULT 'EQUAL',
    splits JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_settlement BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- 5. Create Permissive Policies (Allows friends with the group ID to read/insert/update)
DROP POLICY IF EXISTS "Public access to groups" ON public.groups;
CREATE POLICY "Public access to groups" ON public.groups FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access to members" ON public.members;
CREATE POLICY "Public access to members" ON public.members FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access to expenses" ON public.expenses;
CREATE POLICY "Public access to expenses" ON public.expenses FOR ALL USING (true) WITH CHECK (true);

-- 6. Enable Realtime Broadcast for instant updates across devices
ALTER PUBLICATION supabase_realtime ADD TABLE public.groups;
ALTER PUBLICATION supabase_realtime ADD TABLE public.members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses;

-- Done! Your database is now ready for real-time group expense splitting.
