'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Expense, UserRole } from '@/types/database';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ExpenseListProps {
  expenses: Expense[];
  currentUserId: string;
  role: UserRole;
  onUpdate: () => void;
}

export function ExpenseList({
  expenses,
  currentUserId,
  role,
  onUpdate,
}: ExpenseListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<{ url: string; description: string } | null>(null);

  async function handleSoftDelete(expenseId: string) {
    setDeletingId(expenseId);
    const supabase = createClient();
    const { error } = await supabase
      .from('expenses')
      .update({ is_deleted: true })
      .eq('id', expenseId);

    if (error) {
      toast.error('Failed to delete expense');
    } else {
      toast.success('Expense deleted');
      onUpdate();
    }
    setDeletingId(null);
  }

  function canDelete(expense: Expense): boolean {
    if (role === 'admin' || role === 'treasurer') return true;
    return expense.user_id === currentUserId;
  }

  return (
    <div className="space-y-3">
      {expenses.map((expense) => (
        <Card
          key={expense.id}
          className={cn(expense.is_deleted && 'opacity-50')}
        >
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p
                  className={cn(
                    'font-medium truncate',
                    expense.is_deleted && 'line-through'
                  )}
                >
                  {expense.description}
                </p>
                {expense.user_id === currentUserId && (
                  <Badge variant="secondary">You</Badge>
                )}
                {expense.type === 'team' && (
                  <Badge variant="outline">Team</Badge>
                )}
                {expense.is_deleted && (
                  <Badge variant="destructive">Deleted</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {new Date(expense.created_at).toLocaleDateString()}
                {expense.receipt_url && (
                  <>
                    {' · '}
                    <button
                      type="button"
                      onClick={() => setReceiptPreview({ url: expense.receipt_url!, description: expense.description })}
                      className="text-primary underline hover:text-primary/80"
                    >
                      View Receipt
                    </button>
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-3 ml-4">
              <p className="font-semibold whitespace-nowrap">
                €{Number(expense.amount).toFixed(2)}
              </p>
              {!expense.is_deleted && canDelete(expense) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSoftDelete(expense.id)}
                  disabled={deletingId === expense.id}
                  className="text-destructive hover:text-destructive"
                >
                  {deletingId === expense.id ? '...' : 'Delete'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
      {/* Receipt preview dialog */}
      {receiptPreview && (
        <Dialog open={!!receiptPreview} onOpenChange={() => setReceiptPreview(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Receipt — {receiptPreview.description}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4">
              {receiptPreview.url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={receiptPreview.url}
                  alt="Receipt"
                  className="max-w-full max-h-[60vh] rounded-md object-contain"
                />
              ) : (
                <iframe
                  src={receiptPreview.url}
                  className="w-full h-[60vh] rounded-md border"
                  title="Receipt"
                />
              )}
              <a
                href={receiptPreview.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary underline"
              >
                Open in new tab
              </a>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
