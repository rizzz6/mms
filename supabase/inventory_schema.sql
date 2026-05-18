-- 1. Create inventory log type enum
DO $$ BEGIN
    CREATE TYPE inventory_log_type AS ENUM ('purchase', 'empty_reset');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create inventory_items table
CREATE TABLE IF NOT EXISTS public.inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mess_id UUID NOT NULL REFERENCES public.messes(id) ON DELETE CASCADE,
    item_name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Staple',
    current_stock NUMERIC NOT NULL DEFAULT 0,
    unit TEXT NOT NULL DEFAULT 'kg',
    low_stock_threshold NUMERIC NOT NULL DEFAULT 2,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(mess_id, item_name)
);

-- 3. Create inventory_logs table
CREATE TABLE IF NOT EXISTS public.inventory_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
    log_type inventory_log_type NOT NULL,
    quantity_changed NUMERIC NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    recorded_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE
);

-- 4. Enable RLS
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_logs ENABLE ROW LEVEL SECURITY;

-- 5. Drop existing policies if they exist to prevent errors
DROP POLICY IF EXISTS "Inventory viewable by same mess" ON public.inventory_items;
DROP POLICY IF EXISTS "Members can create or edit inventory items" ON public.inventory_items;
DROP POLICY IF EXISTS "Logs viewable by same mess" ON public.inventory_logs;
DROP POLICY IF EXISTS "Approved members can insert inventory logs" ON public.inventory_logs;

-- 6. Create RLS Policies
-- Inventory Items
CREATE POLICY "Inventory viewable by same mess" ON public.inventory_items
    FOR SELECT USING (mess_id IN (SELECT mess_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Members can create or edit inventory items" ON public.inventory_items
    FOR ALL USING (
        mess_id IN (SELECT mess_id FROM public.profiles WHERE id = auth.uid() AND status = 'approved')
    );

-- Inventory Logs
CREATE POLICY "Logs viewable by same mess" ON public.inventory_logs
    FOR SELECT USING (
        item_id IN (SELECT id FROM public.inventory_items WHERE mess_id IN (SELECT mess_id FROM public.profiles WHERE id = auth.uid()))
    );

CREATE POLICY "Approved members can insert inventory logs" ON public.inventory_logs
    FOR INSERT WITH CHECK (
        recorded_by = auth.uid()
        AND item_id IN (
            SELECT id FROM public.inventory_items 
            WHERE mess_id IN (SELECT mess_id FROM public.profiles WHERE id = auth.uid() AND status = 'approved')
        )
    );
