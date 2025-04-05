import { JsonRpcProvider } from 'ethers/providers';
import { parseUnits } from 'ethers';
import { encodeFunctionData } from 'viem';
import { useSendTransaction } from 'wagmi';

const PYUSD_MAINNET_ADDRESS = '0x6c3ea9036406852006290770bedfcaba0e23a0e8';
const PYUSD_SEPOLIA_ADDRESS = '0xcac524bca292aaade2df8a05cc58f0a65b1b3bb9';
const UNISWAP_POOL = '0xdd2e0d86a45e4ef9bd490c2809e6405720cc357c'; // PYUSD/USDT
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

const uniswapPoolAbi = [
  {
    name: 'swap',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'zeroForOne', type: 'bool' },
      { name: 'amountSpecified', type: 'int256' },
      { name: 'sqrtPriceLimitX96', type: 'uint160' },
      { name: 'data', type: 'bytes' },
    ],
    outputs: [
      { name: 'amount0', type: 'int256' },
      { name: 'amount1', type: 'int256' },
    ],
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
  const provider = new JsonRpcProvider(rpcUrl);
  const { sendTransaction } = useSendTransaction();

  console.log('RPC URL:', rpcUrl); // Debug RPC connection

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
        args: [to, amountWei], // PYUSD: 6 decimals
      }),
    };

    const gasEstimate = await provider.estimateGas(transferTx);
    const simulationResult = await provider.call(transferTx);
    console.log('Transfer Gas Estimate:', gasEstimate.toString());
    console.log('Transfer Simulation Result:', simulationResult);

    return {
      gasEstimate: gasEstimate.toString(),
      simulationResult,
    };
  };

  const simulateSwap = async (
    from: string,
    to: string,
    amountIn: string,
    isMainnet: boolean,
    tokenIn: string
  ) => {
    console.log('Simulating swap...', { from, to, amountIn, tokenIn });

    // Map tokenIn to pool address and decimals
    const poolConfig = {
      USDT: { address: UNISWAP_POOL, decimals: 6, abi: uniswapPoolAbi },
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
            '0x', // No callback data
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

  return { simulateTransfer, simulateSwap };
};