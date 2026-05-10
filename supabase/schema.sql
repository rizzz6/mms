-- 1. Create Enums
CREATE TYPE user_role AS ENUM ('manager', 'member');
CREATE TYPE meal_type AS ENUM ('lunch', 'dinner');
CREATE TYPE meal_status AS ENUM ('eating', 'off');
CREATE TYPE transaction_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE duty_type AS ENUM ('bazar', 'water');
CREATE TYPE member_status AS ENUM ('pending', 'approved', 'rejected');

-- 2. Create Tables
CREATE TABLE messes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    join_code TEXT UNIQUE NOT NULL,
    manager_id UUID NOT NULL,
    upi_id TEXT,
    qr_code_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    mess_id UUID REFERENCES messes(id) ON DELETE SET NULL,
    full_name TEXT,
    role user_role NOT NULL DEFAULT 'member',
    status member_status NOT NULL DEFAULT 'pending',
    balance NUMERIC NOT NULL DEFAULT 0,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE meals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mess_id UUID NOT NULL REFERENCES messes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    type meal_type NOT NULL,
    status meal_status NOT NULL,
    is_guest BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE bazar_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mess_id UUID NOT NULL REFERENCES messes(id) ON DELETE CASCADE,
    shopper_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL,
    items TEXT NOT NULL,
    date DATE NOT NULL,
    verified BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mess_id UUID NOT NULL REFERENCES messes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL,
    proof_url TEXT,
    txn_id TEXT,
    status transaction_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE duty_roster (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mess_id UUID NOT NULL REFERENCES messes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    duty_type duty_type NOT NULL,
    is_skipped BOOLEAN NOT NULL DEFAULT false,
    is_cancelled BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE mess_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mess_id UUID NOT NULL REFERENCES messes(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    UNIQUE(mess_id, key)
);

CREATE TABLE duty_roster_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mess_id UUID NOT NULL REFERENCES messes(id) ON DELETE CASCADE,
    roster_id UUID REFERENCES duty_roster(id) ON DELETE CASCADE,
    changed_by UUID NOT NULL REFERENCES profiles(id),
    action TEXT NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Enable RLS
ALTER TABLE messes ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE bazar_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE duty_roster ENABLE ROW LEVEL SECURITY;
ALTER TABLE mess_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE duty_roster_logs ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies (Multi-tenant)

-- Messes: Viewable if you are a member or manager of it.
CREATE POLICY "Messes viewable by members" ON messes FOR SELECT USING (id IN (SELECT mess_id FROM profiles WHERE id = auth.uid()));

-- Profiles: Viewable by others in the same mess.
CREATE POLICY "Profiles viewable by same mess" ON profiles FOR SELECT USING (mess_id IN (SELECT mess_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Manager can update mess members" ON profiles FOR UPDATE USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'manager' AND mess_id IN (SELECT mess_id FROM profiles WHERE id = auth.uid())
);

-- Meals, Bazar, Transactions, Roster, Config, Logs: Filter by mess_id
CREATE POLICY "Mess meals viewable by members" ON meals FOR SELECT USING (mess_id IN (SELECT mess_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Mess bazar viewable by members" ON bazar_logs FOR SELECT USING (mess_id IN (SELECT mess_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Mess transactions viewable by members" ON transactions FOR SELECT USING (mess_id IN (SELECT mess_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Mess roster viewable by members" ON duty_roster FOR SELECT USING (mess_id IN (SELECT mess_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Mess config viewable by members" ON mess_config FOR SELECT USING (mess_id IN (SELECT mess_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Mess logs viewable by members" ON duty_roster_logs FOR SELECT USING (mess_id IN (SELECT mess_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Users insert own duty logs" ON duty_roster_logs FOR INSERT WITH CHECK (
    mess_id IN (SELECT mess_id FROM profiles WHERE id = auth.uid()) 
    AND auth.uid() = changed_by
);
CREATE POLICY "Manager manage all logs" ON duty_roster_logs FOR ALL USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'manager'
) WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'manager'
);

-- Insert/Update permissions
CREATE POLICY "Users manage own meals" ON meals FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users insert own bazar" ON bazar_logs FOR INSERT WITH CHECK (auth.uid() = shopper_id);
CREATE POLICY "Manager verify bazar" ON bazar_logs FOR UPDATE USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'manager');

CREATE POLICY "Users manage own transactions" ON transactions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Manager verify transactions" ON transactions FOR UPDATE USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'manager');

CREATE POLICY "Users manage own duty" ON duty_roster FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Manager manage all duty" ON duty_roster FOR ALL USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'manager');

CREATE POLICY "Manager manage config" ON mess_config FOR ALL USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'manager');

-- 5. Authentication Logic: Simple profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 6. Storage Policies
CREATE POLICY "Mess storage access" ON storage.objects FOR ALL USING (bucket_id = 'payments' AND (SELECT mess_id FROM profiles WHERE id = auth.uid()) IS NOT NULL);

-- 7. Constraints
ALTER TABLE meals ADD CONSTRAINT meals_user_date_type_unique UNIQUE (user_id, date, type);
ALTER TABLE duty_roster ADD CONSTRAINT duty_roster_user_date_type_unique UNIQUE (user_id, date, duty_type);

-- 8. Manager Handover RPC (Mess-aware)
CREATE OR REPLACE FUNCTION public.transfer_manager_role(new_manager_id UUID)
RETURNS void AS $$
DECLARE
    target_mess_id UUID;
BEGIN
  -- Get current manager's mess
  SELECT mess_id INTO target_mess_id FROM public.profiles WHERE id = auth.uid() AND role = 'manager';
  
  IF target_mess_id IS NULL THEN
    RAISE EXCEPTION 'Only an active manager can transfer the role.';
  END IF;

  -- Validate: new manager must be in the same mess and approved
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = new_manager_id AND mess_id = target_mess_id AND status = 'approved') THEN
    RAISE EXCEPTION 'Selected user is not an approved member of this mess.';
  END IF;

  -- Demote current manager
  UPDATE public.profiles SET role = 'member' WHERE id = auth.uid();
  -- Promote new manager
  UPDATE public.profiles SET role = 'manager' WHERE id = new_manager_id;
  -- Update messes table
  UPDATE public.messes SET manager_id = new_manager_id WHERE id = target_mess_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
