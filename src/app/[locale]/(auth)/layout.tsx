import { Container } from '@/components/ui/container';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <Container>
      <div className="mx-auto w-full max-w-md py-16 sm:py-20">{children}</div>
    </Container>
  );
}
