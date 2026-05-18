-- 1. Create penalty reason enum
DO $$ BEGIN
    CREATE TYPE penalty_reason AS ENUM ('skipped_duty', 'low_balance', 'custom');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create penalties table
CREATE TABLE IF NOT EXISTS public.penalties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mess_id UUID NOT NULL REFERENCES public.messes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL,
    reason penalty_reason NOT NULL,
    description TEXT,
    issued_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Enable RLS
ALTER TABLE public.penalties ENABLE ROW LEVEL SECURITY;

-- 4. Drop existing policies if they exist
DROP POLICY IF EXISTS "Penalties viewable by same mess" ON public.penalties;
DROP POLICY IF EXISTS "Managers can manage penalties" ON public.penalties;

-- 5. Create RLS Policies
CREATE POLICY "Penalties viewable by same mess" ON public.penalties
    FOR SELECT USING (
        mess_id IN (SELECT mess_id FROM public.profiles WHERE id = auth.uid())
    );

CREATE POLICY "Managers can manage penalties" ON public.penalties
    FOR ALL USING (
        mess_id IN (SELECT mess_id FROM public.profiles WHERE id = auth.uid() AND role = 'manager')
    );
