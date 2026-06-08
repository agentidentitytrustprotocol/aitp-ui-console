'use client';

import { SectionError } from '@/components/shared/section-error';

export default function AuditError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SectionError section="Audit" {...props} />;
}
