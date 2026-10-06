import { requireUser } from '@/lib/auth/session';
import { StudentDashboard } from '@/components/dashboard/student-dashboard';
import { PhysioDashboard } from '@/components/dashboard/physio-dashboard';
import { CoachDashboard } from '@/components/dashboard/coach-dashboard';

export const metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const user = await requireUser();
  if (user.role === 'physio') return <PhysioDashboard user={user} />;
  return user.role === 'coach' ? <CoachDashboard user={user} /> : <StudentDashboard user={user} />;
}
