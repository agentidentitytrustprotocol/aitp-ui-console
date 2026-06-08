'use client';

import { SectionError } from '@/components/shared/section-error';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SectionError error={error} reset={reset} />;
}
