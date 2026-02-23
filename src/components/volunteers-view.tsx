'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Profile, UserRole, TeamMember, Expense, InviteRequest } from '@/types/database';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { approveInviteRequest, denyInviteRequest } from '@/app/(dashboard)/expenses/actions';

interface VolunteersViewProps {
  profile: Profile | null;
  teamId: string | undefined;
  role: UserRole | undefined;
}

interface MemberWithExpenses extends TeamMember {
  profiles: Profile;
  expenses: Expense[];
  totalSpent: number;
}

export function VolunteersView({ profile, teamId, role }: VolunteersViewProps) {
  const [members, setMembers] = useState<MemberWithExpenses[]>([]);
  const [inviteRequests, setInviteRequests] = useState<InviteRequest[]>([]);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) {
      setLoading(false);
      return;
    }
    loadData();
  }, [teamId]);

  async function loadData() {
    const supabase = createClient();

    const { data: membersData } = await supabase
      .from('team_members')
      .select('*, profiles(*)')
      .eq('team_id', teamId!);

    if (membersData) {
      const membersWithExpenses: MemberWithExpenses[] = [];

      for (const member of membersData) {
        const { data: expenses } = await supabase
          .from('expenses')
          .select('*')
          .eq('user_id', member.user_id)
          .eq('team_id', teamId!)
          .eq('is_deleted', false);

        const totalSpent = (expenses || []).reduce(
          (sum, e) => sum + Number(e.amount),
          0
        );

        membersWithExpenses.push({
          ...member,
          expenses: expenses || [],
          totalSpent,
        } as MemberWithExpenses);
      }

      setMembers(membersWithExpenses);
    }

    if (role === 'admin') {
      const { data: invites } = await supabase
        .from('invite_requests')
        .select('*')
        .order('created_at', { ascending: false });
      setInviteRequests(invites || []);
    }

    setLoading(false);
  }

  async function handleInviteAction(inviteId: string, action: 'approved' | 'denied') {
    const result = action === 'approved'
      ? await approveInviteRequest(inviteId)
      : await denyInviteRequest(inviteId);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(`Invite ${action}`);
      loadData();
    }
  }

  async function updateMemberRole(memberId: string, newRole: UserRole) {
    const supabase = createClient();
    const { error } = await supabase
      .from('team_members')
      .update({ role: newRole })
      .eq('id', memberId);

    if (error) toast.error(error.message);
    else {
      toast.success('Role updated');
      loadData();
    }
  }

  if (loading) {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  if (!teamId) {
    return <p className="text-muted-foreground">No team found.</p>;
  }

  const currentMember = selectedMember
    ? members.find((m) => m.user_id === selectedMember)
    : null;

  // Volunteer view: only see names and their own info
  if (role === 'volunteer') {
    const myMember = members.find((m) => m.user_id === profile?.id);
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Volunteers</h2>

        {/* Team members list */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {members.map((member) => {
            const initials = member.profiles?.full_name
              ? member.profiles.full_name.split(' ').map((n) => n[0]).join('').toUpperCase()
              : '?';
            return (
              <Card key={member.id}>
                <CardContent className="flex flex-col items-center py-6">
                  <Avatar className="h-16 w-16 mb-3">
                    <AvatarFallback className="text-lg">{initials}</AvatarFallback>
                  </Avatar>
                  <p className="font-medium text-center">
                    {member.profiles?.full_name || 'Unknown'}
                  </p>
                  <Badge variant="outline" className="mt-1 capitalize">
                    {member.role}
                  </Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Own expense summary */}
        {myMember && (
          <Card>
            <CardHeader>
              <CardTitle>Your Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">€{myMember.totalSpent.toFixed(2)} spent</p>
              <Separator className="my-4" />
              <div className="space-y-2">
                {myMember.expenses.slice(0, 10).map((expense) => (
                  <div key={expense.id} className="flex justify-between text-sm">
                    <span>{expense.description}</span>
                    <span className="font-medium">€{Number(expense.amount).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // Admin/Treasurer view
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Volunteers</h2>

      {/* Member selector */}
      <Select
        value={selectedMember || ''}
        onValueChange={setSelectedMember}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select a volunteer to view details..." />
        </SelectTrigger>
        <SelectContent>
          {members.map((member) => (
            <SelectItem key={member.user_id} value={member.user_id}>
              {member.profiles?.full_name || 'Unknown'} ({member.role})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Selected member details */}
      {currentMember && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarFallback>
                    {currentMember.profiles?.full_name
                      ? currentMember.profiles.full_name.split(' ').map((n) => n[0]).join('').toUpperCase()
                      : '?'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <CardTitle>{currentMember.profiles?.full_name || 'Unknown'}</CardTitle>
                  <p className="text-sm text-muted-foreground capitalize">{currentMember.role}</p>
                </div>
              </div>
              {role === 'admin' && currentMember.role !== 'admin' && (
                <Select
                  value={currentMember.role}
                  onValueChange={(v) => updateMemberRole(currentMember.id, v as UserRole)}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="treasurer">Treasurer</SelectItem>
                    <SelectItem value="volunteer">Volunteer</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold mb-4">
              €{currentMember.totalSpent.toFixed(2)} spent
            </p>
            <div className="space-y-2">
              {currentMember.expenses.map((expense) => (
                <div key={expense.id} className="flex justify-between text-sm">
                  <div>
                    <span>{expense.description}</span>
                    {expense.type === 'team' && (
                      <Badge variant="outline" className="ml-2">Team</Badge>
                    )}
                  </div>
                  <span className="font-medium">€{Number(expense.amount).toFixed(2)}</span>
                </div>
              ))}
              {currentMember.expenses.length === 0 && (
                <p className="text-sm text-muted-foreground">No expenses</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All members grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {members.map((member) => {
          const initials = member.profiles?.full_name
            ? member.profiles.full_name.split(' ').map((n) => n[0]).join('').toUpperCase()
            : '?';
          return (
            <Card
              key={member.id}
              className="cursor-pointer hover:border-primary transition-colors"
              onClick={() => setSelectedMember(member.user_id)}
            >
              <CardContent className="flex flex-col items-center py-6">
                <Avatar className="h-12 w-12 mb-2">
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <p className="font-medium text-center text-sm">
                  {member.profiles?.full_name || 'Unknown'}
                </p>
                <Badge variant="outline" className="mt-1 capitalize text-xs">
                  {member.role}
                </Badge>
                <p className="text-sm font-medium mt-2">
                  €{member.totalSpent.toFixed(2)}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Invite Management (Admin only) */}
      {role === 'admin' && (
        <>
          <Separator />
          <h3 className="text-lg font-semibold">Invite Requests</h3>
          {inviteRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invite requests.</p>
          ) : (
            <div className="space-y-3">
              {inviteRequests.map((invite) => (
                <Card key={invite.id}>
                  <CardContent className="flex items-center justify-between py-4">
                    <div>
                      <p className="font-medium">{invite.email}</p>
                      {invite.note && (
                        <p className="text-sm text-muted-foreground">{invite.note}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {new Date(invite.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {invite.status === 'pending' ? (
                        <>
                          <Button
                            size="sm"
                            onClick={() => handleInviteAction(invite.id, 'approved')}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleInviteAction(invite.id, 'denied')}
                          >
                            Deny
                          </Button>
                        </>
                      ) : (
                        <Badge
                          variant={invite.status === 'approved' ? 'secondary' : 'destructive'}
                        >
                          {invite.status}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
