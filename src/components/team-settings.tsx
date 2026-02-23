'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Team, TeamMember, Week, Profile, UserRole } from '@/types/database';
import { toast } from 'sonner';

interface TeamSettingsProps {
  team: Team;
  members: (TeamMember & { profiles: Profile })[];
  currentWeek: Week | null;
  availableUsers: { id: string; full_name: string }[];
}

export function TeamSettings({ team, members, currentWeek, availableUsers }: TeamSettingsProps) {
  const router = useRouter();

  // Add member
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState<'volunteer' | 'treasurer'>('volunteer');
  const [addingMember, setAddingMember] = useState(false);

  // Team appearance
  const [teamName, setTeamName] = useState(team.name);
  const [bgColor, setBgColor] = useState(team.background_color || '#3b82f6');

  // Weekly settings
  const [allocation, setAllocation] = useState(currentWeek?.allocation_per_volunteer ?? 100);
  const [pooledEnabled, setPooledEnabled] = useState(currentWeek?.pooled_split_enabled ?? false);
  const [pooledPercentage, setPooledPercentage] = useState(currentWeek?.pooled_percentage ?? 80);

  const [savingTeam, setSavingTeam] = useState(false);
  const [savingWeek, setSavingWeek] = useState(false);

  async function saveTeamAppearance() {
    setSavingTeam(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('teams')
      .update({ name: teamName, background_color: bgColor })
      .eq('id', team.id);

    if (error) toast.error(error.message);
    else {
      toast.success('Team updated');
      router.refresh();
    }
    setSavingTeam(false);
  }

  async function saveWeekSettings() {
    if (!currentWeek) return;
    setSavingWeek(true);
    const supabase = createClient();

    const totalKitty = members.length * allocation;

    const { error } = await supabase
      .from('weeks')
      .update({
        allocation_per_volunteer: allocation,
        pooled_split_enabled: pooledEnabled,
        pooled_percentage: pooledPercentage,
        total_kitty: totalKitty,
      })
      .eq('id', currentWeek.id);

    if (error) toast.error(error.message);
    else {
      toast.success('Week settings updated');
      router.refresh();
    }
    setSavingWeek(false);
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
      router.refresh();
    }
  }

  async function removeMember(memberId: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from('team_members')
      .delete()
      .eq('id', memberId);

    if (error) toast.error(error.message);
    else {
      toast.success('Member removed');
      router.refresh();
    }
  }

  async function addMember() {
    if (!selectedUserId) return;
    setAddingMember(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('team_members')
      .insert({ team_id: team.id, user_id: selectedUserId, role: selectedRole });

    if (error) toast.error(error.message);
    else {
      toast.success('Member added');
      setSelectedUserId('');
      setSelectedRole('volunteer');
      router.refresh();
    }
    setAddingMember(false);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Team Settings</h2>
        <Button variant="outline" onClick={() => router.push('/')}>
          Back to Dashboard
        </Button>
      </div>

      {/* Team Appearance */}
      <Card>
        <CardHeader>
          <CardTitle>Team Appearance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Team Name</Label>
            <Input value={teamName} onChange={(e) => setTeamName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Background Color</Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                className="w-12 h-10 rounded cursor-pointer"
              />
              <span className="text-sm text-muted-foreground">{bgColor}</span>
            </div>
          </div>
          <Button onClick={saveTeamAppearance} disabled={savingTeam}>
            {savingTeam ? 'Saving...' : 'Save Appearance'}
          </Button>
        </CardContent>
      </Card>

      {/* Weekly Settings */}
      {currentWeek && (
        <Card>
          <CardHeader>
            <CardTitle>Weekly Settings — {currentWeek.label}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Allocation per Volunteer (€{allocation})</Label>
              <Slider
                value={[allocation]}
                onValueChange={([v]) => setAllocation(v)}
                min={10}
                max={500}
                step={10}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <Label>Pooled Split</Label>
              <Switch checked={pooledEnabled} onCheckedChange={setPooledEnabled} />
            </div>
            {pooledEnabled && (
              <div className="space-y-2">
                <Label>Team Pool ({pooledPercentage}%)</Label>
                <Slider
                  value={[pooledPercentage]}
                  onValueChange={([v]) => setPooledPercentage(v)}
                  min={10}
                  max={90}
                  step={5}
                />
                <p className="text-sm text-muted-foreground">
                  Personal: {100 - pooledPercentage}% (€{(allocation * (100 - pooledPercentage) / 100).toFixed(2)}/person)
                </p>
              </div>
            )}
            <p className="text-sm font-medium">
              Total Kitty: €{(members.length * allocation).toFixed(2)}
            </p>
            <Button onClick={saveWeekSettings} disabled={savingWeek}>
              {savingWeek ? 'Saving...' : 'Save Week Settings'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Members */}
      <Card>
        <CardHeader>
          <CardTitle>Team Members ({members.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between p-3 border rounded-md"
            >
              <div>
                <p className="font-medium">
                  {member.profiles?.full_name || 'Unknown'}
                </p>
                <p className="text-sm text-muted-foreground capitalize">
                  {member.role}
                </p>
              </div>
              {member.role !== 'admin' && (
                <div className="flex items-center gap-2">
                  <Select
                    value={member.role}
                    onValueChange={(v) => updateMemberRole(member.id, v as UserRole)}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="treasurer">Treasurer</SelectItem>
                      <SelectItem value="volunteer">Volunteer</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => removeMember(member.id)}
                  >
                    Remove
                  </Button>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Add Members */}
      <Card>
        <CardHeader>
          <CardTitle>Add Members</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {availableUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No users available to add</p>
          ) : (
            <>
              <div className="space-y-2">
                <Label>User</Label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a user" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as 'volunteer' | 'treasurer')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="volunteer">Volunteer</SelectItem>
                    <SelectItem value="treasurer">Treasurer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={addMember} disabled={addingMember || !selectedUserId}>
                {addingMember ? 'Adding...' : 'Add to Team'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
