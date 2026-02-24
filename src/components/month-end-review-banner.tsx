'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { MonthEndReview } from '@/types/database';
import { resolveMonthEndReview } from '@/app/(dashboard)/team/actions';

interface MonthEndReviewBannerProps {
  review: MonthEndReview;
  currentWeekId: string;
  onResolved: () => void;
}

export function MonthEndReviewBanner({ review, currentWeekId, onResolved }: MonthEndReviewBannerProps) {
  const [loading, setLoading] = useState<'carry_over' | 'save' | null>(null);

  async function handleDecision(decision: 'carry_over' | 'save') {
    setLoading(decision);
    const result = await resolveMonthEndReview({
      reviewId: review.id,
      decision,
      currentWeekId,
    });
    setLoading(null);
    if (result.error) {
      alert(result.error);
    } else {
      onResolved();
    }
  }

  return (
    <Card className="border-yellow-400 bg-yellow-50 dark:bg-yellow-950/20">
      <CardContent className="pt-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-yellow-800 dark:text-yellow-200">
              Month-End Review: {review.month_label}
            </p>
            <p className="text-sm text-yellow-700 dark:text-yellow-300">
              Unspent surplus of <strong>&euro;{Number(review.surplus_amount).toFixed(2)}</strong> from last month.
              Carry over to this week&apos;s budget or save?
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              disabled={loading !== null}
              onClick={() => handleDecision('save')}
            >
              {loading === 'save' ? 'Saving...' : 'Save'}
            </Button>
            <Button
              size="sm"
              disabled={loading !== null}
              onClick={() => handleDecision('carry_over')}
            >
              {loading === 'carry_over' ? 'Carrying Over...' : 'Carry Over'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
