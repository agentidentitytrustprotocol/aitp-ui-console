import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventCard, StepOutputCard, TrustFlowCard } from './event-cards';
import type { RunEvent } from '@/lib/types/playground';

const aid = 'aid:pubkey:A7mK9xP2nR4vQ8sL3tW6uY1jC5bE0fH';

function evt(overrides: Partial<RunEvent> & { type: string }): RunEvent {
  return { ts: 1_500, ...overrides };
}

describe('formatOffset (via the rendered timestamp)', () => {
  // agent.ready is the simplest card that shows the offset in the line.
  it.each([
    [0, '+0ms'],
    [999, '+999ms'],
    [1_000, '+1.0s'],
    [59_999, '+60.0s'],
    [60_000, '+1.0m'],
    [90_000, '+1.5m'],
  ])('renders ts=%i as %s', (ts, expected) => {
    render(<EventCard evt={evt({ type: 'agent.ready', ts, agent_id: 'a' })} />);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });
});

describe('EventCard type switch', () => {
  it('run.started shows the scenario ref badge', () => {
    const { container } = render(
      <EventCard evt={evt({ type: 'run.started', scenario_ref: 'demo/hello@1' })} />,
    );
    expect(screen.getByText('Scenario run started')).toBeInTheDocument();
    expect(screen.getByText('demo/hello@1')).toBeInTheDocument();
    expect(container).not.toHaveTextContent('+1.5s'); // no offset on this card
  });

  it('agent.spawning shows the agent, notes and a spinner', () => {
    const { container } = render(
      <EventCard evt={evt({ type: 'agent.spawning', agent_id: 'researcher', notes: 'crewai' })} />,
    );
    expect(container).toHaveTextContent('Spawning researcher (crewai)');
    expect(container.querySelector('svg[data-icon="Loader"]')).not.toBeNull();
    expect(container.querySelector('.pulse')).not.toBeNull();
  });

  it('agent.ready shows name, port and aid', () => {
    render(
      <EventCard evt={evt({ type: 'agent.ready', agent_id: 'researcher', port: 8100, aid })} />,
    );
    expect(screen.getByText('researcher')).toBeInTheDocument();
    expect(screen.getByText('ready')).toBeInTheDocument();
    expect(screen.getByText(':8100')).toBeInTheDocument();
    // AidCell shortens the aid and keeps the full value as the title.
    expect(screen.getByTitle(aid)).toBeInTheDocument();
  });

  it('agent.ready without a port omits the port chip', () => {
    const { container } = render(
      <EventCard evt={evt({ type: 'agent.ready', agent_id: 'solo' })} />,
    );
    expect(container).not.toHaveTextContent(':8');
  });

  it('trust.peers_resolved counts the peers', () => {
    render(
      <EventCard
        evt={evt({ type: 'trust.peers_resolved', peers: { a: 'http://a', b: 'http://b' } })}
      />,
    );
    expect(screen.getByText('Peer manifest URLs resolved (2)')).toBeInTheDocument();
  });

  it('trust.peers_resolved tolerates missing peers', () => {
    render(<EventCard evt={evt({ type: 'trust.peers_resolved' })} />);
    expect(screen.getByText('Peer manifest URLs resolved (0)')).toBeInTheDocument();
  });

  it('trust.establishing names both parties with a pulsing dot', () => {
    const { container } = render(
      <EventCard evt={evt({ type: 'trust.establishing', initiator: 'writer', target: 'editor' })} />,
    );
    expect(container).toHaveTextContent('writer ⇒ editor: establishing trust…');
    expect(container.querySelector('.pulse')).not.toBeNull();
  });

  it('trust.established renders the handshake flow card with grants', () => {
    const { container } = render(
      <EventCard
        evt={evt({
          type: 'trust.established',
          initiator: 'writer',
          target: 'editor',
          grants: ['summarize.text', 'write.doc'],
          jti: 'jti-0123456789abcdefXYZ',
        })}
      />,
    );
    expect(screen.getByText('Trust established')).toBeInTheDocument();
    expect(screen.getByText('AITP MUTUAL HANDSHAKE')).toBeInTheDocument();
    for (const msg of ['MUTUAL_HELLO', 'MUTUAL_HELLO_ACK', 'MUTUAL_COMMIT', 'MUTUAL_COMMIT_ACK + TCT']) {
      expect(screen.getByText(msg)).toBeInTheDocument();
    }
    expect(screen.getByText('summarize.text')).toBeInTheDocument();
    expect(screen.getByText('write.doc')).toBeInTheDocument();
    // jti is shortened to 18 chars + ellipsis
    expect(container).toHaveTextContent('jti-0123456789abcd…');
  });

  it('step.started shows step id, capability and agent with the zap dot', () => {
    const { container } = render(
      <EventCard
        evt={evt({ type: 'step.started', step_id: 'write', capability: 'write.doc', agent: 'writer' })}
      />,
    );
    expect(container).toHaveTextContent('Step write');
    expect(screen.getByText('write.doc')).toBeInTheDocument();
    expect(screen.getByText('on writer')).toBeInTheDocument();
    expect(container.querySelector('svg[data-icon="Zap"]')).not.toBeNull();
  });

  it('step.probing_no_trust warns about the expected 403', () => {
    render(<EventCard evt={evt({ type: 'step.probing_no_trust' })} />);
    expect(screen.getByText('Probing without TCT → expect 403')).toBeInTheDocument();
  });

  it('step.access_denied renders the red denial card', () => {
    const { container } = render(
      <EventCard evt={evt({ type: 'step.access_denied', capability: 'secrets.read' })} />,
    );
    expect(screen.getByText('403 Access Denied')).toBeInTheDocument();
    expect(screen.getByText('secrets.read')).toBeInTheDocument();
    expect(container.querySelector('svg[data-icon="XCircle"]')).not.toBeNull();
  });

  it('llm.started shows the model from the payload', () => {
    const { container } = render(
      <EventCard
        evt={evt({ type: 'llm.started', agent_id: 'writer', payload: { model: 'gpt-4o' } })}
      />,
    );
    expect(container).toHaveTextContent('writer calling gpt-4o…');
  });

  it('llm.started falls back to "LLM" when the model is not a string', () => {
    const { container } = render(
      <EventCard evt={evt({ type: 'llm.started', agent: 'writer', payload: { model: 42 } })} />,
    );
    expect(container).toHaveTextContent('writer calling LLM…');
  });

  it('llm.complete shows the token count when present', () => {
    const { container } = render(
      <EventCard
        evt={evt({ type: 'llm.complete', agent_id: 'writer', payload: { tokens_used: 1234 } })}
      />,
    );
    expect(container).toHaveTextContent('writer ✓ LLM call complete');
    expect(screen.getByText('1234 tokens')).toBeInTheDocument();
  });

  it('llm.complete omits the token chip without payload', () => {
    const { container } = render(
      <EventCard evt={evt({ type: 'llm.complete', agent_id: 'writer' })} />,
    );
    expect(container).not.toHaveTextContent('tokens');
  });

  it('step.complete shows the completion line and output card', () => {
    render(
      <EventCard
        evt={evt({ type: 'step.complete', step_id: 'write', agent: 'writer', result: { out: 'x' } })}
      />,
    );
    expect(screen.getByText('Step complete: write')).toBeInTheDocument();
    expect(screen.getByText(/STEP COMPLETE ·/)).toBeInTheDocument();
  });

  it('run.complete shows total elapsed seconds', () => {
    const { container } = render(<EventCard evt={evt({ type: 'run.complete', ts: 5_000 })} />);
    expect(screen.getByText('Run complete')).toBeInTheDocument();
    expect(container).toHaveTextContent('Total elapsed: 5.0s');
  });

  it('run.failed shows the error text', () => {
    render(<EventCard evt={evt({ type: 'run.failed', error: 'agent crashed on boot' })} />);
    expect(screen.getByText('Run failed')).toBeInTheDocument();
    expect(screen.getByText('agent crashed on boot')).toBeInTheDocument();
  });

  it('unknown event types fall back to the generic mono row instead of being dropped', () => {
    render(<EventCard evt={evt({ type: 'cp.webhook.delivered' })} />);
    const row = screen.getByText('cp.webhook.delivered');
    expect(row).toBeInTheDocument();
    expect(row).toHaveClass('mono');
    expect(screen.getByText('+1.5s')).toBeInTheDocument();
  });
});

