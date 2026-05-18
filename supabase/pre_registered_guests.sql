-- 1. Drop the old constraint that blocked multiple guests per host
ALTER TABLE public.meals DROP CONSTRAINT IF EXISTS meals_user_date_type_unique;

-- 2. Create a partial unique index: A member can only have ONE personal meal log ('eating' or 'off') per day & type
CREATE UNIQUE INDEX IF NOT EXISTS meals_member_personal_unique ON public.meals (user_id, date, type) 
WHERE (is_guest = false);

-- 3. Add guest-specific columns to meals table
ALTER TABLE public.meals 
  ADD COLUMN IF NOT EXISTS guest_name TEXT,
  ADD COLUMN IF NOT EXISTS guest_type TEXT,
  ADD COLUMN IF NOT EXISTS guest_price NUMERIC(10, 2);

-- 4. Fill in any default values for existing guests
UPDATE public.meals 
SET guest_name = 'Guest' 
WHERE is_guest = true AND guest_name IS NULL;

-- 5. Drop existing policies if they duplicate
DROP POLICY IF EXISTS "Managers manage all meals" ON public.meals;

-- 6. Add policy to let managers & co-managers update/delete any meals in the mess
CREATE POLICY "Managers manage all meals" ON public.meals 
    FOR ALL USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('manager', 'co_manager')
    );
