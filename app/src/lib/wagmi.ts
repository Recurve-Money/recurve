import {getDefaultConfig} from "@rainbow-me/rainbowkit";
import {http} from "wagmi";
import {robinhood} from "./chain";

/**
 * WalletConnect needs a project id. Without one RainbowKit still renders the
 * injected connectors, so MetaMask keeps working and only the QR flow drops out.
 * That degrades better than throwing on boot.
 */
const projectId = import.meta.env.VITE_WALLETCONNECT_ID ?? "";

export const wagmiConfig = getDefaultConfig({
  appName: "Recurve",
  projectId: projectId || "00000000000000000000000000000000",
  chains: [robinhood],
  transports: {
    [robinhood.id]: http(),
  },
  ssr: false,
});
