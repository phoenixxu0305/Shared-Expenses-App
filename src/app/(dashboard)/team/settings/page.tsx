import { createClient, createServiceClient } from '@/lib/supabase/server';
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

  // Use service client to bypass RLS — admin needs to see all registered users,
  // not just those already on the team.
  const serviceClient = await createServiceClient();
  const memberUserIds = (members || []).map((m: any) => m.user_id);
  let availableUsers: { id: string; full_name: string }[] = [];
  const query = serviceClient.from('profiles').select('id, full_name');
  if (memberUserIds.length > 0) {
    query.not('id', 'in', `(${memberUserIds.join(',')})`);
  }
  const { data: profiles } = await query;
  availableUsers = (profiles || []).map((p: any) => ({
    id: p.id,
    full_name: p.full_name || 'Unnamed User',
  }));

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
      availableUsers={availableUsers}
    />
  );
}
