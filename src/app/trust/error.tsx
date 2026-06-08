'use client';

import { SectionError } from '@/components/shared/section-error';

export default function TrustError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SectionError section="Trust" {...props} />;
}
