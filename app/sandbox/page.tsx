// Sandbox.tsx
"use client";

import React, { useState } from 'react';
import styles from "../styles/Sandbox.module.css";
import style1 from "../styles/Home.module.css";
// import style2 from "../styles/Explore.module.css";
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
import { WagmiProvider } from 'wagmi';
import { http, createConfig } from 'wagmi';
import { mainnet, sepolia } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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
  const [activeTab, setActiveTab] = useState('transactions');
  const [nodes, setNodes] = useState<CustomNode[]>([]);
  const [edges, setEdges] = useState<CustomEdge[]>([]);


  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setNodes([]);
    setEdges([]);
  };

  const handleExploreClick = () => {
    router.push("/explore")
  console.log("clicked");
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'transactions':
        return <Transactions setNodes={setNodes} setEdges={setEdges} nodes={nodes} edges={edges} />;
      case 'wallets':
        return <Wallets />;
      case 'liquidityPools':
        return (
          <div className={styles.centerButton}>
            <button onClick={() => console.log('Select Pool')}>
              Select Pool
            </button>
          </div>
        );
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
                className={`${styles.card} ${activeTab === 'liquidityPools' ? styles.active : ''}`}
                onClick={() => handleTabChange('liquidityPools')}
              >
                <h2>Liquidity Pools</h2>
              </div>
            </div>
            <div className={styles.canvas}>
              <ReactFlowProvider>
                {renderTabContent()}
              </ReactFlowProvider>
            </div>
          </div>
        </div>
      </QueryClientProvider>
    </WagmiProvider>
  );
};

export default Sandbox;