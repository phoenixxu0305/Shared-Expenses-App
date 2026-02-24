import { createClient, createServiceClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { TeamDashboard } from '@/components/team-dashboard';
import { ensureCurrentWeek } from '@/app/(dashboard)/team/actions';

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Use service client to bypass RLS for server-side data fetching
  const serviceClient = await createServiceClient();

  const { data: profile } = await serviceClient
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  // If no profile exists, create one on the fly
  if (!profile) {
    const { count: existingProfiles } = await serviceClient
      .from('profiles')
      .select('*', { count: 'exact', head: true });
    const assignedRole = (existingProfiles === 0 || existingProfiles === null) ? 'admin' : 'volunteer';

    const { error: insertError } = await serviceClient
      .from('profiles')
      .upsert({
        id: user.id,
        full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || '',
        role: assignedRole,
      });

    if (insertError) {
      return (
        <TeamDashboard
          profile={{
            id: user.id,
            full_name: user.email || 'User',
            avatar_url: null,
            role: assignedRole,
            created_at: new Date().toISOString(),
          }}
          memberships={[]}
        />
      );
    }

    const { data: newProfile } = await serviceClient
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    return (
      <TeamDashboard
        profile={newProfile}
        memberships={[]}
      />
    );
  }

  // Fetch ALL team memberships for this user
  const { data: memberships } = await serviceClient
    .from('team_members')
    .select('*, teams(*)')
    .eq('user_id', user.id);

  const allMemberships = memberships || [];

  // Auto-create current week for each team
  for (const m of allMemberships) {
    await ensureCurrentWeek(m.team_id);
  }

  return (
    <TeamDashboard
      profile={profile}
      memberships={allMemberships}
    />
  );
}
