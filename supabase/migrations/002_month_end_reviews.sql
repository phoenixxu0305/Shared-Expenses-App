-- Month-end surplus reviews
CREATE TABLE month_end_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  month_key TEXT NOT NULL,          -- e.g. '2026-01'
  month_label TEXT NOT NULL,        -- e.g. 'January 2026'
  surplus_amount NUMERIC NOT NULL DEFAULT 0,
  decision TEXT NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending', 'carry_over', 'save')),
  decided_by UUID REFERENCES profiles(id),
  decided_at TIMESTAMPTZ,
  applied_to_week_id UUID REFERENCES weeks(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(team_id, month_key)
);

-- RLS
ALTER TABLE month_end_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view month end reviews"
  ON month_end_reviews FOR SELECT
  USING (team_id IN (SELECT get_user_team_ids()));

CREATE POLICY "Admins can insert month end reviews"
  ON month_end_reviews FOR INSERT
  WITH CHECK (team_id IN (SELECT get_user_team_ids()));

CREATE POLICY "Admins can update month end reviews"
  ON month_end_reviews FOR UPDATE
  USING (team_id IN (SELECT get_user_team_ids()) AND EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));
