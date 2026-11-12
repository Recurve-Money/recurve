import React from "react";
import ReactDOM from "react-dom/client";
import {WagmiProvider} from "wagmi";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {RainbowKitProvider, lightTheme} from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import "./index.css";
import App from "./App";
import {wagmiConfig} from "./lib/wagmi";

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          // Pinned: RainbowKit otherwise translates its own UI to the visitor's
          // browser language, so the connect button reads in whatever locale the
          // machine is set to while the rest of the app stays English.
          locale="en-US"
          theme={lightTheme({
            accentColor: "#0A0A0A",
            accentColorForeground: "#fff",
            borderRadius: "large",
            fontStack: "system",
          })}
        >
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
);
