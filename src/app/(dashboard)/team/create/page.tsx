import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { TeamCreateWizard } from '@/components/team-create-wizard';

export default async function TeamCreatePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  // If profile can't be read, show error instead of silently redirecting
  if (!profile) {
    return (
      <div className="max-w-lg mx-auto text-center py-12 space-y-4">
        <h2 className="text-2xl font-bold">Cannot load profile</h2>
        <p className="text-muted-foreground">
          {profileError?.message || 'Profile not found. Please try logging out and back in.'}
        </p>
        <p className="text-xs text-muted-foreground">User ID: {user.id}</p>
      </div>
    );
  }

  if (profile.role !== 'admin') {
    return (
      <div className="max-w-lg mx-auto text-center py-12 space-y-4">
        <h2 className="text-2xl font-bold">Access Denied</h2>
        <p className="text-muted-foreground">
          Only admins can create teams. Your current role: {profile.role}
        </p>
      </div>
    );
  }

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
