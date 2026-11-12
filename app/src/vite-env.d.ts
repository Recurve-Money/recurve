/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NETWORK?: "mainnet" | "testnet";
  readonly VITE_RPC_URL?: string;
  readonly VITE_WALLETCONNECT_ID?: string;
  readonly VITE_REGISTRY?: string;
  readonly VITE_RECURVE_TOKEN?: string;
  readonly VITE_DEPLOY_BLOCK?: string;
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
