export type UserRole = 'admin' | 'treasurer' | 'volunteer';
export type ExpenseType = 'personal' | 'team';
export type InviteStatus = 'pending' | 'approved' | 'denied';
export type InviteRole = 'treasurer' | 'volunteer';
export type DistributionType = 'group' | 'personal' | 'split';

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  created_at: string;
}

export interface Team {
  id: string;
  name: string;
  background_color: string | null;
  background_image_url: string | null;
  created_by: string;
  created_at: string;
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role: UserRole;
  joined_at: string;
}

export interface Week {
  id: string;
  team_id: string;
  label: string;
  start_date: string;
  end_date: string;
  total_kitty: number;
  allocation_per_volunteer: number;
  pooled_split_enabled: boolean;
  pooled_percentage: number;
  created_at: string;
}

export interface Expense {
  id: string;
  team_id: string;
  week_id: string;
  user_id: string;
  target_user_id: string | null;
  amount: number;
  description: string;
  receipt_url: string | null;
  type: ExpenseType;
  is_deleted: boolean;
  created_at: string;
}

export interface InviteRequest {
  id: string;
  email: string;
  note: string | null;
  status: InviteStatus;
  assigned_role: InviteRole | null;
  assigned_team_id: string | null;
  reviewed_by: string | null;
  created_at: string;
}

export interface FundAddition {
  id: string;
  team_id: string;
  week_id: string;
  amount: number;
  distribution_type: DistributionType;
  split_percentage: number | null;
  description: string;
  added_by: string;
  created_at: string;
}

// Extended types with joins
export interface TeamMemberWithProfile extends TeamMember {
  profiles: Profile;
}

export interface ExpenseWithUser extends Expense {
  profiles: Profile;
  target_user: Profile | null;
}
