import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { VolunteersView } from '@/components/volunteers-view';

export default async function VolunteersPage() {
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
    .select('*')
    .eq('user_id', user.id)
    .limit(1)
    .single();

  return (
    <VolunteersView
      profile={profile}
      teamId={membership?.team_id}
      role={membership?.role ?? profile?.role}
    />
  );
}
