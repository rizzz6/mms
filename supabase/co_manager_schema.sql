-- 1. Add co_manager to user_role enum
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'co_manager';

-- 2. Drop existing RLS policies that check for 'manager'
DROP POLICY IF EXISTS "Manager can update mess members" ON public.profiles;
DROP POLICY IF EXISTS "Manager manage all logs" ON public.duty_roster_logs;
DROP POLICY IF EXISTS "Manager verify bazar" ON public.bazar_logs;
DROP POLICY IF EXISTS "Manager verify transactions" ON public.transactions;
DROP POLICY IF EXISTS "Manager manage all duty" ON public.duty_roster;
DROP POLICY IF EXISTS "Managers can manage penalties" ON public.penalties;
DROP POLICY IF EXISTS "Managers manage announcements" ON public.announcements;
DROP POLICY IF EXISTS "Managers manage menus" ON public.daily_menus;
DROP POLICY IF EXISTS "Managers manage polls" ON public.polls;
DROP POLICY IF EXISTS "Managers manage options" ON public.poll_options;

-- 3. Re-create RLS Policies to support both manager & co_manager roles

-- Profiles: Manager & Co-manager can approve pending members
CREATE POLICY "Manager can update mess members" ON public.profiles 
    FOR UPDATE USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('manager', 'co_manager')
        AND mess_id IN (SELECT mess_id FROM public.profiles WHERE id = auth.uid())
    );

-- Roster Logs: Manager & Co-manager can log duty audits
CREATE POLICY "Manager manage all logs" ON public.duty_roster_logs 
    FOR ALL USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('manager', 'co_manager')
    ) WITH CHECK (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('manager', 'co_manager')
    );

-- Bazar Logs: Manager & Co-manager can verify grocery bills
CREATE POLICY "Manager verify bazar" ON public.bazar_logs 
    FOR UPDATE USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('manager', 'co_manager')
    );

-- Transactions: Manager & Co-manager can verify deposit requests
CREATE POLICY "Manager verify transactions" ON public.transactions 
    FOR UPDATE USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('manager', 'co_manager')
    );

-- Roster: Manager & Co-manager can regenerate or modify rosters
CREATE POLICY "Manager manage all duty" ON public.duty_roster 
    FOR ALL USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('manager', 'co_manager')
    );

-- Penalties: Manager & Co-manager can issue or waive fines
CREATE POLICY "Managers can manage penalties" ON public.penalties
    FOR ALL USING (
        mess_id IN (
            SELECT mess_id FROM public.profiles 
            WHERE id = auth.uid() AND role IN ('manager', 'co_manager')
        )
    );

-- Announcements: Manager & Co-manager can manage notice board posts
CREATE POLICY "Managers manage announcements" ON public.announcements
    FOR ALL USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('manager', 'co_manager')
        AND mess_id IN (SELECT mess_id FROM public.profiles WHERE id = auth.uid())
    );

-- Daily Menus: Manager & Co-manager can edit meal menus
CREATE POLICY "Managers manage menus" ON public.daily_menus
    FOR ALL USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('manager', 'co_manager')
        AND mess_id IN (SELECT mess_id FROM public.profiles WHERE id = auth.uid())
    );

-- Polls: Manager & Co-manager can launch or close engagement polls
CREATE POLICY "Managers manage polls" ON public.polls
    FOR ALL USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('manager', 'co_manager')
        AND mess_id IN (SELECT mess_id FROM public.profiles WHERE id = auth.uid())
    );

-- Poll Options: Manager & Co-manager can manage choices
CREATE POLICY "Managers manage options" ON public.poll_options
    FOR ALL USING (
        poll_id IN (
            SELECT id FROM public.polls 
            WHERE (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('manager', 'co_manager')
            AND mess_id IN (SELECT mess_id FROM public.profiles WHERE id = auth.uid())
        )
    );
