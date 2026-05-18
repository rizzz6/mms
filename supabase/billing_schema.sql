-- 1. Create billing_cycles table
CREATE TABLE IF NOT EXISTS public.billing_cycles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mess_id UUID NOT NULL REFERENCES public.messes(id) ON DELETE CASCADE,
    billing_month DATE NOT NULL,
    total_expense NUMERIC NOT NULL,
    total_member_meals INTEGER NOT NULL,
    total_guest_meals INTEGER NOT NULL,
    guest_meal_rate NUMERIC NOT NULL DEFAULT 60,
    meal_rate NUMERIC(10, 2) NOT NULL,
    closed_by UUID NOT NULL REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(mess_id, billing_month)
);

-- 2. Create monthly_bills table
CREATE TABLE IF NOT EXISTS public.monthly_bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    billing_cycle_id UUID NOT NULL REFERENCES public.billing_cycles(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    meals_eaten INTEGER NOT NULL,
    bill_amount NUMERIC(10, 2) NOT NULL,
    balance_before NUMERIC NOT NULL,
    balance_after NUMERIC NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(billing_cycle_id, user_id)
);

-- 3. Enable RLS
ALTER TABLE public.billing_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_bills ENABLE ROW LEVEL SECURITY;

-- 4. Drop existing policies if they exist to avoid duplication errors
DROP POLICY IF EXISTS "Billing cycles viewable by mess members" ON public.billing_cycles;
DROP POLICY IF EXISTS "Managers can insert billing cycles" ON public.billing_cycles;
DROP POLICY IF EXISTS "Monthly bills viewable by own user or mess manager" ON public.monthly_bills;
DROP POLICY IF EXISTS "Managers can insert monthly bills" ON public.monthly_bills;

-- 5. Create RLS Policies
CREATE POLICY "Billing cycles viewable by mess members" ON public.billing_cycles
    FOR SELECT USING (mess_id IN (SELECT mess_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Managers can insert billing cycles" ON public.billing_cycles
    FOR INSERT WITH CHECK (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'manager'
        AND mess_id IN (SELECT mess_id FROM public.profiles WHERE id = auth.uid())
    );

CREATE POLICY "Monthly bills viewable by own user or mess manager" ON public.monthly_bills
    FOR SELECT USING (
        user_id = auth.uid()
        OR (
            (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'manager'
            AND user_id IN (SELECT id FROM public.profiles WHERE mess_id IN (SELECT mess_id FROM public.profiles WHERE id = auth.uid()))
        )
    );

CREATE POLICY "Managers can insert monthly bills" ON public.monthly_bills
    FOR INSERT WITH CHECK (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'manager'
    );

-- 6. Atomic RPC Function to Close Month
CREATE OR REPLACE FUNCTION public.close_billing_cycle(
    p_mess_id UUID,
    p_month DATE,
    p_total_expense NUMERIC,
    p_total_member_meals INT,
    p_total_guest_meals INT,
    p_guest_meal_rate NUMERIC,
    p_meal_rate NUMERIC,
    p_closed_by UUID,
    p_member_bills JSONB -- array of objects: {user_id: "...", meals_eaten: 12, bill_amount: 120.50}
) RETURNS VOID AS $$
DECLARE
    v_billing_cycle_id UUID;
    v_bill RECORD;
BEGIN
    -- 1. Insert billing cycle
    INSERT INTO public.billing_cycles (
        mess_id, billing_month, total_expense, total_member_meals, total_guest_meals, guest_meal_rate, meal_rate, closed_by
    ) VALUES (
        p_mess_id, p_month, p_total_expense, p_total_member_meals, p_total_guest_meals, p_guest_meal_rate, p_meal_rate, p_closed_by
    ) RETURNING id INTO v_billing_cycle_id;

    -- 2. Process each member bill
    FOR v_bill IN SELECT * FROM jsonb_to_recordset(p_member_bills) AS x(user_id UUID, meals_eaten INT, bill_amount NUMERIC)
    LOOP
        DECLARE
            v_balance_before NUMERIC;
            v_balance_after NUMERIC;
        BEGIN
            -- Get and lock current balance
            SELECT balance INTO v_balance_before FROM public.profiles WHERE id = v_bill.user_id FOR UPDATE;
            
            v_balance_after := v_balance_before - v_bill.bill_amount;

            -- Update profile balance
            UPDATE public.profiles SET balance = v_balance_after WHERE id = v_bill.user_id;

            -- Insert monthly bill archive
            INSERT INTO public.monthly_bills (
                billing_cycle_id, user_id, meals_eaten, bill_amount, balance_before, balance_after
            ) VALUES (
                v_billing_cycle_id, v_bill.user_id, v_bill.meals_eaten, v_bill.bill_amount, v_balance_before, v_balance_after
            );
        END;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
