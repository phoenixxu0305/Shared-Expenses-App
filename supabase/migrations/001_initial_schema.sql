-- Enums
CREATE TYPE user_role AS ENUM ('admin', 'treasurer', 'volunteer');
CREATE TYPE expense_type AS ENUM ('personal', 'team');
CREATE TYPE invite_status AS ENUM ('pending', 'approved', 'denied');
CREATE TYPE invite_role AS ENUM ('treasurer', 'volunteer');
CREATE TYPE distribution_type AS ENUM ('group', 'personal', 'split');

-- Profiles (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  role user_role NOT NULL DEFAULT 'volunteer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Teams
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  background_color TEXT,
  background_image_url TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Team members (join table)
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'volunteer',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id)
);

-- Weeks (budget periods)
CREATE TABLE weeks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_kitty NUMERIC NOT NULL DEFAULT 0,
  allocation_per_volunteer NUMERIC NOT NULL DEFAULT 100,
  pooled_split_enabled BOOLEAN NOT NULL DEFAULT false,
  pooled_percentage INTEGER NOT NULL DEFAULT 80,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Expenses
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  week_id UUID NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  target_user_id UUID REFERENCES profiles(id),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  description TEXT NOT NULL,
  receipt_url TEXT,
  type expense_type NOT NULL DEFAULT 'personal',
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Invite requests
CREATE TABLE invite_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  note TEXT,
  status invite_status NOT NULL DEFAULT 'pending',
  assigned_role invite_role,
  assigned_team_id UUID REFERENCES teams(id),
  reviewed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fund additions
CREATE TABLE fund_additions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  week_id UUID NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  distribution_type distribution_type NOT NULL,
  split_percentage INTEGER,
  description TEXT NOT NULL,
  added_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create profile on signup and auto-join assigned team
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  invite_record RECORD;
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'avatar_url',
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'volunteer')
  );

  -- Auto-join team if there's an approved invite with an assigned team
  SELECT * INTO invite_record
  FROM public.invite_requests
  WHERE email = NEW.email
    AND status = 'approved'
    AND assigned_team_id IS NOT NULL
  LIMIT 1;

  IF invite_record IS NOT NULL THEN
    INSERT INTO public.team_members (team_id, user_id, role)
    VALUES (
      invite_record.assigned_team_id,
      NEW.id,
      COALESCE(invite_record.assigned_role::user_role, 'volunteer')
    );

    UPDATE public.profiles
    SET role = COALESCE(invite_record.assigned_role::user_role, 'volunteer')
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Helper function to get user's team IDs without triggering RLS recursion
CREATE OR REPLACE FUNCTION get_user_team_ids()
RETURNS SETOF UUID AS $$
  SELECT team_id FROM team_members WHERE user_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE fund_additions ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can view team member profiles"
  ON profiles FOR SELECT
  USING (id IN (
    SELECT user_id FROM team_members WHERE team_id IN (SELECT get_user_team_ids())
  ));

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Teams policies
CREATE POLICY "Team members can view their teams"
  ON teams FOR SELECT
  USING (id IN (SELECT get_user_team_ids()));

CREATE POLICY "Admins can create teams"
  ON teams FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update their teams"
  ON teams FOR UPDATE
  USING (id IN (SELECT get_user_team_ids()) AND EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

-- Team members policies
CREATE POLICY "Team members can view members"
  ON team_members FOR SELECT
  USING (team_id IN (SELECT get_user_team_ids()));

CREATE POLICY "Admins can insert team members"
  ON team_members FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update team members"
  ON team_members FOR UPDATE
  USING (team_id IN (SELECT get_user_team_ids()) AND EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "Admins can delete team members"
  ON team_members FOR DELETE
  USING (team_id IN (SELECT get_user_team_ids()) AND EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

-- Weeks policies
CREATE POLICY "Team members can view weeks"
  ON weeks FOR SELECT
  USING (team_id IN (SELECT get_user_team_ids()));

CREATE POLICY "Admins can insert weeks"
  ON weeks FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update weeks"
  ON weeks FOR UPDATE
  USING (team_id IN (SELECT get_user_team_ids()) AND EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "Admins can delete weeks"
  ON weeks FOR DELETE
  USING (team_id IN (SELECT get_user_team_ids()) AND EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

-- Expenses policies
CREATE POLICY "Team members can view expenses"
  ON expenses FOR SELECT
  USING (team_id IN (SELECT get_user_team_ids()));

CREATE POLICY "Team members can create expenses"
  ON expenses FOR INSERT
  WITH CHECK (team_id IN (SELECT get_user_team_ids()));

CREATE POLICY "Users can soft-delete own expenses"
  ON expenses FOR UPDATE
  USING (user_id = auth.uid() OR (
    team_id IN (SELECT get_user_team_ids()) AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'treasurer')
    )
  ));

-- Invite requests policies
CREATE POLICY "Admins can view invite requests"
  ON invite_requests FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Anyone can create invite requests"
  ON invite_requests FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can update invite requests"
  ON invite_requests FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Fund additions policies
CREATE POLICY "Team members can view fund additions"
  ON fund_additions FOR SELECT
  USING (team_id IN (SELECT get_user_team_ids()));

CREATE POLICY "Admins can add funds"
  ON fund_additions FOR INSERT
  WITH CHECK (team_id IN (SELECT get_user_team_ids()) AND EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));
