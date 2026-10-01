import { Camera, CalendarDays, CalendarRange, Dumbbell, Home, Scale, TrendingUp, User, Users, Utensils, type LucideIcon } from 'lucide-react';
import type { Role } from '@/lib/auth/session';

export interface NavItem { href: string; label: string; icon: LucideIcon }

const dashboard = { href: '/dashboard', label: 'Dashboard', icon: Home };
const workouts = { href: '/workouts', label: 'Treinos', icon: Dumbbell };
const progress = { href: '/progress', label: 'Progressão', icon: TrendingUp };
const nutrition = { href: '/nutrition', label: 'Nutrição', icon: Utensils };
const weight = { href: '/weight', label: 'Peso', icon: Scale };
const history = { href: '/history', label: 'Histórico', icon: CalendarDays };
const profile = { href: '/profile', label: 'Perfil', icon: User };
const calendar = { href: '/calendar', label: 'Calendário', icon: CalendarRange };
const photos = { href: '/photos', label: 'Fotos', icon: Camera };
const students = { href: '/students', label: 'Atletas', icon: Users };

export const NAV: Record<Role, { all: NavItem[]; primary: NavItem[]; more: NavItem[] }> = {
  student: {
    all: [dashboard, workouts, calendar, progress, nutrition, weight, photos, history, profile],
    primary: [dashboard, workouts, nutrition, progress],
    more: [calendar, weight, photos, history, profile],
  },
  coach: {
    all: [dashboard, students, workouts, nutrition, progress, history, profile],
    primary: [dashboard, students, workouts, nutrition],
    more: [progress, history, profile],
  },
};

export const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + '/');
