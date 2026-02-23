'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { addExpense } from '@/app/(dashboard)/expenses/actions';
import {
  calculateMaxPersonalExpense,
  calculateMaxTeamExpense,
} from '@/lib/expense-calculations';
import type { Week, Expense, UserRole, ExpenseType } from '@/types/database';
import { toast } from 'sonner';

interface ExpenseFormProps {
  open: boolean;
  onClose: () => void;
  teamId: string;
  weekId: string;
  userId: string;
  role: UserRole;
  week: Week;
  expenses: Expense[];
  memberCount: number;
  onSuccess: () => void;
}

export function ExpenseForm({
  open,
  onClose,
  teamId,
  weekId,
  userId,
  role,
  week,
  expenses,
  memberCount,
  onSuccess,
}: ExpenseFormProps) {
  const [expenseType, setExpenseType] = useState<ExpenseType>('personal');
  const [amount, setAmount] = useState(0);
  const [description, setDescription] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const userExpenses = expenses.filter((e) => e.user_id === userId);

  const maxPersonal = calculateMaxPersonalExpense(week, userExpenses);
  const maxTeam = calculateMaxTeamExpense(week, expenses, memberCount);
  const maxAmount = expenseType === 'personal' ? maxPersonal : maxTeam;

  const canAddTeamExpense = role === 'admin' || role === 'treasurer';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (amount <= 0 || !description.trim()) return;

    setLoading(true);

    let receiptUrl: string | undefined;
    if (receiptFile) {
      const formData = new FormData();
      formData.append('file', receiptFile);
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
      const uploadData = await uploadRes.json();
      if (uploadData.error) {
        toast.error(`Upload failed: ${uploadData.error}`);
        setLoading(false);
        return;
      }
      receiptUrl = uploadData.url;
    }

    const result = await addExpense({
      teamId,
      weekId,
      userId,
      amount,
      description: description.trim(),
      type: expenseType,
      receiptUrl,
    });

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success('Expense added');
      onSuccess();
      onClose();
    }

    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Expense</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {canAddTeamExpense && (
            <div className="space-y-2">
              <Label>Expense Type</Label>
              <Select
                value={expenseType}
                onValueChange={(v) => {
                  setExpenseType(v as ExpenseType);
                  setAmount(0);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="personal">Personal</SelectItem>
                  <SelectItem value="team">Team</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>
              Amount (max: €{maxAmount.toFixed(2)})
            </Label>
            <Slider
              value={[amount]}
              onValueChange={([v]) => setAmount(v)}
              max={maxAmount}
              step={0.5}
              className="mt-2"
            />
            <Input
              type="number"
              value={amount || ''}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                setAmount(Math.min(val, maxAmount));
              }}
              min={0}
              max={maxAmount}
              step={0.01}
            />
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What was this expense for?"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Receipt (optional)</Label>
            <Input
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
            />
            {receiptFile && (
              <p className="text-xs text-muted-foreground">{receiptFile.name}</p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || amount <= 0 || !description.trim()}
            >
              {loading ? 'Adding...' : 'Add Expense'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
