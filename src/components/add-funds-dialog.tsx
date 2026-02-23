'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { addFunds } from '@/app/(dashboard)/expenses/actions';
import type { DistributionType } from '@/types/database';
import { toast } from 'sonner';

interface AddFundsDialogProps {
  open: boolean;
  onClose: () => void;
  teamId: string;
  weekId: string;
  userId: string;
  onSuccess: () => void;
}

export function AddFundsDialog({
  open,
  onClose,
  teamId,
  weekId,
  userId,
  onSuccess,
}: AddFundsDialogProps) {
  const [amount, setAmount] = useState<number>(0);
  const [distributionType, setDistributionType] = useState<DistributionType>('group');
  const [splitPercentage, setSplitPercentage] = useState<number>(80);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (amount <= 0 || !description.trim()) return;

    setLoading(true);

    const result = await addFunds({
      teamId,
      weekId,
      amount,
      distributionType,
      splitPercentage: distributionType === 'split' ? splitPercentage : null,
      description: description.trim(),
      addedBy: userId,
    });

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success('Funds added');
      onSuccess();
      onClose();
    }

    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Funds</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Amount</Label>
            <Input
              type="number"
              value={amount || ''}
              onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
              min={0.01}
              step={0.01}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Distribution Type</Label>
            <Select
              value={distributionType}
              onValueChange={(v) => setDistributionType(v as DistributionType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="group">Group</SelectItem>
                <SelectItem value="personal">Personal</SelectItem>
                <SelectItem value="split">Split</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {distributionType === 'split' && (
            <div className="space-y-2">
              <Label>Split Percentage (team pool %)</Label>
              <Input
                type="number"
                value={splitPercentage}
                onChange={(e) => setSplitPercentage(parseInt(e.target.value) || 0)}
                min={0}
                max={100}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Reason for adding funds..."
              required
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || amount <= 0 || !description.trim()}
            >
              {loading ? 'Adding...' : 'Add Funds'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
