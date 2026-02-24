'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { InviteRequest } from '@/types/database';
import { toast } from 'sonner';
import { createTeam } from '@/app/(dashboard)/team/actions';

interface TeamCreateWizardProps {
  userId: string;
  approvedInvites: InviteRequest[];
  availableUsers?: { id: string; full_name: string }[];
}

export function TeamCreateWizard({ userId, approvedInvites, availableUsers = [] }: TeamCreateWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1: Team info
  const [teamName, setTeamName] = useState('');
  const [bgColor, setBgColor] = useState('#3b82f6');

  // Step 2: Members — registered users (by ID) + invite emails + manual emails
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [manualEmail, setManualEmail] = useState('');

  // Step 3: Allocations
  const [allocationPerVolunteer, setAllocationPerVolunteer] = useState(100);

  // Step 4: Pooled split
  const [pooledEnabled, setPooledEnabled] = useState(false);
  const [pooledPercentage, setPooledPercentage] = useState(80);

  const totalMemberCount = 1 + selectedUserIds.length + selectedEmails.length;
  const totalKitty = totalMemberCount * allocationPerVolunteer;

  function toggleUser(userId: string) {
    setSelectedUserIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  }

  function toggleInviteEmail(email: string) {
    setSelectedEmails((prev) =>
      prev.includes(email)
        ? prev.filter((e) => e !== email)
        : [...prev, email]
    );
  }

  function addManualEmail() {
    const email = manualEmail.trim();
    if (!email) return;
    if (selectedEmails.includes(email)) {
      toast.error('Email already added');
      return;
    }
    setSelectedEmails((prev) => [...prev, email]);
    setManualEmail('');
  }

  function removeManualEmail(email: string) {
    setSelectedEmails((prev) => prev.filter((e) => e !== email));
  }

  async function handleCreate() {
    setLoading(true);

    const result = await createTeam({
      teamName,
      bgColor,
      selectedMembers: selectedEmails,
      selectedUserIds,
      allocationPerVolunteer,
      pooledEnabled,
      pooledPercentage,
    });

    if (result.error) {
      toast.error(result.error);
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
              Select registered users, approved invites, or add by email
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Registered users */}
            {availableUsers.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Registered Users</Label>
                <div className="grid grid-cols-2 gap-2">
                  {availableUsers.map((u) => (
                    <div
                      key={u.id}
                      className={`flex items-center justify-between p-3 rounded-md border cursor-pointer transition-colors ${
                        selectedUserIds.includes(u.id)
                          ? 'border-primary bg-primary/5'
                          : 'hover:bg-muted'
                      }`}
                      onClick={() => toggleUser(u.id)}
                    >
                      <span className="text-sm">{u.full_name}</span>
                      {selectedUserIds.includes(u.id) && (
                        <Badge>Selected</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {availableUsers.length > 0 && approvedInvites.length > 0 && <Separator />}

            {/* Approved invites */}
            {approvedInvites.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Approved Invites</Label>
                <div className="space-y-2">
                  {approvedInvites.map((invite) => (
                    <div
                      key={invite.id}
                      className={`flex items-center justify-between p-3 rounded-md border cursor-pointer transition-colors ${
                        selectedEmails.includes(invite.email)
                          ? 'border-primary bg-primary/5'
                          : 'hover:bg-muted'
                      }`}
                      onClick={() => toggleInviteEmail(invite.email)}
                    >
                      <span>{invite.email}</span>
                      {selectedEmails.includes(invite.email) && (
                        <Badge>Selected</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            {/* Add by email */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Add by Email</Label>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="user@example.com"
                  value={manualEmail}
                  onChange={(e) => setManualEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addManualEmail()}
                />
                <Button variant="outline" onClick={addManualEmail} disabled={!manualEmail.trim()}>
                  Add
                </Button>
              </div>
              {/* Show manually added emails that aren't from invites */}
              {selectedEmails.filter((e) => !approvedInvites.some((inv) => inv.email === e)).length > 0 && (
                <div className="space-y-1 mt-2">
                  {selectedEmails
                    .filter((e) => !approvedInvites.some((inv) => inv.email === e))
                    .map((email) => (
                      <div key={email} className="flex items-center justify-between p-2 border rounded-md text-sm">
                        <span>{email}</span>
                        <Button variant="ghost" size="sm" onClick={() => removeManualEmail(email)}>
                          Remove
                        </Button>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <p className="text-sm text-muted-foreground">
              {selectedUserIds.length + selectedEmails.length} member(s) selected
            </p>

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
              <p>Members: {totalMemberCount} (including you)</p>
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
                <span className="font-medium">{totalMemberCount}</span>
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
