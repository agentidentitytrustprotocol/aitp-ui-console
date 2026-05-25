export const serverConfig = {
  playgroundUrl: process.env.PLAYGROUND_URL ?? 'http://localhost:8000',
  playgroundApiKey: process.env.PLAYGROUND_API_KEY ?? '',
  cpUrl: process.env.CP_URL ?? 'http://localhost:4000',
  cpApiKey: process.env.CP_API_KEY ?? '',
};

export const clientConfig = {
  appName: 'AITP Console',
  version: '0.1.0',
};
