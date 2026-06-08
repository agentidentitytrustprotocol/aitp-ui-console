'use client';

import { SectionError } from '@/components/shared/section-error';

export default function RunsError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SectionError section="Runs" {...props} />;
}
