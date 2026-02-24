import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { HistoryView } from '@/components/history-view';

export default async function HistoryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (profile?.role === 'volunteer') redirect('/');

  const { data: membership } = await supabase
    .from('team_members')
    .select('*')
    .eq('user_id', user.id)
    .limit(1)
    .single();

  const isAdmin = membership?.role === 'admin';

  return <HistoryView teamId={membership?.team_id} isAdmin={isAdmin} />;
}
