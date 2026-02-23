import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { TeamDashboard } from '@/components/team-dashboard';
import { ensureCurrentWeek } from '@/app/(dashboard)/team/actions';

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  // If no profile exists, create one on the fly
  if (!profile) {
    const { error: insertError } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || '',
        role: 'volunteer',
      });

    if (insertError) {
      // Profile creation failed — show basic dashboard anyway
      return (
        <TeamDashboard
          profile={{
            id: user.id,
            full_name: user.email || 'User',
            avatar_url: null,
            role: 'volunteer',
            created_at: new Date().toISOString(),
          }}
          membership={null}
        />
      );
    }

    // Re-fetch the newly created profile
    const { data: newProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    return (
      <TeamDashboard
        profile={newProfile}
        membership={null}
      />
    );
  }

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
