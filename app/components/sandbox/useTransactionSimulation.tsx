import { JsonRpcProvider, parseUnits, ethers } from 'ethers';
import { useWalletClient } from 'wagmi';
import { encodeFunctionData } from 'viem';
import { useSendTransaction } from 'wagmi';

const PYUSD_MAINNET_ADDRESS = '0x6c3ea9036406852006290770bedfcaba0e23a0e8';
const PYUSD_SEPOLIA_ADDRESS = '0xcac524bca292aaade2df8a05cc58f0a65b1b3bb9';


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
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    type: 'function',
  },
  {
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    type: 'function',
  },
  {
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
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

  {
    name: 'get_dy',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'i', type: 'int128' },
      { name: 'j', type: 'int128' },
      { name: 'dx', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'fee',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'price_oracle',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'i', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'dynamic_fee',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'i', type: 'int128' },
      { name: 'j', type: 'int128' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  
];

export const useTransactionSimulation = (rpcUrl: any) => {
  const { data: walletClient } = useWalletClient();
  // console.log('useTransactionSimulation - walletClient:', walletClient);
  const provider = new JsonRpcProvider(rpcUrl);

  const { sendTransaction } = useSendTransaction();

  // console.log("rpcurl", rpcUrl)

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

    // console.log("amount", amount)

    // console.log(`Balance: ${balance}, Amount: ${amountWei}`);
    if (balance < amountWei) {
      throw new Error(`Insufficient PYUSD balance: ${balance} < ${amount}`);
    }

    // console.log('Simulating transfer...');
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
  
    let gasPrice: bigint;
    const gasPriceHex = await provider.send('eth_gasPrice', []);
    const feeData = await provider.getFeeData();
    gasPrice = feeData.maxFeePerGas
      ?? feeData.gasPrice
      ?? BigInt(await provider.send('eth_gasPrice', []));

    // console.log("feedata, gasprice", feeData, gasPrice, gasEstimate)
  
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

    // console.log('Sending transfer to:', to, 'Amount:', amount);

    const txHash = await walletClient.sendTransaction({
      to: contractAddress,
      data: txData,
      value: 0n,
    });
    // console.log('Transaction sent, hash:', txHash);

    if (!txHash || typeof txHash !== 'string') {
      throw new Error('Invalid transaction hash: ' + txHash);
    }

    // wait using GCP provider
    const receipt = await provider.waitForTransaction(txHash, 1, 40000);
    if (!receipt) throw new Error('Transaction receipt not found');
    // console.log('Transaction confirmed, receipt:', receipt);

    return { txHash: receipt.hash };
  };

const simulateSwap = async (
  from: string,
  to: string,
  amountIn: string,
  isMainnet: boolean,
  tokenIn: string,
  poolMetricsData: any[],
  provider: ethers.JsonRpcProvider
) => {
  if (!isMainnet) {
    throw new Error('Swap simulation is only supported on Ethereum Mainnet due to pool address limitations.');
  }
  

  const poolConfig = {
    USDC: { address: '0x383e6b4437b59fff47b619cba855ca29342a8559', decimals: 6, tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
    crvUSD: { address: '0x625e92624bc2d88619accc1788365a69767f6200', decimals: 18, tokenAddress: '0xf939E0A03FB07F59A73314E73794Be0E57ac1b4E' },
  };

  const config = poolConfig[tokenIn];
  if (!config) {
    throw new Error(`Unsupported token: ${tokenIn}`);
  }

  const amountInWei = ethers.parseUnits(amountIn, config.decimals);
  const tokenContractAddress = config.tokenAddress;

  // Define proxy addresses for each pool
  const proxyAddresses: { [key: string]: string } = {
    '0x625e92624bc2d88619accc1788365a69767f6200': '0x3fa20eaa107de08b38a8734063d605d5842fe09c', // crvUSD/PYUSD pool
    '0x383e6b4437b59fff47b619cba855ca29342a8559': '0x9008d19f58aabd9ed0d60971565aa8510560ab41', // USDC/PYUSD pool
  };

  const proxyAddress = proxyAddresses[config.address.toLowerCase()];
  if (!proxyAddress) {
    throw new Error(`No proxy address found for pool: ${config.address}`);
  }

  // Check allowance for the proxy address
  const tokenContract = new ethers.Contract(tokenContractAddress, erc20Abi, provider);
  const allowance = await tokenContract.allowance(proxyAddress, config.address);
  // console.log("allowance, proxy", allowance.toString(), proxyAddress);

  // Check the proxy's balance for debugging
  const balance = await tokenContract.balanceOf(proxyAddress);
  // console.log("proxy balance", balance.toString(), tokenIn);

  console.log("amountinwei", amountInWei)

  // Validate balance
  if (balance < amountInWei) {
    throw new Error(`Proxy balance (${ethers.formatUnits(balance, config.decimals)} ${tokenIn}) is less than the swap amount (${amountIn} ${tokenIn})`);
  }

  let approvalGasEstimate: bigint | undefined;
  if (allowance < amountInWei) {
    const approveTx = {
      from: proxyAddress,
      to: tokenContractAddress,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [config.address, amountInWei],
      }),
    };

    try {
      approvalGasEstimate = await provider.estimateGas(approveTx);
      console.log(`Simulated approval gas estimate: ${approvalGasEstimate.toString()}`);
    } catch (error) {
      console.warn('Approval gas estimation failed, using static estimate:', error.message);
      approvalGasEstimate = BigInt(50000);
    }
  }

  // Swap simulation
  const i = 1; // Input token (crvUSD or USDC) is always at index 1
  const j = 0; // Output token (PYUSD) is always at index 0
  const swapTx = {
    from: proxyAddress,
    to: config.address,
    value: 0,
    data: encodeFunctionData({
      abi: curvePoolAbi,
      functionName: 'exchange',
      args: [i, j, amountInWei, 0],
    }),
  };

  // Estimate gas for the swap
  let swapGasEstimate: bigint;
  try {
    swapGasEstimate = await provider.estimateGas(swapTx);
    // console.log("swapestimate", swapGasEstimate);
  } catch (error) {
    // console.warn('Swap gas estimation failed with proxy address, using static estimate:', error.message);
    swapGasEstimate = BigInt(150000);
  }

  // Fetch gas price with fallback
  let gasPrice: bigint;
  try {
    const feeData = await provider.getFeeData();
    gasPrice = feeData.maxFeePerGas
      ?? feeData.gasPrice
      ?? BigInt(await provider.send('eth_gasPrice', []));
  
    // console.log("gasPrice", gasPrice.toString());
  } catch (error) {
    console.warn("Failed to fetch gas price, using fallback:", error);
    gasPrice = BigInt(20000000000); // fallback to 20 gwei
  }
  

  // Calculate amount out using get_dy
  const curvePoolContract = new ethers.Contract(config.address, curvePoolAbi, provider);

  // console.log("config.address", config.address)
  let amountOutWei;
  try {
    amountOutWei = await curvePoolContract.get_dy(i, j, amountInWei);
    // console.log("amountOutWei", amountOutWei.toString());
  } catch (error) {
    console.error('Failed to call get_dy:', error);
    throw new Error('Unable to calculate output amount');
  }

  // Fetch the pool's fee
let poolFee;
try {
  poolFee = await curvePoolContract.dynamic_fee(i, j);
  // console.log("pool fee (in basis points)", poolFee.toString());
} catch (error) {
  console.warn('Failed to fetch pool fee, using default 0.04%:', error.message);
  poolFee = BigInt(4000000); // Default to 0.04% (4000000 / 10^10)
}

  // Calculate the fee multiplier (fee is in 10^10 basis points, e.g., 4000000 = 0.04%)
  // const FEE_DENOMINATOR = BigInt(10**10);
  // const feeFraction = poolFee * amountOutWei / FEE_DENOMINATOR;
  // const adjustedAmountOutWei = amountOutWei - feeFraction;
  // console.log("adjusted amountOutWei (after fee)", adjustedAmountOutWei.toString());

  const outputTokenDecimals = 6; // Output is always PYUSD (6 decimals)
  const amountOutNum = parseFloat(ethers.formatUnits(amountOutWei, outputTokenDecimals));
  
  const amountInNum = parseFloat(amountIn);
  
  // Convert BigInt `poolFee` to Number for calculations
  const fee = Number(poolFee) / 10 ** 10; 
  const feePercentage = fee * 100;  // Convert fee to percentage
  // console.log("fee calculation", { fee, feePercentage });
  
  const pool = poolMetricsData.find((p) => p.pool_address.toLowerCase() === config.address.toLowerCase());
  console.log("pool", pool);
  if (!pool) {
    throw new Error('Pool data not available');
  }
  
  const tvl = pool.tvl_usd;
  const volume24h = pool.total_volume_usd;
  // console.log("pool metrics", { tvl, volume24h });
  
  const amountInUsd = amountInNum;
  const reserveUsd = tvl / 2;
  const priceImpact = amountInUsd / (reserveUsd + amountInUsd);
  const volumeFactor = volume24h / tvl;
  
  // now calculate slippage
  let slippage = (feePercentage / 100) + (priceImpact * (1 + volumeFactor));
  slippage = Math.min(slippage, 0.01); // cap at 1%
  console.log("slippage components", { priceImpact, volumeFactor, slippage });
  
  const totalGasEstimate = approvalGasEstimate
    ? (approvalGasEstimate + swapGasEstimate).toString()
    : swapGasEstimate.toString();
  
  return {
    gasEstimate: totalGasEstimate,
    gasPrice: gasPrice.toString(),
    amountIn,
    tokenIn,
    amountOut: amountOutNum.toFixed(6),
    slippage: (slippage * 100).toFixed(2) + '%',
    fee: fee.toFixed(6),
    feePercentage: feePercentage.toFixed(2) + '%',
    poolAddress: config.address,
  };
  
};

  return { simulateTransfer, simulateSwap: (from: string, to: string, amountIn: string, isMainnet: boolean, tokenIn: string, poolMetricsData: any[]) =>
    simulateSwap(from, to, amountIn, isMainnet, tokenIn, poolMetricsData, provider), sendTransfer, walletClient };
};