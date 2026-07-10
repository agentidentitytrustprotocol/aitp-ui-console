'use client';

import { SectionError } from '@/components/shared/section-error';

export default function FederationError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SectionError section="Federation" {...props} />;
}
