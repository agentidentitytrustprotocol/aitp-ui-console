'use client';

import { SectionError } from '@/components/shared/section-error';

export default function DashboardError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SectionError section="Dashboard" {...props} />;
}
