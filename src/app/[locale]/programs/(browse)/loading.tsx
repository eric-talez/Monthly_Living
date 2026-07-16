import { Container } from '@/components/ui/container';

/** 목록 로딩 스켈레톤(App Router loading UI). */
export default function ProgramsLoading() {
  return (
    <Container>
      <section className="py-12 sm:py-16" aria-hidden="true">
        <div className="bg-muted h-9 w-64 max-w-full animate-pulse" />
        <div className="bg-muted mt-3 h-5 w-96 max-w-full animate-pulse" />
        <div className="border-border mt-8 border-b pb-6">
          <div className="bg-muted h-10 w-full max-w-md animate-pulse" />
        </div>
        <ul role="list" className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <li key={`skeleton-${index}`} className="border-border bg-surface border">
              <div className="bg-muted aspect-[3/2] w-full animate-pulse" />
              <div className="space-y-3 p-5">
                <div className="bg-muted h-4 w-24 animate-pulse" />
                <div className="bg-muted h-5 w-3/4 animate-pulse" />
                <div className="bg-muted h-4 w-full animate-pulse" />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </Container>
  );
}
