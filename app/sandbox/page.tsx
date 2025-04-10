// Sandbox.tsx
"use client";

import React, { useState, useEffect } from 'react';
import styles from "../styles/Sandbox.module.css";
import style1 from "../styles/Home.module.css";
import { useRouter } from 'next/navigation';
import "../globals.css";
import { ReactFlowProvider, Node, Edge } from '@xyflow/react';
// import dynamic from 'next/dynamic';
// const Transactions = dynamic(() => import('../components/sandbox/Transactions'), {
//   ssr: false,
//   loading: () => <div className={styles.centerButton}><i className="fa-duotone fa-thin fa-spinner-scale"></i></div>,
// });
// const Wallets = dynamic(() => import('../components/sandbox/Wallets'), { ssr: false });
import Transactions from '../components/sandbox/Transactions';
import Wallets from '../components/sandbox/Wallets';
import Developers from '../components/connect/Developers';
import { WagmiProvider } from 'wagmi';
import { http, createConfig } from 'wagmi';
import { mainnet, sepolia } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SimulationProvider } from "../utils/SimulationContext";
import { walletModal } from '../lib/walletConfig'; // Import your config

const gcpProjectId = process.env.NEXT_PUBLIC_GOOGLE_CLOUD_PROJECT_ID;
const gcpApiKey = process.env.NEXT_PUBLIC_GOOGLE_CLOUD_KEY;

const MAINNET_RPC_URL = `https://blockchain.googleapis.com/v1/projects/${gcpProjectId}/locations/us-central1/endpoints/ethereum-mainnet/rpc?key=${gcpApiKey}`;
const SEPOLIA_RPC_URL = `https://blockchain.googleapis.com/v1/projects/${gcpProjectId}/locations/us-central1/endpoints/ethereum-sepolia/rpc?key=${gcpApiKey}`;

// Wagmi and Query setup
const queryClient = new QueryClient();
// const chains = [mainnet, sepolia];
const config = createConfig({
  chains: [mainnet, sepolia],
  transports: {
    [mainnet.id]: http(MAINNET_RPC_URL),
    [sepolia.id]: http(SEPOLIA_RPC_URL),
  },
});

type CustomNode = Node<any>;
type CustomEdge = Edge<any>;

const Sandbox = () => {
  const router = useRouter();
  const [activeTab, setActiveTabMain] = useState<'transactions' | 'wallets' | 'developers'>('transactions');
  const [nodes, setNodes] = useState<CustomNode[]>([]);
  const [edges, setEdges] = useState<CustomEdge[]>([]);
  const [mockAddress, setMockAddress] = useState<string | null>(null);

  useEffect(() => {
    const queryTab = new URLSearchParams(window.location.search).get('tab');
    if (queryTab === 'developers' || queryTab === 'wallets') {
      setActiveTabMain(queryTab);
    }
  }, []); // Empty dependency array to run only on mount

  const handleTabChange = (tab: 'transactions' | 'wallets' | 'developers') => {
    setActiveTabMain(tab);
    setNodes([]);
    setEdges([]);
    
    router.replace(`/sandbox?tab=${tab}`, undefined, { shallow: true });
  };

  const handleExploreClick = () => {
    router.push("/explore")
  console.log("clicked");
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'transactions':
        return <SimulationProvider><Transactions setNodes={setNodes} setEdges={setEdges} nodes={nodes} edges={edges} setActiveTabMain={setActiveTabMain}
        mockAddress={mockAddress} setMockAddress={setMockAddress} />;</SimulationProvider>
      case 'wallets':
        return <Wallets mockAddress={mockAddress} setMockAddress={setMockAddress} />;
      case 'developers':
        return <Developers />;
      default:
        return null;
    }
  };

  return (
    
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <div className={styles.container}>
          <div className={styles.topBar}>
          <div className={styles.appContainer}>
              <h1 className={style1.appName}>
                Mira <span>X</span>
              </h1>
              <div className={style1.betaBadge}>BETA</div>
            </div>
            <button onClick={() => router.push('/')} className={styles.homeButton}>
              <i className="fa-solid fa-home"></i>
            </button>
            <button onClick={handleExploreClick} className={styles.sandboxStatus}>
              <span className={styles.back}><i className="fa-thin fa-arrow-left"></i></span> Intelligent Data
            </button>
          </div>

          <div className={styles.sandboxContainer}>
            <div className={styles.dashboard}>
              <div
                className={`${styles.card} ${activeTab === 'transactions' ? styles.active : ''}`}
                onClick={() => handleTabChange('transactions')}
              >
                <h2>Transactions</h2>
              </div>
              <div
                className={`${styles.card} ${activeTab === 'wallets' ? styles.active : ''}`}
                onClick={() => handleTabChange('wallets')}
              >
                <h2>Wallets</h2>
              </div>
              <div
                className={`${styles.card} ${activeTab === 'developers' ? styles.active : ''}`}
                onClick={() => handleTabChange('developers')}
              >
                <h2>Developers</h2>
              </div>
            </div>
            <div className={styles.canvas}>
              <ReactFlowProvider>
                {/* <SimulationProvider> */}
                {renderTabContent()}
                {/* </SimulationProvider> */}
              </ReactFlowProvider>
            </div>
          </div>
        </div>
      </QueryClientProvider>
    </WagmiProvider>
  );
};

export default Sandbox;