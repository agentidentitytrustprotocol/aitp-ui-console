'use client';

import { SectionError } from '@/components/shared/section-error';

export default function RegistryError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SectionError section="Registry" {...props} />;
}
