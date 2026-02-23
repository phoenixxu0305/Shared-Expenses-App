import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { TeamSettings } from '@/components/team-settings';

export default async function TeamSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: membership } = await supabase
    .from('team_members')
    .select('*, teams(*)')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .limit(1)
    .single();

  if (!membership) redirect('/');

  const { data: members } = await supabase
    .from('team_members')
    .select('*, profiles(*)')
    .eq('team_id', membership.team_id);

  const today = new Date().toISOString().split('T')[0];
  const { data: week } = await supabase
    .from('weeks')
    .select('*')
    .eq('team_id', membership.team_id)
    .lte('start_date', today)
    .gte('end_date', today)
    .limit(1)
    .single();

  return (
    <TeamSettings
      team={membership.teams}
      members={members || []}
      currentWeek={week}
    />
  );
}
