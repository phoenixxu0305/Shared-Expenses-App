import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { sendNewInviteRequestEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  try {
    const { email, note } = await request.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();

    const { error } = await serviceClient
      .from('invite_requests')
      .insert({ email, note: note || null });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Notify admins via email
    const { data: admins } = await serviceClient
      .from('profiles')
      .select('id')
      .eq('role', 'admin');

    if (admins) {
      for (const admin of admins) {
        try {
          const { data: authUser } = await serviceClient.auth.admin.getUserById(admin.id);
          if (authUser?.user?.email) {
            await sendNewInviteRequestEmail(authUser.user.email, email, note || null);
          }
        } catch {
          // Skip if email send fails
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
