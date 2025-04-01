import { JsonRpcProvider } from 'ethers/providers'; // For provider
import { parseUnits } from 'ethers'; // For utils functions
import { encodeFunctionData } from 'viem';
import { useSendTransaction } from 'wagmi'

const PYUSD_MAINNET_ADDRESS = '0x6c3ea9036406852006290770bedfcaba0e23a0e8';
const PYUSD_SEPOLIA_ADDRESS = '0xcac524bca292aaade2df8a05cc58f0a65b1b3bb9'; // Replace with actual Sepolia PYUSD address
const UNISWAP_ROUTER_ADDRESS = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'; // Mainnet; adjust for Sepolia

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

const uniswapRouterAbi = [
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut)',
];

export const useTransactionSimulation = (rpcUrl:any) => {
  const provider = new JsonRpcProvider(rpcUrl);
  const { sendTransaction } = useSendTransaction();

  console.log(rpcUrl)

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

  console.log(`Balance: ${balance}, Amount: ${amountWei}`); // Debug
  if (balance < amountWei) {
    throw new Error(`Insufficient PYUSD balance: ${balance} < ${amountWei}`);
  }
    console.log("simulation was run")
    console.log("details", simulateTransfer)
    const transferTx = {
      from,
      to: isMainnet ? PYUSD_MAINNET_ADDRESS : PYUSD_SEPOLIA_ADDRESS,
      value: 0,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: 'transfer',
        args: [to, parseUnits(amount, 6)], // PYUSD: 6 decimals
      }),
    };

    const gasEstimate = await provider.estimateGas(transferTx);
    const simulationResult = await provider.call(transferTx);
    console.log(gasEstimate)
    console.log(simulationResult)
    return {
        gasEstimate: gasEstimate.toString(),
        simulationResult,
      };
  };

//   const checkBalances = async (from: string, to: string, amount: string, isMainnet: boolean) => {
//     const { data: ethBalance } = useBalance({ address: from });
//     const { data: pyusdBalance } = useContractRead({
//       address: isMainnet ? PYUSD_MAINNET_ADDRESS : PYUSD_SEPOLIA_ADDRESS,
//       abi: erc20Abi,
//       functionName: 'balanceOf',
//       args: [from],
//     });

//     const amountWei = parseUnits(amount, 6);
//     const gasCost = gasEstimate.mul(parseUnits('20', 'gwei')); // Assume 20 Gwei
//     const hasEnoughPyusd = pyusdBalance && pyusdBalance.gte(amountWei);
//     const hasEnoughEth = ethBalance && ethBalance.value.gte(gasCost);

//     return { hasEnoughPyusd, hasEnoughEth };
//   };

//   const simulateSwap = async (from: string, to: string, amountIn: string, amountOut: string, isMainnet: boolean) => {
//     const swapTx = {
//       from,
//       to: UNISWAP_ROUTER_ADDRESS,
//       value: 0,
//       data: encodeFunctionData({
//         abi: uniswapRouterAbi,
//         functionName: 'exactInputSingle',
//         args: [{
//           tokenIn: isMainnet ? PYUSD_MAINNET_ADDRESS : PYUSD_SEPOLIA_ADDRESS,
//           tokenOut: to,
//           fee: 3000,
//           recipient: from,
//           deadline: Math.floor(Date.now() / 1000) + 60 * 20,
//           amountIn: parseUnits(amountIn, 6),
//           amountOutMinimum: parseUnits(amountOut, 6),
//           sqrtPriceLimitX96: 0,
//         }],
//       }),
//     };

//     const gasEstimate = await provider.estimateGas(swapTx);
//     const simulationResult = await provider.call(swapTx);
//     return { gasEstimate: ethers.utils.formatEther(gasEstimate), simulationResult };
//   };

//   const sendTx = async (tx:any, gasEstimate:any) => {
//     const txHash = await sendTransaction({
//       ...tx,
//       gas: gasEstimate,
//     });
//     return txHash;
//   };

  return { simulateTransfer };
};