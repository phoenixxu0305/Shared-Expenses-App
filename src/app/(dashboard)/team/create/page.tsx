import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { TeamCreateWizard } from '@/components/team-create-wizard';

export default async function TeamCreatePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') redirect('/');

  // Get approved users not in any team
  const { data: approvedInvites } = await supabase
    .from('invite_requests')
    .select('*')
    .eq('status', 'approved');

  return (
    <TeamCreateWizard
      userId={user.id}
      approvedInvites={approvedInvites || []}
    />
  );
}
