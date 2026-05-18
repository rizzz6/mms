-- 1. Create announcements table
CREATE TABLE IF NOT EXISTS public.announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mess_id UUID NOT NULL REFERENCES public.messes(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    pinned BOOLEAN NOT NULL DEFAULT false,
    created_by UUID NOT NULL REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create daily_menus table
CREATE TABLE IF NOT EXISTS public.daily_menus (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mess_id UUID NOT NULL REFERENCES public.messes(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    lunch_menu TEXT,
    dinner_menu TEXT,
    created_by UUID NOT NULL REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(mess_id, date)
);

-- 3. Create polls table
CREATE TABLE IF NOT EXISTS public.polls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mess_id UUID NOT NULL REFERENCES public.messes(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    is_closed BOOLEAN NOT NULL DEFAULT false,
    expires_at TIMESTAMPTZ,
    created_by UUID NOT NULL REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Create poll_options table
CREATE TABLE IF NOT EXISTS public.poll_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
    option_text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Create poll_votes table
CREATE TABLE IF NOT EXISTS public.poll_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
    option_id UUID NOT NULL REFERENCES public.poll_options(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(poll_id, user_id)
);

-- 6. Enable RLS
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;

-- 7. Drop existing policies if they exist to avoid duplication errors
DROP POLICY IF EXISTS "Announcements viewable by same mess" ON public.announcements;
DROP POLICY IF EXISTS "Managers manage announcements" ON public.announcements;
DROP POLICY IF EXISTS "Menus viewable by same mess" ON public.daily_menus;
DROP POLICY IF EXISTS "Managers manage menus" ON public.daily_menus;
DROP POLICY IF EXISTS "Polls viewable by same mess" ON public.polls;
DROP POLICY IF EXISTS "Managers manage polls" ON public.polls;
DROP POLICY IF EXISTS "Poll options viewable by same mess" ON public.poll_options;
DROP POLICY IF EXISTS "Managers manage options" ON public.poll_options;
DROP POLICY IF EXISTS "Votes viewable by same mess" ON public.poll_votes;
DROP POLICY IF EXISTS "Users manage own votes" ON public.poll_votes;

-- 8. Create RLS Policies
-- Announcements
CREATE POLICY "Announcements viewable by same mess" ON public.announcements
    FOR SELECT USING (mess_id IN (SELECT mess_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Managers manage announcements" ON public.announcements
    FOR ALL USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'manager'
        AND mess_id IN (SELECT mess_id FROM public.profiles WHERE id = auth.uid())
    );

-- Daily Menus
CREATE POLICY "Menus viewable by same mess" ON public.daily_menus
    FOR SELECT USING (mess_id IN (SELECT mess_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Managers manage menus" ON public.daily_menus
    FOR ALL USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'manager'
        AND mess_id IN (SELECT mess_id FROM public.profiles WHERE id = auth.uid())
    );

-- Polls & Options
CREATE POLICY "Polls viewable by same mess" ON public.polls
    FOR SELECT USING (mess_id IN (SELECT mess_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Managers manage polls" ON public.polls
    FOR ALL USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'manager'
        AND mess_id IN (SELECT mess_id FROM public.profiles WHERE id = auth.uid())
    );

CREATE POLICY "Poll options viewable by same mess" ON public.poll_options
    FOR SELECT USING (
        poll_id IN (SELECT id FROM public.polls WHERE mess_id IN (SELECT mess_id FROM public.profiles WHERE id = auth.uid()))
    );

CREATE POLICY "Managers manage options" ON public.poll_options
    FOR ALL USING (
        poll_id IN (
            SELECT id FROM public.polls 
            WHERE (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'manager'
            AND mess_id IN (SELECT mess_id FROM public.profiles WHERE id = auth.uid())
        )
    );

-- Poll Votes
CREATE POLICY "Votes viewable by same mess" ON public.poll_votes
    FOR SELECT USING (
        poll_id IN (SELECT id FROM public.polls WHERE mess_id IN (SELECT mess_id FROM public.profiles WHERE id = auth.uid()))
    );

CREATE POLICY "Users manage own votes" ON public.poll_votes
    FOR ALL USING (user_id = auth.uid())
    WITH CHECK (
        user_id = auth.uid()
        AND poll_id IN (
            SELECT id FROM public.polls 
            WHERE is_closed = false 
            AND (expires_at IS NULL OR expires_at > now())
            AND mess_id IN (SELECT mess_id FROM public.profiles WHERE id = auth.uid())
        )
    );
