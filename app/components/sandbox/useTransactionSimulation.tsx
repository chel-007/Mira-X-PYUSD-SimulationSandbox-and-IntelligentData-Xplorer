import { JsonRpcProvider, Contract, parseUnits, Signer } from 'ethers';
import { useWalletClient } from 'wagmi';
import { encodeFunctionData } from 'viem';
import { useSendTransaction } from 'wagmi';

const PYUSD_MAINNET_ADDRESS = '0x6c3ea9036406852006290770bedfcaba0e23a0e8';
const PYUSD_SEPOLIA_ADDRESS = '0xcac524bca292aaade2df8a05cc58f0a65b1b3bb9';
const CURVE_POOL_PYUSD_CRVUSD = '0x625e92624bc2d88619accc1788365a69767f6200'; // PYUSD/crvUSD
const CURVE_POOL_PYUSD_USDC = '0x383e6b4437b59fff47b619cba855ca29342a8559'; // PYUSD/USDC


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
    tokenIn: string
  ) => {
    // console.log('Simulating swap...', { from, to, amountIn, tokenIn });

    // Map tokenIn to pool address and decimals
    const poolConfig = {
      USDC: { address: CURVE_POOL_PYUSD_USDC, decimals: 6, abi: curvePoolAbi },
      crvUSD: { address: CURVE_POOL_PYUSD_CRVUSD, decimals: 18, abi: curvePoolAbi },
    };

    const config = poolConfig[tokenIn];
    if (!config) {
      throw new Error(`Unsupported token: ${tokenIn}`);
    }

    const amountInWei = parseUnits(amountIn, config.decimals);
    const pyusdAddress = isMainnet ? PYUSD_MAINNET_ADDRESS : PYUSD_SEPOLIA_ADDRESS;

    let swapTx;
    if (tokenIn === 'USDT') {
      // Uniswap swap (assuming tokenIn is token0, PYUSD is token1)
      swapTx = {
        from,
        to: config.address,
        value: '0',
        data: encodeFunctionData({
          abi: config.abi,
          functionName: 'swap',
          args: [
            to, // Recipient
            true, // zeroForOne (tokenIn → PYUSD)
            amountInWei, // amountSpecified
            0, // sqrtPriceLimitX96 (no limit for simulation)
            '0x',
          ],
        }),
      };
    } else {
      // Curve swap (USDC or crvUSD → PYUSD)
      const i = tokenIn === 'USDC' ? 1 : 0; // Index of tokenIn in pool
      const j = tokenIn === 'USDC' ? 0 : 1; // Index of PYUSD in pool
      swapTx = {
        from,
        to: config.address,
        value: 0,
        data: encodeFunctionData({
          abi: config.abi,
          functionName: 'exchange',
          args: [
            i, // Token in index
            j, // Token out index
            amountInWei,
            0, // min_dy (no minimum for simulation)
          ],
        }),
      };
    }

    try {
      const gasEstimate = await provider.estimateGas(swapTx);
      console.log('Swap Gas Estimate:', gasEstimate.toString());

      return {
        gasEstimate: gasEstimate.toString(),
        amountIn,
        tokenIn,
      };
    } catch (error) {
      console.error('Swap simulation failed:', error);
      throw new Error('Failed to simulate swap');
    }
  };

  return { simulateTransfer, simulateSwap, sendTransfer };
};