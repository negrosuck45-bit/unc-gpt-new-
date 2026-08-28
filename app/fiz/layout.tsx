import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'fiz',
};

export default function FizLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}  