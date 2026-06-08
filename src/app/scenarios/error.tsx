'use client';

import { SectionError } from '@/components/shared/section-error';

export default function ScenariosError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SectionError section="Scenarios" {...props} />;
}
