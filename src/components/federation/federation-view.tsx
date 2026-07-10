'use client';

import { useState } from 'react';
import {
  ChevronDown,
  Globe,
  Network,
  Play,
  Send,
  Server,
  Share2,
  Trash2,
} from 'lucide-react';
import { Card, SectionTitle } from '@/components/shared/card';
import { LoadingSkeleton, InlineSpinner } from '@/components/shared/loading-skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import {
  useHostAgent,
  useHostedAgents,
  useInvokeHosted,
  useResolveAndHandshake,
  useStopHostedAgent,
} from '@/hooks/use-hosted-agents';
import { C } from '@/lib/colors';
import type { HostedAgent } from '@/lib/types/playground';

const baseInput: React.CSSProperties = {
  width: '100%',
  background: C.bg3,
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  padding: '8px 10px',
  color: C.text,
  fontSize: 13,
  outline: 'none',
};

function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      style={{
        fontSize: 11,
        color: C.textDim,
        display: 'block',
        marginBottom: 6,
        textTransform: 'lowercase',
      }}
    >
      {children}
    </label>
  );
}

function PrimaryButton({
  loading,
  icon: Icon,
  children,
}: {
  loading?: boolean;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      style={{
        width: '100%',
        background: C.teal,
        border: 'none',
        borderRadius: 6,
        padding: '10px',
        color: '#fff',
        fontSize: 13,
        fontWeight: 600,
        cursor: loading ? 'wait' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        opacity: loading ? 0.7 : 1,
        marginTop: 8,
      }}
    >
      {loading ? <InlineSpinner color="#fff" /> : <Icon size={14} color="#fff" />}
      {children}
    </button>
  );
}

function ErrorBanner({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div
      style={{
        background: C.red + '15',
        border: `1px solid ${C.red}40`,
        borderRadius: 6,
        padding: '8px 10px',
        fontSize: 12,
        color: C.red,
        marginBottom: 12,
        wordBreak: 'break-word',
      }}
    >
      {String(error)}
    </div>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre
      className="mono"
      style={{
        background: C.bg3,
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        padding: 10,
        fontSize: 11,
        color: C.textDim,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        margin: '8px 0 0',
        maxHeight: 260,
        overflow: 'auto',
      }}
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

// --- Host form ------------------------------------------------------------

function HostAgentForm() {
  const host = useHostAgent();
  const [ref, setRef] = useState('');
  const [publicHost, setPublicHost] = useState('');
  const [publicScheme, setPublicScheme] = useState('');
  const [signingSuite, setSigningSuite] = useState('');
  const [port, setPort] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ref.trim()) return;
    host.mutate(
      {
        ref: ref.trim(),
        public_host: publicHost.trim() || undefined,
        public_scheme: publicScheme.trim() || undefined,
        signing_suite: signingSuite.trim() || undefined,
        port: port.trim() ? Number(port) : undefined,
      },
      {
        onSuccess: () => {
          setRef('');
          setPublicHost('');
          setPublicScheme('');
          setSigningSuite('');
          setPort('');
        },
      },
    );
  }

  return (
    <Card style={{ padding: 18 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 16,
          fontSize: 14,
          fontWeight: 600,
          color: C.text,
        }}
      >
        <Server size={15} color={C.teal} /> Host an agent
      </div>
      <ErrorBanner error={host.error} />
      <form onSubmit={submit}>
        <div style={{ marginBottom: 14 }}>
          <Label htmlFor="host-ref">ref *</Label>
          <input
            id="host-ref"
            type="text"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder="pack/agent@version"
            required
            style={baseInput}
          />
        </div>
        <div style={{ marginBottom: 14 }}>
          <Label htmlFor="host-public-host">public_host</Label>
          <input
            id="host-public-host"
            type="text"
            value={publicHost}
            onChange={(e) => setPublicHost(e.target.value)}
            placeholder="org-a.example.com"
            style={baseInput}
          />
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <Label htmlFor="host-public-scheme">public_scheme</Label>
            <input
              id="host-public-scheme"
              type="text"
              value={publicScheme}
              onChange={(e) => setPublicScheme(e.target.value)}
              placeholder="https"
              style={baseInput}
            />
          </div>
          <div style={{ width: 96 }}>
            <Label htmlFor="host-port">port</Label>
            <input
              id="host-port"
              type="number"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="auto"
              style={baseInput}
            />
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <Label htmlFor="host-signing-suite">signing_suite</Label>
          <input
            id="host-signing-suite"
            type="text"
            value={signingSuite}
            onChange={(e) => setSigningSuite(e.target.value)}
            placeholder="default"
            style={baseInput}
          />
        </div>
        <PrimaryButton loading={host.isPending} icon={Play}>
          {host.isPending ? 'Hosting…' : 'Host agent'}
        </PrimaryButton>
      </form>
    </Card>
  );
}

