import { requireUser } from '@/lib/auth/session';
import { StudentDashboard } from '@/components/dashboard/student-dashboard';
import { CoachDashboard } from '@/components/dashboard/coach-dashboard';

export const metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const user = await requireUser();
  return user.role === 'coach' ? <CoachDashboard user={user} /> : <StudentDashboard user={user} />;
}
