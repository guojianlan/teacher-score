import { redirect } from 'next/navigation';
import { apiServer } from '@/lib/api-server';
import { AppShell } from './_shell';

interface Me {
  user: { id: string; email: string };
  organization: { id: string; name: string; isPersonal: boolean; subscriptionTier: string; monthlyQuota: number } | null;
  quota: { yearMonth: string; gradingsUsed: number; tokensUsed: number; costCents: number };
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await apiServer<Me>('/api/me');
  if (!me) redirect('/sign-in');

  return <AppShell me={me}>{children}</AppShell>;
}
