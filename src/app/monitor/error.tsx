'use client';

import { SectionError } from '@/components/shared/section-error';

export default function MonitorError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SectionError section="Monitor" {...props} />;
}
