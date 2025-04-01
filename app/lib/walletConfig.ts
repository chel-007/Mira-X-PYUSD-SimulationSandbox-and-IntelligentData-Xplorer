// lib/walletConfig.tsx
import { createAppKit } from '@reown/appkit';
import { mainnet, sepolia } from 'wagmi/chains'; // Add sepolia
import { EthersAdapter } from '@reown/appkit-adapter-ethers';

const projectId = process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID;

if (!projectId) {
  throw new Error('NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID is not set in .env');
}

const gcpProjectId = process.env.NEXT_PUBLIC_GOOGLE_CLOUD_PROJECT_ID;
const gcpApiKey = process.env.NEXT_PUBLIC_GOOGLE_CLOUD_KEY;

const MAINNET_RPC_URL = `https://blockchain.googleapis.com/v1/projects/${gcpProjectId}/locations/us-central1/endpoints/ethereum-mainnet/rpc?key=${gcpApiKey}`;
const SEPOLIA_RPC_URL = `https://blockchain.googleapis.com/v1/projects/${gcpProjectId}/locations/us-central1/endpoints/ethereum-sepolia/rpc?key=${gcpApiKey}`;

export const walletModal = createAppKit({
  adapters: [new EthersAdapter()],
  projectId,
  networks: [mainnet, sepolia], // Add Sepolia
  enableWalletConnect: false, // Keep if you don’t need WalletConnect
  metadata: {
    name: 'Mira X',
    description: 'AppKit Example',
    url: 'http://localhost:3000/sandbox',
    icons: ['https://assets.reown.com/reown-profile-pic.png'],
  },
  transports: {
    [mainnet.id]: MAINNET_RPC_URL, // Match sandbox.tsx
    [sepolia.id]: SEPOLIA_RPC_URL,
  },
});