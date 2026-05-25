import { render, screen } from '@testing-library/react';
import { AgentStatusGrid } from './agent-status-grid';
import type { RunEvent } from '@/lib/types/playground';

const aid = 'aid:pubkey:A7mK9xP2nR4vQ8sL3tW6uY1jC5bE0fH';

describe('AgentStatusGrid', () => {
  it('shows the empty state when no events are present', () => {
    render(<AgentStatusGrid events={[]} />);
    expect(screen.getByText(/no agents yet/i)).toBeInTheDocument();
  });

  it('promotes the agent from spawning → ready as events arrive', () => {
    const events: RunEvent[] = [
      { type: 'agent.spawning', ts: 100, agent_id: 'researcher', notes: 'crewai' },
      { type: 'agent.ready', ts: 800, agent_id: 'researcher', aid, port: 8100 },
    ];
    render(<AgentStatusGrid events={events} />);

    expect(screen.getByText('researcher')).toBeInTheDocument();
    expect(screen.getByText('ready')).toBeInTheDocument();
    expect(screen.getByText('port :8100')).toBeInTheDocument();
  });

  it('flips a ready agent to active during a step and back to ready when it completes', () => {
    const events: RunEvent[] = [
      { type: 'agent.spawning', ts: 100, agent_id: 'writer' },
      { type: 'agent.ready', ts: 500, agent_id: 'writer', aid, port: 8101 },
      { type: 'step.started', ts: 1000, step_id: 'write', agent: 'writer' },
    ];
    const { rerender } = render(<AgentStatusGrid events={events} />);
    expect(screen.getByText('active')).toBeInTheDocument();

    rerender(
      <AgentStatusGrid
        events={[
          ...events,
          { type: 'step.complete', ts: 2000, step_id: 'write', agent: 'writer' },
        ]}
      />,
    );
    expect(screen.getByText('ready')).toBeInTheDocument();
  });
});
