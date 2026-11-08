import { render, screen } from '@testing-library/react';
import { LlmQuotaBadge } from './llm-quota-badge';
import { C } from '@/lib/colors';
import type { LlmQuotaInfo } from '@/lib/llm-quota';

const q: LlmQuotaInfo = {
  quota: 'per_ip_daily',
  limit: 20,
  resetsAt: null,
  reason: 'quota_store_unavailable',
  callsOnMock: 2,
  source: 'run',
};

describe('LlmQuotaBadge', () => {
  it('is a visible-text live region in the warning colour', () => {
    render(<LlmQuotaBadge quota={q} />);
    const badge = screen.getByRole('status');
    expect(badge).toHaveTextContent(
      'LLM quota reached: mock responses (quota store unavailable) · 2 calls on mock',
    );
    expect(badge).toHaveStyle({ color: C.amber });
    expect(badge).not.toHaveAttribute('title');
  });

  it('compact is a short visible chip with no live region', () => {
    render(<LlmQuotaBadge quota={q} compact />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('LLM quota: mock responses')).toBeInTheDocument();
  });
});