describe('StepOutputCard', () => {
  const base = { type: 'step.complete', ts: 2_000, step_id: 'draft', agent: 'writer' };

  it('renders nothing when there is no result', () => {
    const { container } = render(<StepOutputCard evt={{ ...base, result: undefined }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('is collapsed until clicked, then shows primitive values as plain text', async () => {
    const user = userEvent.setup();
    render(<StepOutputCard evt={{ ...base, result: { summary: 'all good' } }} />);

    expect(screen.queryByText('all good')).not.toBeInTheDocument();
    await user.click(screen.getByText(/STEP COMPLETE ·/));

    const value = screen.getByText('all good');
    expect(value).toBeInTheDocument();
    expect(value).not.toHaveClass('mono'); // primitive branch
    expect(screen.getByText('summary')).toBeInTheDocument(); // uppercased via CSS only
  });

  it('pretty-prints object values as mono JSON', async () => {
    const user = userEvent.setup();
    render(
      <StepOutputCard evt={{ ...base, result: { data: { score: 9, tags: ['a'] } } }} />,
    );
    await user.click(screen.getByText(/STEP COMPLETE ·/));

    const json = screen.getByText((_, el) => {
      return el?.className === 'mono' && (el?.textContent ?? '').includes('"score": 9');
    });
    expect(json.textContent).toBe(JSON.stringify({ score: 9, tags: ['a'] }, null, 2));
  });
});

describe('TrustFlowCard', () => {
  it('falls back to "none" when the event carries no grants', () => {
    render(
      <TrustFlowCard evt={{ type: 'trust.established', ts: 100, initiator: 'a', target: 'b' }} />,
    );
    expect(screen.getByText('none')).toBeInTheDocument();
    expect(screen.queryByText('JTI')).not.toBeInTheDocument();
  });
});