// --- Per-agent metadata + interaction panel -------------------------------

function MetaRow({ label, value, mono = true }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 10, fontSize: 12, lineHeight: 1.6 }}>
      <span style={{ color: C.textMuted, minWidth: 92, flexShrink: 0 }}>{label}</span>
      <span
        className={mono ? 'mono' : undefined}
        style={{ color: C.textDim, wordBreak: 'break-all' }}
      >
        {value ?? '—'}
      </span>
    </div>
  );
}

function HandshakePanel({ agent }: { agent: HostedAgent }) {
  const handshake = useResolveAndHandshake();
  const [peerDid, setPeerDid] = useState('');
  const [grants, setGrants] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!peerDid.trim()) return;
    const requested = grants
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean);
    handshake.mutate({
      id: agent.hosted_id,
      body: {
        peer_did: peerDid.trim(),
        requested_grants: requested.length > 0 ? requested : undefined,
      },
    });
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          fontWeight: 600,
          color: C.text,
          marginBottom: 10,
        }}
      >
        <Share2 size={13} color={C.blue} /> Resolve &amp; handshake
      </div>
      <ErrorBanner error={handshake.error} />
      <form onSubmit={submit}>
        <div style={{ marginBottom: 12 }}>
          <Label htmlFor={`hs-did-${agent.hosted_id}`}>peer_did</Label>
          <input
            id={`hs-did-${agent.hosted_id}`}
            type="text"
            value={peerDid}
            onChange={(e) => setPeerDid(e.target.value)}
            placeholder="did:web:org-b.example.com"
            style={baseInput}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <Label htmlFor={`hs-grants-${agent.hosted_id}`}>requested_grants (comma-separated)</Label>
          <input
            id={`hs-grants-${agent.hosted_id}`}
            type="text"
            value={grants}
            onChange={(e) => setGrants(e.target.value)}
            placeholder="summarize, analyze"
            style={baseInput}
          />
        </div>
        <PrimaryButton loading={handshake.isPending} icon={Share2}>
          {handshake.isPending ? 'Handshaking…' : 'Resolve & handshake'}
        </PrimaryButton>
      </form>
      {handshake.data && <JsonBlock value={handshake.data} />}
    </div>
  );
}

function InvokePanel({ agent }: { agent: HostedAgent }) {
  const invoke = useInvokeHosted();
  const [peerPort, setPeerPort] = useState('');
  const [capability, setCapability] = useState('');
  const [payload, setPayload] = useState('');
  const [payloadError, setPayloadError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!peerPort.trim() || !capability.trim()) return;
    let parsed: unknown;
    if (payload.trim()) {
      try {
        parsed = JSON.parse(payload);
      } catch {
        setPayloadError('payload must be valid JSON');
        return;
      }
    }
    setPayloadError(null);
    invoke.mutate({
      id: agent.hosted_id,
      body: {
        peer_port: Number(peerPort),
        capability: capability.trim(),
        payload: parsed,
      },
    });
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          fontWeight: 600,
          color: C.text,
          marginBottom: 10,
        }}
      >
        <Send size={13} color={C.purple} /> Invoke capability
      </div>
      <ErrorBanner error={invoke.error} />
      <form onSubmit={submit}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <div style={{ width: 110 }}>
            <Label htmlFor={`iv-port-${agent.hosted_id}`}>peer_port</Label>
            <input
              id={`iv-port-${agent.hosted_id}`}
              type="number"
              value={peerPort}
              onChange={(e) => setPeerPort(e.target.value)}
              style={baseInput}
            />
          </div>
          <div style={{ flex: 1 }}>
            <Label htmlFor={`iv-cap-${agent.hosted_id}`}>capability</Label>
            <input
              id={`iv-cap-${agent.hosted_id}`}
              type="text"
              value={capability}
              onChange={(e) => setCapability(e.target.value)}
              placeholder="summarize"
              style={baseInput}
            />
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <Label htmlFor={`iv-payload-${agent.hosted_id}`}>payload (JSON, optional)</Label>
          <textarea
            id={`iv-payload-${agent.hosted_id}`}
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            placeholder='{ "text": "…" }'
            rows={4}
            style={{ ...baseInput, resize: 'vertical', fontFamily: 'JetBrains Mono', fontSize: 12 }}
          />
          {payloadError && (
            <div style={{ fontSize: 11, color: C.red, marginTop: 4 }}>{payloadError}</div>
          )}
        </div>
        <PrimaryButton loading={invoke.isPending} icon={Send}>
          {invoke.isPending ? 'Invoking…' : 'Invoke'}
        </PrimaryButton>
      </form>
      {invoke.data !== undefined && invoke.isSuccess && <JsonBlock value={invoke.data} />}
    </div>
  );
}

