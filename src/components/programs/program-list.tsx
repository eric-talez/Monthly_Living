import type { PublicProgramSummary } from '@/modules/programs/types';

import { ProgramCard } from './program-card';

export function ProgramList({ items, locale }: { items: PublicProgramSummary[]; locale: string }) {
  return (
    <ul role="list" className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((program) => (
        <li key={program.id} className="h-full">
          <ProgramCard program={program} locale={locale} />
        </li>
      ))}
    </ul>
  );
}
