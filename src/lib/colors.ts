/** Single source of truth for design tokens — mirrors tailwind.config.ts so
 *  inline-styled components can read the same palette without round-tripping
 *  through utility classes. */
export const C = {
  bg0: '#080b12',
  bg1: '#0d1117',
  bg2: '#111828',
  bg3: '#151d2e',
  bg4: '#1a2236',
  border: '#1e2744',
  borderBright: '#253050',
  teal: '#0d9488',
  tealDim: '#0d948840',
  tealBright: '#14b8a6',
  blue: '#3b82f6',
  blueDim: '#3b82f620',
  amber: '#f59e0b',
  amberDim: '#f59e0b20',
  purple: '#8b5cf6',
  purpleDim: '#8b5cf620',
  green: '#22c55e',
  greenDim: '#22c55e20',
  red: '#ef4444',
  redDim: '#ef444420',
  yellow: '#eab308',
  text: '#c8d3e8',
  textDim: '#6b7fa8',
  textMuted: '#3d4f6a',
};

export function eventColor(type: string): string {
  if (type.startsWith('agent')) return C.tealBright;
  if (type.startsWith('handshake') || type.startsWith('trust')) return C.blue;
  if (type.startsWith('capability') || type.startsWith('step')) return C.amber;
  if (type.startsWith('tct') || type.startsWith('revoc')) return C.red;
  if (type.startsWith('run')) return C.purple;
  if (type.startsWith('llm')) return C.green;
  return C.textDim;
}

export function boundaryColor(boundary: string | null | undefined): string {
  if (boundary === 'intra_org') return C.blue;
  if (boundary === 'cross_org') return C.amber;
  if (boundary === 'cross_cloud') return C.purple;
  return C.textMuted;
}

export function statusColor(status: string | null | undefined): string {
  switch (status) {
    case 'active':
    case 'success':
    case 'complete':
      return C.green;
    case 'expired':
      return C.yellow;
    case 'running':
    case 'started':
      return C.blue;
    case 'failed':
      return C.red;
    case 'pending':
    case 'cancelled':
    case 'deregistered':
    default:
      return C.textMuted;
  }
}
