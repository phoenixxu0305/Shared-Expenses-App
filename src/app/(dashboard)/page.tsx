import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { TeamDashboard } from '@/components/team-dashboard';
import { ensureCurrentWeek } from '@/app/(dashboard)/team/actions';

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  const { data: membership } = await supabase
    .from('team_members')
    .select('*, teams(*)')
    .eq('user_id', user.id)
    .limit(1)
    .single();

  // Auto-create current week if team exists but no week for today
  if (membership) {
    await ensureCurrentWeek(membership.team_id);
  }

  return (
    <TeamDashboard
      profile={profile}
      membership={membership}
    />
  );
}
