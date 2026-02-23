'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import type { InviteRequest } from '@/types/database';
import { toast } from 'sonner';
import { getCurrentWeekDates, getWeekLabel } from '@/lib/expense-calculations';

interface TeamCreateWizardProps {
  userId: string;
  approvedInvites: InviteRequest[];
}

export function TeamCreateWizard({ userId, approvedInvites }: TeamCreateWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1: Team info
  const [teamName, setTeamName] = useState('');
  const [bgColor, setBgColor] = useState('#3b82f6');

  // Step 2: Members
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  // Step 3: Allocations
  const [allocationPerVolunteer, setAllocationPerVolunteer] = useState(100);

  // Step 4: Pooled split
  const [pooledEnabled, setPooledEnabled] = useState(false);
  const [pooledPercentage, setPooledPercentage] = useState(80);

  const totalKitty = (selectedMembers.length + 1) * allocationPerVolunteer;

  function toggleMember(email: string) {
    setSelectedMembers((prev) =>
      prev.includes(email)
        ? prev.filter((e) => e !== email)
        : [...prev, email]
    );
  }

  async function handleCreate() {
    setLoading(true);

    const supabase = createClient();

    // Create team
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .insert({
        name: teamName,
        background_color: bgColor,
        created_by: userId,
      })
      .select()
      .single();

    if (teamError || !team) {
      toast.error(teamError?.message || 'Failed to create team');
      setLoading(false);
      return;
    }

    // Add creator as admin member
    const { error: memberError } = await supabase.from('team_members').insert({
      team_id: team.id,
      user_id: userId,
      role: 'admin',
    });

    if (memberError) {
      toast.error('Failed to add you as team member: ' + memberError.message);
      setLoading(false);
      return;
    }

    // Assign selected members' invites to this team
    // When they sign up, they'll be auto-added via the assigned_team_id
    if (selectedMembers.length > 0) {
      await supabase
        .from('invite_requests')
        .update({ assigned_team_id: team.id, assigned_role: 'volunteer' })
        .in('email', selectedMembers)
        .eq('status', 'approved');
    }

    // Create the initial week
    const { start, end } = getCurrentWeekDates();
    const { error: weekError } = await supabase.from('weeks').insert({
      team_id: team.id,
      label: getWeekLabel(new Date()),
      start_date: start.toISOString().split('T')[0],
      end_date: end.toISOString().split('T')[0],
      total_kitty: totalKitty,
      allocation_per_volunteer: allocationPerVolunteer,
      pooled_split_enabled: pooledEnabled,
      pooled_percentage: pooledPercentage,
    });

    if (weekError) {
      toast.error('Failed to create week: ' + weekError.message);
      setLoading(false);
      return;
    }

    toast.success('Team created successfully!');
    router.push('/');
    router.refresh();
    setLoading(false);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold">Create a Team</h2>

      {/* Progress */}
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((s) => (
          <div
            key={s}
            className={`h-2 flex-1 rounded-full ${
              s <= step ? 'bg-primary' : 'bg-muted'
            }`}
          />
        ))}
      </div>

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Team Details</CardTitle>
            <CardDescription>Name your team and pick a color</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Team Name</Label>
              <Input
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="e.g. Can Picard Volunteers"
              />
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
            <Button
              onClick={() => setStep(2)}
              disabled={!teamName.trim()}
              className="w-full"
            >
              Next
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Add Members</CardTitle>
            <CardDescription>
              Select from approved invite requests ({approvedInvites.length} available)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {approvedInvites.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No approved invites yet. You can add members later.
              </p>
            ) : (
              <div className="space-y-2">
                {approvedInvites.map((invite) => (
                  <div
                    key={invite.id}
                    className={`flex items-center justify-between p-3 rounded-md border cursor-pointer transition-colors ${
                      selectedMembers.includes(invite.email)
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted'
                    }`}
                    onClick={() => toggleMember(invite.email)}
                  >
                    <span>{invite.email}</span>
                    {selectedMembers.includes(invite.email) && (
                      <Badge>Selected</Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                Back
              </Button>
              <Button onClick={() => setStep(3)} className="flex-1">
                Next
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Set Allocations</CardTitle>
            <CardDescription>
              Weekly budget per volunteer
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Allocation per Volunteer (€)</Label>
              <Slider
                value={[allocationPerVolunteer]}
                onValueChange={([v]) => setAllocationPerVolunteer(v)}
                min={10}
                max={500}
                step={10}
              />
              <Input
                type="number"
                value={allocationPerVolunteer}
                onChange={(e) => setAllocationPerVolunteer(parseInt(e.target.value) || 0)}
                min={1}
              />
            </div>
            <div className="p-3 bg-muted rounded-md text-sm">
              <p>Members: {selectedMembers.length + 1} (including you)</p>
              <p className="font-medium">
                Total Kitty: €{totalKitty.toFixed(2)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)} className="flex-1">
                Back
              </Button>
              <Button onClick={() => setStep(4)} className="flex-1">
                Next
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>Pooled Distribution</CardTitle>
            <CardDescription>
              Optionally split allocations between team and personal budgets
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Enable Pooled Split</Label>
              <Switch
                checked={pooledEnabled}
                onCheckedChange={setPooledEnabled}
              />
            </div>
            {pooledEnabled && (
              <>
                <div className="space-y-2">
                  <Label>Team Pool Percentage ({pooledPercentage}%)</Label>
                  <Slider
                    value={[pooledPercentage]}
                    onValueChange={([v]) => setPooledPercentage(v)}
                    min={10}
                    max={90}
                    step={5}
                  />
                </div>
                <div className="p-3 bg-muted rounded-md text-sm space-y-1">
                  <p>
                    Team pool: €{(totalKitty * pooledPercentage / 100).toFixed(2)} ({pooledPercentage}%)
                  </p>
                  <p>
                    Per-person personal: €{(allocationPerVolunteer * (100 - pooledPercentage) / 100).toFixed(2)} ({100 - pooledPercentage}%)
                  </p>
                </div>
              </>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(3)} className="flex-1">
                Back
              </Button>
              <Button onClick={() => setStep(5)} className="flex-1">
                Next
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 5 && (
        <Card>
          <CardHeader>
            <CardTitle>Review & Confirm</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Team Name</span>
                <span className="font-medium">{teamName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Members</span>
                <span className="font-medium">{selectedMembers.length + 1}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Per-Volunteer Allocation</span>
                <span className="font-medium">€{allocationPerVolunteer}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Kitty</span>
                <span className="font-medium">€{totalKitty.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pooled Split</span>
                <span className="font-medium">
                  {pooledEnabled ? `${pooledPercentage}/${100 - pooledPercentage}` : 'Off'}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(4)} className="flex-1">
                Back
              </Button>
              <Button onClick={handleCreate} disabled={loading} className="flex-1">
                {loading ? 'Creating...' : 'Create Team'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
