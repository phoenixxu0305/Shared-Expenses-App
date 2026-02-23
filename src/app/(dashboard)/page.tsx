import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { TeamDashboard } from '@/components/team-dashboard';

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

  return (
    <TeamDashboard
      profile={profile}
      membership={membership}
    />
  );
}