function HostedAgentCard({ agent }: { agent: HostedAgent }) {
  const stop = useStopHostedAgent();
  const [open, setOpen] = useState(false);

  return (
    <Card style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div className="mono" style={{ fontSize: 13, color: C.teal, marginBottom: 2 }}>
            {agent.ref}
          </div>
          <div className="mono" style={{ fontSize: 11, color: C.textMuted, wordBreak: 'break-all' }}>
            {agent.hosted_id}
          </div>
        </div>
        <button
          onClick={() => stop.mutate(agent.hosted_id)}
          disabled={stop.isPending}
          aria-label={`Stop ${agent.ref}`}
          title="Stop agent"
          style={{
            background: 'none',
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: '6px 8px',
            color: stop.isPending ? C.textMuted : C.red,
            cursor: stop.isPending ? 'wait' : 'pointer',
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          {stop.isPending ? <InlineSpinner color={C.textMuted} /> : <Trash2 size={13} />}
        </button>
      </div>

      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <MetaRow label="aid" value={agent.aid} />
        <MetaRow label="did" value={agent.did} />
        <MetaRow label="origin" value={agent.origin} />
        <MetaRow label="port" value={agent.port} />
        <MetaRow label="manifest" value={agent.manifest_url} />
        <MetaRow label="handshake" value={agent.handshake_url} />
        {agent.did_document_url && <MetaRow label="did_doc" value={agent.did_document_url} />}
      </div>

      {stop.error && (
        <div style={{ marginTop: 10 }}>
          <ErrorBanner error={stop.error} />
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          marginTop: 14,
          background: 'none',
          border: `1px solid ${C.border}`,
          borderRadius: 6,
          padding: '7px 10px',
          color: C.textDim,
          fontSize: 12,
          cursor: 'pointer',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Globe size={12} color={C.blue} /> Handshake &amp; invoke
        </span>
        <ChevronDown
          size={13}
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}
        />
      </button>

      {open && (
        <div
          style={{
            marginTop: 12,
            display: 'grid',
            gap: 20,
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          }}
        >
          <HandshakePanel agent={agent} />
          <InvokePanel agent={agent} />
        </div>
      )}
    </Card>
  );
}

// --- Top-level view -------------------------------------------------------

export function FederationView() {
  const { data, isLoading, error } = useHostedAgents();
  const agents = data?.hosted ?? [];

  return (
    <div className="anim-in">
      <SectionTitle
        icon={Network}
        title="Federation"
        sub={
          agents.length === 0
            ? 'Cross-org, did:web-resolved handshake demo'
            : `${agents.length} hosted agent${agents.length === 1 ? '' : 's'}`
        }
      />
      <div
        style={{
          display: 'grid',
          gap: 20,
          gridTemplateColumns: 'minmax(280px, 340px) 1fr',
          alignItems: 'start',
        }}
      >
        <HostAgentForm />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {isLoading ? (
            <Card style={{ padding: 16 }}>
              <LoadingSkeleton rows={3} />
            </Card>
          ) : error ? (
            <Card>
              <EmptyState
                title="Couldn't load hosted agents"
                description="Check the Playground connection in Config. Federation requires a playground built with the hosted-agents API."
              />
            </Card>
          ) : agents.length === 0 ? (
            <Card>
              <EmptyState
                icon={Network}
                title="No hosted agents"
                description="Host an agent to start a cross-org handshake. Point PLAYGROUND_URL at a playground running the federated/ compose stack."
              />
            </Card>
          ) : (
            agents.map((a) => <HostedAgentCard key={a.hosted_id} agent={a} />)
          )}
        </div>
      </div>
    </div>
  );
}
