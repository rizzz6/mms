-- ============================================================================
-- AUDIT LOGGING SYSTEM FOR MANAGER ACTIONS
-- ============================================================================

-- 1. Create the audit logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mess_id UUID NOT NULL REFERENCES public.messes(id) ON DELETE CASCADE,
    manager_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, -- Actor
    action_type TEXT NOT NULL, -- 'payment_approved', 'payment_rejected', 'meal_override_insert', 'meal_override_update', 'meal_override_delete', 'setting_changed'
    target_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- Affected user (if applicable)
    old_data JSONB, -- Previous state for reverts
    new_data JSONB, -- New state for reverts
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexing for performance and log cleanup
CREATE INDEX IF NOT EXISTS idx_audit_logs_mess_created ON public.audit_logs(mess_id, created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Audit logs viewable by members of same mess" ON public.audit_logs;

-- Policy: Members of the mess can read audit logs for transparency and auditability
CREATE POLICY "Audit logs viewable by members of same mess" ON public.audit_logs
    FOR SELECT USING (mess_id IN (
        SELECT mess_id FROM public.profiles WHERE id = auth.uid()
    ));

-- ============================================================================
-- 2. TRIGGER: Automated Transaction (Payment) Approval/Rejection Logging
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_transaction_audit()
RETURNS TRIGGER AS $$
DECLARE
    current_user_role user_role;
    acting_user_id UUID;
BEGIN
    acting_user_id := auth.uid();
    
    -- Only log if status has changed and the action was performed by an authenticated manager/co_manager
    IF (OLD.status IS DISTINCT FROM NEW.status) AND (acting_user_id IS NOT NULL) THEN
        SELECT role INTO current_user_role FROM public.profiles WHERE id = acting_user_id;
        
        IF current_user_role IN ('manager', 'co_manager') THEN
            INSERT INTO public.audit_logs (
                mess_id,
                manager_id,
                action_type,
                target_user_id,
                old_data,
                new_data
            ) VALUES (
                NEW.mess_id,
                acting_user_id,
                CASE 
                    WHEN NEW.status = 'approved' THEN 'payment_approved'
                    WHEN NEW.status = 'rejected' THEN 'payment_rejected'
                    ELSE 'payment_status_changed'
                END,
                NEW.user_id,
                to_jsonb(OLD),
                to_jsonb(NEW)
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop old trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_log_transaction_audit ON public.transactions;
CREATE TRIGGER trigger_log_transaction_audit
    AFTER UPDATE ON public.transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.log_transaction_audit();

-- ============================================================================
-- 3. TRIGGER: Automated Meal Override Logging
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_meal_audit()
RETURNS TRIGGER AS $$
DECLARE
    current_user_role user_role;
    acting_user_id UUID;
    target_user_id UUID;
    target_mess_id UUID;
    action_type TEXT;
BEGIN
    acting_user_id := auth.uid();
    
    -- Pick values based on insert/update/delete operation
    IF TG_OP = 'DELETE' THEN
        target_user_id := OLD.user_id;
        target_mess_id := OLD.mess_id;
    ELSE
        target_user_id := NEW.user_id;
        target_mess_id := NEW.mess_id;
    END IF;

    -- Only log if a manager/co_manager is modifying someone else's meal
    IF acting_user_id IS NOT NULL AND acting_user_id != target_user_id THEN
        SELECT role INTO current_user_role FROM public.profiles WHERE id = acting_user_id;
        
        IF current_user_role IN ('manager', 'co_manager') THEN
            IF TG_OP = 'INSERT' THEN
                action_type := 'meal_override_insert';
            ELSIF TG_OP = 'UPDATE' THEN
                -- Only log if the status (eating / off) changed
                IF OLD.status IS DISTINCT FROM NEW.status THEN
                    action_type := 'meal_override_update';
                ELSE
                    RETURN NEW; -- Value didn't change, skip
                END IF;
            ELSIF TG_OP = 'DELETE' THEN
                action_type := 'meal_override_delete';
            END IF;

            INSERT INTO public.audit_logs (
                mess_id,
                manager_id,
                action_type,
                target_user_id,
                old_data,
                new_data
            ) VALUES (
                target_mess_id,
                acting_user_id,
                action_type,
                target_user_id,
                CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
                CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
            );
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop old trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_log_meal_audit ON public.meals;
CREATE TRIGGER trigger_log_meal_audit
    AFTER INSERT OR UPDATE OR DELETE ON public.meals
    FOR EACH ROW
    EXECUTE FUNCTION public.log_meal_audit();

-- ============================================================================
-- 4. TRIGGER: Automated Settings Change Logging
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_config_audit()
RETURNS TRIGGER AS $$
DECLARE
    current_user_role user_role;
    acting_user_id UUID;
    action_type TEXT;
BEGIN
    acting_user_id := auth.uid();
    
    -- Only log if setting changed by manager/co-manager
    IF acting_user_id IS NOT NULL THEN
        SELECT role INTO current_user_role FROM public.profiles WHERE id = acting_user_id;
        
        IF current_user_role IN ('manager', 'co_manager') THEN
            IF TG_OP = 'INSERT' THEN
                action_type := 'setting_changed';
            ELSIF TG_OP = 'UPDATE' THEN
                IF OLD.value IS DISTINCT FROM NEW.value THEN
                    action_type := 'setting_changed';
                ELSE
                    RETURN NEW; -- No change, skip
                END IF;
            END IF;

            INSERT INTO public.audit_logs (
                mess_id,
                manager_id,
                action_type,
                target_user_id,
                old_data,
                new_data
            ) VALUES (
                NEW.mess_id,
                acting_user_id,
                action_type,
                NULL,
                CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
                CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop old trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_log_config_audit ON public.mess_config;
CREATE TRIGGER trigger_log_config_audit
    AFTER INSERT OR UPDATE ON public.mess_config
    FOR EACH ROW
    EXECUTE FUNCTION public.log_config_audit();

-- ============================================================================
-- 5. TRIGGER: Log Retention and Automated Self-Cleanup
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs()
RETURNS TRIGGER AS $$
DECLARE
    retention_days INTEGER := 90; -- Default: 90 days retention
    retention_str TEXT;
BEGIN
    -- Check for 'audit_log_retention_days' in mess_config
    SELECT value INTO retention_str 
    FROM public.mess_config 
    WHERE mess_id = NEW.mess_id AND key = 'audit_log_retention_days';
    
    IF retention_str IS NOT NULL THEN
        BEGIN
            retention_days := retention_str::INTEGER;
        EXCEPTION WHEN OTHERS THEN
            retention_days := 90; -- Fail-safe fallback
        END;
    END IF;

    -- Clean up expired logs for this mess synchronously during insert (very fast with index)
    DELETE FROM public.audit_logs 
    WHERE mess_id = NEW.mess_id 
      AND created_at < (now() - (retention_days || ' days')::INTERVAL);
      
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop old trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_cleanup_old_audit_logs ON public.audit_logs;
CREATE TRIGGER trigger_cleanup_old_audit_logs
    AFTER INSERT ON public.audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION public.cleanup_old_audit_logs();

-- ============================================================================
-- 6. RPC FUNCTION: generic Revert Action System
-- ============================================================================

CREATE OR REPLACE FUNCTION public.revert_audit_log(log_id UUID)
RETURNS VOID AS $$
DECLARE
    log_rec RECORD;
    calling_user_role user_role;
    calling_user_mess_id UUID;
    old_meal_status meal_status;
    old_val TEXT;
BEGIN
    -- 1. Fetch audit log details
    SELECT * INTO log_rec FROM public.audit_logs WHERE id = log_id;
    IF log_rec IS NULL THEN
        RAISE EXCEPTION 'Audit log not found.';
    END IF;

    -- 2. Security validation: caller must be a manager/co-manager of the same mess
    SELECT role, mess_id INTO calling_user_role, calling_user_mess_id 
    FROM public.profiles 
    WHERE id = auth.uid();

    IF calling_user_role NOT IN ('manager', 'co_manager') OR calling_user_mess_id != log_rec.mess_id THEN
        RAISE EXCEPTION 'Unauthorized: Only a manager or co-manager of this mess can revert actions.';
    END IF;

    -- 3. Execute rollback logic based on action type
    CASE log_rec.action_type
        -- Revert Deposit/Payment Approval
        WHEN 'payment_approved' THEN
            IF NOT EXISTS (SELECT 1 FROM public.transactions WHERE id = (log_rec.new_data->>'id')::UUID AND status = 'approved') THEN
                RAISE EXCEPTION 'Cannot revert: Transaction status is no longer approved.';
            END IF;

            -- 1. Deduct balance back from user's account
            UPDATE public.profiles 
            SET balance = balance - (log_rec.new_data->>'amount')::NUMERIC 
            WHERE id = (log_rec.new_data->>'user_id')::UUID;

            -- 2. Set transaction status back to original (pending)
            UPDATE public.transactions 
            SET status = (log_rec.old_data->>'status')::transaction_status
            WHERE id = (log_rec.new_data->>'id')::UUID;

        -- Revert Deposit/Payment Rejection
        WHEN 'payment_rejected' THEN
            IF NOT EXISTS (SELECT 1 FROM public.transactions WHERE id = (log_rec.new_data->>'id')::UUID AND status = 'rejected') THEN
                RAISE EXCEPTION 'Cannot revert: Transaction status is no longer rejected.';
            END IF;

            -- Set transaction status back to original (pending)
            UPDATE public.transactions 
            SET status = (log_rec.old_data->>'status')::transaction_status
            WHERE id = (log_rec.new_data->>'id')::UUID;

        -- Revert Meal Override Insert (Delete the meal override)
        WHEN 'meal_override_insert' THEN
            DELETE FROM public.meals 
            WHERE user_id = (log_rec.new_data->>'user_id')::UUID 
              AND date = (log_rec.new_data->>'date')::DATE 
              AND type = (log_rec.new_data->>'type')::meal_type;

        -- Revert Meal Override Update (Restore the old meal status)
        WHEN 'meal_override_update' THEN
            old_meal_status := (log_rec.old_data->>'status')::meal_status;
            
            UPDATE public.meals 
            SET status = old_meal_status
            WHERE user_id = (log_rec.new_data->>'user_id')::UUID 
              AND date = (log_rec.new_data->>'date')::DATE 
              AND type = (log_rec.new_data->>'type')::meal_type;

        -- Revert Meal Override Delete (Re-insert the deleted meal)
        WHEN 'meal_override_delete' THEN
            INSERT INTO public.meals (
                id, mess_id, user_id, date, type, status, is_guest, guest_name, guest_price, guest_type, created_at
            ) VALUES (
                (log_rec.old_data->>'id')::UUID,
                (log_rec.old_data->>'mess_id')::UUID,
                (log_rec.old_data->>'user_id')::UUID,
                (log_rec.old_data->>'date')::DATE,
                (log_rec.old_data->>'type')::meal_type,
                (log_rec.old_data->>'status')::meal_status,
                (log_rec.old_data->>'is_guest')::BOOLEAN,
                log_rec.old_data->>'guest_name',
                (log_rec.old_data->>'guest_price')::NUMERIC,
                log_rec.old_data->>'guest_type',
                (log_rec.old_data->>'created_at')::TIMESTAMPTZ
            ) ON CONFLICT (user_id, date, type) DO UPDATE 
            SET status = EXCLUDED.status;

        -- Revert Configuration/Setting changes
        WHEN 'setting_changed' THEN
            old_val := log_rec.old_data->>'value';
            IF old_val IS NOT NULL THEN
                UPDATE public.mess_config 
                SET value = old_val 
                WHERE mess_id = log_rec.mess_id AND key = (log_rec.old_data->>'key');
            ELSE
                -- If it was a new insert, delete it on revert
                DELETE FROM public.mess_config 
                WHERE mess_id = log_rec.mess_id AND key = (log_rec.new_data->>'key');
            END IF;

        ELSE
            RAISE EXCEPTION 'Revert is not supported for action type: %', log_rec.action_type;
    END CASE;

    -- 4. Delete the audit log entry because the action has successfully been reverted
    DELETE FROM public.audit_logs WHERE id = log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
