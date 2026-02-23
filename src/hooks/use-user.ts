'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Profile, UserRole, TeamMember } from '@/types/database';
import type { User } from '@supabase/supabase-js';

interface UseUserReturn {
  user: User | null;
  profile: Profile | null;
  teamMembership: TeamMember | null;
  role: UserRole | null;
  loading: boolean;
}

export function useUser(): UseUserReturn {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [teamMembership, setTeamMembership] = useState<TeamMember | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      if (user) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        setProfile(profileData);

        const { data: memberData } = await supabase
          .from('team_members')
          .select('*')
          .eq('user_id', user.id)
          .limit(1)
          .single();
        setTeamMembership(memberData);
      }

      setLoading(false);
    }

    loadUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        if (!session?.user) {
          setProfile(null);
          setTeamMembership(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  return {
    user,
    profile,
    teamMembership,
    role: teamMembership?.role ?? profile?.role ?? null,
    loading,
  };
}
