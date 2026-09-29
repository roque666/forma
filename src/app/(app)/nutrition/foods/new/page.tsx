import { Card, PageHeader } from '@/components/ui/card';
import { FoodForm } from '@/components/nutrition/food-form';
import { createFoodAction } from '@/lib/actions/nutrition';

export const metadata = { title: 'Novo alimento' };

export default function NewFoodPage() {
  return (<><PageHeader title="Novo alimento" back={{ href: '/nutrition/foods', label: 'Alimentos' }} /><Card className="max-w-2xl"><FoodForm action={createFoodAction} /></Card></>);
}
