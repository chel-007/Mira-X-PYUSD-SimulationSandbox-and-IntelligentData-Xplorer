import { JsonRpcProvider, Contract, parseUnits, Signer } from 'ethers';
import { useWalletClient } from 'wagmi';
import { encodeFunctionData } from 'viem';
import { useSendTransaction } from 'wagmi';

const PYUSD_MAINNET_ADDRESS = '0x6c3ea9036406852006290770bedfcaba0e23a0e8';
const PYUSD_SEPOLIA_ADDRESS = '0xcac524bca292aaade2df8a05cc58f0a65b1b3bb9';
const CURVE_POOL_PYUSD_CRVUSD = '0x625e92624bc2d88619accc1788365a69767f6200';
const CURVE_POOL_PYUSD_USDC = '0x383e6b4437b59fff47b619cba855ca29342a8559';


const erc20Abi = [
  {
    constant: false,
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    type: 'function',
  },
  {
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    type: 'function',
  },
];

const curvePoolAbi = [
  {
    name: 'exchange',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'i', type: 'int128' },
      { name: 'j', type: 'int128' },
      { name: 'dx', type: 'uint256' },
      { name: 'min_dy', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
];

export const useTransactionSimulation = (rpcUrl: any) => {
  const { data: walletClient } = useWalletClient();
  const provider = new JsonRpcProvider(rpcUrl);
  const { sendTransaction } = useSendTransaction();

  console.log("rpcurl", rpcUrl)

  const simulateTransfer = async (from: string, to: string, amount: string, isMainnet: boolean) => {
    const contractAddress = isMainnet ? PYUSD_MAINNET_ADDRESS : PYUSD_SEPOLIA_ADDRESS;

    // Check balance
    const balanceData = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [from],
    });
    const balanceRaw = await provider.call({ to: contractAddress, data: balanceData });
    const balance = BigInt(balanceRaw);
    const amountWei = parseUnits(amount, 6);

    console.log(`Balance: ${balance}, Amount: ${amountWei}`); // Debug balance
    if (balance < amountWei) {
      throw new Error(`Insufficient PYUSD balance: ${balance} < ${amountWei}`);
    }

    console.log('Simulating transfer...');
    const transferTx = {
      from,
      to: contractAddress,
      value: 0,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: 'transfer',
        args: [to, amountWei],
      }),
    };

    const gasEstimate = await provider.estimateGas(transferTx);
  
    // Manually fetch gas price via eth_gasPrice
    const gasPriceHex = await provider.send('eth_gasPrice', []);
    const feeData = await provider.getFeeData(); // v6 method
    const gasPrice = feeData.gasPrice || BigInt(await provider.send('eth_gasPrice', []));
  
    const simulationResult = await provider.call(transferTx);

    return {
      gasEstimate: gasEstimate.toString(), // Units
      gasPrice: gasPrice.toString(),
      amount: amount,
      simulationResult,
    };
  };

  const sendTransfer = async (to: string, amount: string, isMainnet: boolean) => {
    if (!walletClient) throw new Error('Wallet not connected');

    const contractAddress = isMainnet ? PYUSD_MAINNET_ADDRESS : PYUSD_SEPOLIA_ADDRESS;
    
    // Prepare the transaction data
    const txData = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [to, parseUnits(amount, 6)],
    });

    console.log('Sending transfer to:', to, 'Amount:', amount);

    const txHash = await walletClient.sendTransaction({
      to: contractAddress,
      data: txData,
      value: 0n,
    });
    console.log('Transaction sent, hash:', txHash);

    if (!txHash || typeof txHash !== 'string') {
      throw new Error('Invalid transaction hash: ' + txHash);
    }

    // Wait using the GCP provider
    const receipt = await provider.waitForTransaction(txHash, 1, 30000);
    if (!receipt) throw new Error('Transaction receipt not found');
    console.log('Transaction confirmed, receipt:', receipt);

    return { txHash: receipt.hash };
  };

  const simulateSwap = async (
    from: string,
    to: string,
    amountIn: string,
    isMainnet: boolean,
    tokenIn: string,
    poolMetricsData: any[]
  ) => {
    const poolConfig = {
      USDC: { address: CURVE_POOL_PYUSD_USDC, decimals: 6, tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' }, // USDC Mainnet address
      crvUSD: { address: CURVE_POOL_PYUSD_CRVUSD, decimals: 18, tokenAddress: '0xf939E0A03FB07F59A73314E73794Be0E57ac1b4E' }, // crvUSD Mainnet address
    };

    const config = poolConfig[tokenIn];
    if (!config) {
      throw new Error(`Unsupported token: ${tokenIn}`);
    }

    const amountInWei = parseUnits(amountIn, config.decimals);
    const tokenContractAddress = isMainnet ? config.tokenAddress : config.tokenAddress; // Adjust for Sepolia if needed

    // Check balance
    const balanceData = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [from],
    });
    const balanceRaw = await provider.call({ to: tokenContractAddress, data: balanceData });
    const balance = BigInt(balanceRaw);
    if (balance < amountInWei) {
      throw new Error(`Insufficient ${tokenIn} balance: ${balance} < ${amountInWei}`);
    }

    // Prepare swap transaction
    const i = tokenIn === 'USDC' ? 1 : 0; // Index of tokenIn
    const j = tokenIn === 'USDC' ? 0 : 1; // Index of PYUSD
    const swapTx = {
      from,
      to: config.address,
      value: 0,
      data: encodeFunctionData({
        abi: curvePoolAbi,
        functionName: 'exchange',
        args: [i, j, amountInWei, 0],
      }),
    };

    // Simulate with overridden state (mock approval)
    const gasEstimate = await provider.estimateGas({
      ...swapTx,
      // Optional: Uncomment if you want to simulate approval explicitly
      // stateOverride: {
      //   [tokenContractAddress]: {
      //     stateDiff: {
      //       [`keccak256(encodePacked(from, poolAddress))`]: amountInWei.toString(), // Mock allowance
      //     },
      //   },
      // },
    });
    const gasPrice = (await provider.getFeeData()).gasPrice || BigInt(await provider.send('eth_gasPrice', []));

    // Calculate slippage and amount out using poolMetricsData
    const pool = poolMetricsData.find((p) => p.pool_address.toLowerCase() === config.address.toLowerCase());
    if (!pool) {
      throw new Error('Pool data not available');
    }

    const tvl = pool.tvl_usd;
    const volume24h = pool.total_volume_usd;
    const amountInNum = parseFloat(amountIn);
    const amountInUsd = amountInNum; // Stablecoin 1:1 USD
    const reserveUsd = tvl / 2;
    const priceImpact = amountInUsd / (reserveUsd + amountInUsd);
    const volumeFactor = volume24h / tvl;
    let slippage = priceImpact * (1 + volumeFactor);
    slippage = Math.min(slippage, 0.001);

    const amountOut = amountInNum * (1 - slippage);

    return {
      gasEstimate: gasEstimate.toString(),
      gasPrice: gasPrice.toString(),
      amountIn,
      tokenIn,
      amountOut: amountOut.toFixed(6),
      slippage: (slippage * 100).toFixed(2) + '%',
    };
  };

  return { simulateTransfer, simulateSwap, sendTransfer };
};