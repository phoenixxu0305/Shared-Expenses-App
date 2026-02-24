import { createClient, createServiceClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { TeamSettings } from '@/components/team-settings';

export default async function TeamSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string; section?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const serviceClient = await createServiceClient();

  // If a specific team is requested, use that; otherwise fall back to first admin team
  let membership;
  if (params.team) {
    const { data } = await serviceClient
      .from('team_members')
      .select('*, teams(*)')
      .eq('user_id', user.id)
      .eq('team_id', params.team)
      .eq('role', 'admin')
      .single();
    membership = data;
  } else {
    const { data } = await serviceClient
      .from('team_members')
      .select('*, teams(*)')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .limit(1)
      .single();
    membership = data;
  }

  if (!membership) redirect('/');

  const { data: members } = await serviceClient
    .from('team_members')
    .select('*, profiles(*)')
    .eq('team_id', membership.team_id);

  // Use service client to bypass RLS — admin needs to see all registered users
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
  const { data: week } = await serviceClient
    .from('weeks')
    .select('*')
    .eq('team_id', membership.team_id)
    .lte('start_date', today)
    .gte('end_date', today)
    .limit(1)
    .single();

  const section = (params.section as 'weekly' | 'members' | 'appearance') || undefined;

  return (
    <TeamSettings
      team={membership.teams}
      members={members || []}
      currentWeek={week}
      availableUsers={availableUsers}
      section={section}
    />
  );
}
