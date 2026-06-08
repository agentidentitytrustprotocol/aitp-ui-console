'use client';

import { SectionError } from '@/components/shared/section-error';

export default function ConfigError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SectionError section="Config" {...props} />;
}
