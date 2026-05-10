-- 1. Create Enums
CREATE TYPE user_role AS ENUM ('manager', 'member');
CREATE TYPE meal_type AS ENUM ('lunch', 'dinner');
CREATE TYPE meal_status AS ENUM ('eating', 'off');
CREATE TYPE transaction_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE duty_type AS ENUM ('bazar', 'water');

-- 2. Create Tables
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    role user_role NOT NULL DEFAULT 'member',
    upi_id TEXT,
    qr_code_url TEXT,
    balance NUMERIC NOT NULL DEFAULT 0,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE meals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    type meal_type NOT NULL,
    status meal_status NOT NULL,
    is_guest BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE bazar_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shopper_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL,
    items TEXT NOT NULL,
    date DATE NOT NULL,
    verified BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL,
    proof_url TEXT,
    txn_id TEXT,
    status transaction_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE duty_roster (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    duty_type duty_type NOT NULL,
    is_skipped BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE bazar_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE duty_roster ENABLE ROW LEVEL SECURITY;

-- 4. Basic RLS Policies
-- Profiles: Everyone can read. Users can update their own profile (Manager can update any).
CREATE POLICY "Profiles are viewable by everyone." ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile." ON profiles FOR UPDATE USING (auth.uid() = id);

-- Meals: Everyone can read. Users manage their own meals. Manager manages all.
CREATE POLICY "Meals viewable by everyone." ON meals FOR SELECT USING (true);
CREATE POLICY "Users insert own meals." ON meals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own meals." ON meals FOR UPDATE USING (auth.uid() = user_id);

-- Transactions: Users can view/insert their own. Manager can view/update all.
CREATE POLICY "Users view own transactions." ON transactions FOR SELECT USING (auth.uid() = user_id OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'manager');
CREATE POLICY "Users insert own transactions." ON transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Manager can update transactions." ON transactions FOR UPDATE USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'manager');

-- 5. Authentication Logic: First Sign-up = Manager
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
DECLARE
  user_count INT;
BEGIN
  SELECT count(*) INTO user_count FROM public.profiles;
  
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    CASE WHEN user_count = 0 THEN 'manager'::user_role ELSE 'member'::user_role END
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Allow manager to upload files to the 'payments' bucket
CREATE POLICY "Managers can upload QR codes" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'payments' AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'manager');
CREATE POLICY "QR codes are publicly viewable" ON storage.objects FOR SELECT USING (bucket_id = 'payments');

-- Unique constraint for meal upserts
ALTER TABLE meals ADD CONSTRAINT meals_user_date_type_unique UNIQUE (user_id, date, type);

-- Allow authenticated members to upload payment proofs
CREATE POLICY "Members can upload payment proofs" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'payments' AND name LIKE 'proofs/%' AND auth.role() = 'authenticated');

-- Manager can update bazar_logs (verify entries)
CREATE POLICY "Manager can update bazar logs" ON bazar_logs FOR UPDATE USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'manager');
-- Manager can update any profile (to increment balance)
CREATE POLICY "Manager can update any profile" ON profiles FOR UPDATE USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'manager');

-- Phase 7: Duty Roster Logs and Policies
CREATE TABLE duty_roster_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    roster_id UUID REFERENCES duty_roster(id) ON DELETE CASCADE,
    changed_by UUID NOT NULL REFERENCES profiles(id),
    action TEXT NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE duty_roster_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Duty roster viewable by all" ON duty_roster FOR SELECT USING (true);
CREATE POLICY "Members can update own duty" ON duty_roster FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Manager can insert duty records" ON duty_roster FOR INSERT WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'manager');

CREATE POLICY "Manager can view duty logs" ON duty_roster_logs FOR SELECT USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'manager');
CREATE POLICY "Authenticated users can insert duty logs" ON duty_roster_logs FOR INSERT WITH CHECK (auth.uid() = changed_by);

ALTER TABLE duty_roster ADD CONSTRAINT duty_roster_user_date_type_unique UNIQUE (user_id, date, duty_type);

-- Phase 8: Bazar Log Policies
CREATE POLICY "Members can insert own bazar logs" ON bazar_logs FOR INSERT WITH CHECK (auth.uid() = shopper_id);
CREATE POLICY "Bazar logs viewable by all" ON bazar_logs FOR SELECT USING (true);

-- Phase 9: Mess Configuration
CREATE TABLE mess_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT
);

ALTER TABLE mess_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Config readable by all" ON mess_config FOR SELECT USING (true);
CREATE POLICY "Manager can update config" ON mess_config FOR UPDATE USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'manager');

INSERT INTO mess_config (key, value, description) VALUES
  ('guest_meal_rate', '60', 'Fixed charge per guest meal in INR'),
  ('mess_start_date', '2024-01-01', 'Date from which meal rate calculation begins');

-- Phase 10: Manager Handover RPC
CREATE OR REPLACE FUNCTION public.transfer_manager_role(new_manager_id UUID)
RETURNS void AS 
BEGIN
  -- Validate: new manager must be a member
  IF (SELECT role FROM public.profiles WHERE id = new_manager_id) <> 'member' THEN
    RAISE EXCEPTION 'Selected user is not an active member.';
  END IF;

  -- Validate: caller must be the current manager
  IF (SELECT role FROM public.profiles WHERE id = auth.uid()) <> 'manager' THEN
    RAISE EXCEPTION 'Only the current manager can transfer the role.';
  END IF;

  -- Demote current manager to member
  UPDATE public.profiles
  SET role = 'member'
  WHERE id = auth.uid();

  -- Promote new user to manager
  UPDATE public.profiles
  SET role = 'manager'
  WHERE id = new_manager_id;
END;
 LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public;
