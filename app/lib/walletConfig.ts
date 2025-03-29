// lib/walletConfig.tsx
import { createAppKit } from '@reown/appkit';
import { mainnet } from 'wagmi/chains';
import { EthersAdapter } from '@reown/appkit-adapter-ethers';

// Load projectId from environment variable
const projectId = process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID;

if (!projectId) {
  throw new Error('NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID is not set in .env');
}

export const walletModal = createAppKit({
  adapters: [new EthersAdapter()],
  projectId: projectId,
  networks: [mainnet],
  enableWalletConnect: false,
  metadata: {
    name: 'Mira X',
    description: 'AppKit Example',
    url: 'http://localhost:3000/sandbox',
    icons: ['https://assets.reown.com/reown-profile-pic.png'],
  },
});