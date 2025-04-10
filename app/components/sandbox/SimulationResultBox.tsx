import { useState, useEffect } from 'react';
import { useSimulation, BaseSimulationResult, SimulationResult } from '../../utils/SimulationContext'; // Import the types
import styles from '../../styles/Simulation.module.css';

const SimulationResultBox = ({
  timeOfDay,
  gasFeeData,
  poolMetricsData,
}: {
  timeOfDay: any[];
  gasFeeData: any[];
  poolMetricsData: any[];
}) => {
  const { simulationResult, isMainnet } = useSimulation();
  const [processingStep, setProcessingStep] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(true);

  const getTransferSuggestions = (gasEstimate: string, gasPrice: string, transferAmount?: string) => {
    const gasUnits = BigInt(gasEstimate);
    const gasPriceWei = BigInt(gasPrice);
    const gasWei = gasUnits * gasPriceWei;
    const gasEth = Number(gasWei) / 1_000_000_000_000_000_000;

    const now = new Date();
    const currentHour = now.getUTCHours();
    const today = now.toISOString().split('T')[0];

    const lastHourFees = timeOfDay
      .filter((d) => {
        const isToday = d.event_date === today;
        const isLastHour = isToday && d.hour_of_day <= currentHour && d.hour_of_day >= currentHour - 1;
        return isToday && isLastHour && d.transaction_count > 0;
      })
      .map((d) => d.avg_gas_fee_eth);

    const avgLastHour = lastHourFees.length > 0
      ? lastHourFees.reduce((sum, fee) => sum + fee, 0) / lastHourFees.length
      : 0.0002;

    const prevHourFees = timeOfDay
      .filter((d) => {
        const isToday = d.event_date === today;
        const isPrevHour = isToday && d.hour_of_day === currentHour - 1;
        return isPrevHour && d.transaction_count > 0;
      })
      .map((d) => d.avg_gas_fee_eth);

    const prevHourAvg = prevHourFees.length > 0
      ? prevHourFees.reduce((sum, fee) => sum + fee, 0) / prevHourFees.length
      : avgLastHour;

    const percentChange = prevHourAvg > 0 ? ((avgLastHour - prevHourAvg) / prevHourAvg * 100) : 0;
    const gasTrendDirection = percentChange < -5 ? 'dropping' : percentChange > 5 ? 'rising' : 'stable';

    const oneDayAgo = now.getTime() - 24 * 60 * 60 * 1000;
    const recentFees = timeOfDay
      .filter((d) => {
        const timestamp = new Date(d.event_date).getTime() + d.hour_of_day * 60 * 60 * 1000;
        return timestamp >= oneDayAgo && d.transaction_count > 0;
      })
      .map((d) => d.avg_gas_fee_eth);

    const avgTransferGasEth = recentFees.length > 0
      ? recentFees.reduce((sum, fee) => sum + fee, 0) / recentFees.length
      : 0.0002;
    const isEfficient = gasEth < avgTransferGasEth;

    const ethPrice = 2000;
    const amountUsd = transferAmount ? parseFloat(transferAmount) : 0;
    const gasUsd = gasEth * ethPrice;
    const gasCostRatio = amountUsd > 0 ? (gasUsd / amountUsd) * 100 : Infinity;
    const isCostEffective = gasCostRatio < 2;

    const isGoodTime = gasEth < avgLastHour * 1.1;
    let suggestion = '';
    if (isGoodTime && isEfficient) {
      suggestion = `Send now: low gas (${gasEth.toFixed(6)} ETH)${isCostEffective ? ' and cost-effective' : ''}!`;
    } else if (isGoodTime && gasTrendDirection === 'dropping') {
      suggestion = `Send soon: gas (${gasEth.toFixed(6)} ETH) is dropping`;
    } else if (gasEth > avgLastHour * 1.5) {
      suggestion = `Wait: gas (${gasEth.toFixed(6)} ETH) is high vs. recent avg (${avgLastHour.toFixed(6)} ETH)`;
    } else if (gasEth > avgLastHour * 1.2) {
      suggestion = `Consider waiting: gas (${gasEth.toFixed(6)} ETH) is above recent avg (${avgLastHour.toFixed(6)} ETH)`;
    } else {
      suggestion = `Fees are ${gasTrendDirection}—send if urgent (${gasEth.toFixed(6)} ETH)`;
    }

    const trend = `Gas fees are ${gasTrendDirection} (last hour: ${avgLastHour.toFixed(6)} ETH)`;
    const efficiency = isEfficient ? 'Efficient gas usage' : 'Higher than average gas';

    return {
      gasUnits: gasUnits.toString(),
      gasWei: gasWei.toString(),
      gasEth,
      suggestion,
      trend,
      efficiency,
      gasCostRatio: gasCostRatio.toFixed(2),
    };
  };

  const getSwapSuggestions = (result: BaseSimulationResult) => {
    const gasWei = BigInt(result.gasEstimate || '0');
    const gasPriceWei = BigInt(result.gasPrice || '0');
    const gasEth = Number(gasWei * gasPriceWei) / 1_000_000_000_000_000_000;
    const amountInNum = parseFloat(result.amountIn || '0');
    const amountOutNum = parseFloat(result.amountOut || '0');
    const slippage = parseFloat(result.slippage?.replace('%', '') || '0');

    // console.log("simulation slippage", slippage)

    const currentHour = new Date().getUTCHours();
    const currentHourData = timeOfDay.find((d) => d.hour_of_day === currentHour);
    const avgGasFeeEth = currentHourData?.avg_gas_fee_eth || 0;
    const historicalAvg = timeOfDay.reduce((sum, d) => sum + d.avg_gas_fee_eth, 0) / timeOfDay.length;
    const isGoodTime = avgGasFeeEth < historicalAvg * 0.9;

    const avgSwapGasEth = gasFeeData
      .filter((d) => d.event_type === 'Swap')
      .reduce((sum, d) => sum + d.avg_gas_fee_eth, 0) / (gasFeeData.length || 1);
    const isEfficient = gasEth < avgSwapGasEth;

    const swapValueDiff = amountOutNum - amountInNum;
    const gasCostImpact = gasEth / Math.abs(swapValueDiff || 1);
    const isWorthIt = gasCostImpact < 0.05;

    const pool = poolMetricsData.find((p) => p.pool_address.toLowerCase() === result.poolAddress?.toLowerCase());
    const liquidityTrend = pool?.tvl_usd > pool?.total_volume_usd * 2 ? 'stable' : 'volatile';

    let suggestion = '';
    if (isGoodTime && slippage < 0.5 && isWorthIt) {
      suggestion = `Swap now: low gas (${gasEth.toFixed(6)} ETH), low slippage (${slippage}%), and cost-effective!`;
    } else if (isGoodTime && isWorthIt) {
      suggestion = `Swap now: low gas (${gasEth.toFixed(6)} ETH) and worth it, but slippage is ${slippage}%`;
    } else if (liquidityTrend === 'volatile') {
      suggestion = `Wait: pool liquidity is volatile, gas at ${gasEth.toFixed(6)} ETH`;
    } else {
      suggestion = `Wait for better conditions: gas (${gasEth.toFixed(6)} ETH) or slippage (${slippage}%) too high`;
    }

    return {
      gasEth: gasEth.toFixed(9),
      amountOut: amountOutNum.toFixed(6),
      slippage: slippage.toFixed(2) + '%',
      suggestion,
      efficiency: isEfficient ? 'Efficient gas usage' : 'Higher than average gas',
      liquidityTrend,
    };
  };

  useEffect(() => {
    if (simulationResult && !('error' in simulationResult) && !('txHash' in simulationResult) && !('needsApproval' in simulationResult)) {
      const isSwap = !!simulationResult.amountIn;
      const steps = isSwap
        ? ['Fetching pool data...', 'Estimating swap rates...', 'Analyzing gas and slippage...']
        : ['Fetching gas trends...', 'Analyzing hourly patterns...', 'Generating suggestion...'];
      setProcessingStep(steps[0]);
      let stepIndex = 1;
      const interval = setInterval(() => {
        if (stepIndex < steps.length) {
          setProcessingStep(steps[stepIndex]);
          stepIndex++;
        } else {
          setProcessingStep(null);
          clearInterval(interval);
        }
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setProcessingStep(null);
    }
  }, [simulationResult]);

  const toggleVisibility = () => {
    setIsVisible(!isVisible);
  };

  if (!simulationResult) return null;

  const isSwap = 'amountIn' in simulationResult && !!simulationResult.amountIn;
  const explorerUrl = 'txHash' in simulationResult && simulationResult.txHash
    ? `https://${isMainnet ? 'etherscan.io' : 'sepolia.etherscan.io'}/tx/${simulationResult.txHash}`
    : '';

  return (
    <div className={`${styles.simulationContainer} ${isVisible ? styles.visible : styles.hidden}`}>
      <button className={styles.arrowToggle} onClick={toggleVisibility}>
        {isVisible ? '▶' : '◀'}
      </button>
      <div
        className={`${styles.simulationBox} ${isVisible ? styles.boxVisible : styles.boxHidden} ${
          processingStep ? styles.processing : ''
        }`}
      >
        {'error' in simulationResult && simulationResult.error ? (
          <p>Error: {simulationResult.error}</p>
        ) : 'status' in simulationResult && simulationResult.status === 'Sending now' ? (
          <div className={styles.processingWrapper}>
            <p>Sending now...</p>
          </div>
        ) : 'txHash' in simulationResult && simulationResult.txHash ? (
          <div className={styles.resultContent}>
            <p>
              Transaction Hash:{' '}
              <a href={explorerUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#7bcfff' }}>
                {simulationResult.txHash.slice(0, 6)}...{simulationResult.txHash.slice(-4)}
              </a>
            </p>
            <p className={styles.detail}>Add Tx in Mira X Sandbox</p>
          </div>
        ) : 'needsApproval' in simulationResult && simulationResult.needsApproval ? (
          <div className={styles.resultContent}>
            <p>{simulationResult.message}</p>
            <p>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  simulationResult.handleApprove();
                }}
                style={{ color: '#7bcfff', cursor: 'pointer' }}
              >
                Approve?
              </a>
            </p>
          </div>
        ) : 'status' in simulationResult && simulationResult.status === 'Approved, please simulate again' ? (
          <div className={styles.resultContent}>
            <p>{simulationResult.status}</p>
          </div>
        ) : (
          <div className={styles.contentWrapper}>
            {processingStep ? (
              <div className={styles.processingWrapper}>
                <p>Gas Estimate: {'gasEstimate' in simulationResult ? simulationResult.gasEstimate : 'N/A'} wei</p>
                <p className={styles.processingText}>{processingStep}</p>
              </div>
            ) : isSwap ? (
              (() => {
                const result = simulationResult as BaseSimulationResult; // Type assertion after narrowing
                const { gasEth, amountOut, slippage, suggestion, efficiency } = getSwapSuggestions(result);
                return (
                  <div className={styles.resultContent}>
                    <p>Amount Out: {amountOut} PYUSD</p>
                    <p>Slippage: {slippage}</p>
                    <p>Gas Cost: {gasEth} ETH</p>
                    <p className={styles.suggestion}>Mira AI Suggestion: {suggestion}</p>
                    <p>Fee: {'fee' in simulationResult ? simulationResult.fee : 'N/A'} PYUSD ({'feePercentage' in simulationResult ? simulationResult.feePercentage : 'N/A'})</p>
                    <p className={styles.detail}>Efficiency: {efficiency}</p>
                  </div>
                );
              })()
            ) : (
              (() => {
                const result = simulationResult as BaseSimulationResult; // Type assertion after narrowing
                const { gasUnits, gasWei, gasEth, suggestion, trend, efficiency, gasCostRatio } = getTransferSuggestions(
                  result.gasEstimate || '0',
                  result.gasPrice || '0',
                  result.amount
                );
                return (
                  <div className={styles.resultContent}>
                    <p>Gas Units: {gasUnits}</p>
                    <p>Total Gas Cost: {gasEth.toFixed(9)} ETH</p>
                    <p className={styles.suggestion}>Mira AI Suggestion: {suggestion}</p>
                    <p className={styles.detail}>Trend: {trend}</p>
                    <p className={styles.detail}>Efficiency: {efficiency}</p>
                    <p className={styles.detail}>Gas Cost: {gasCostRatio}% of transfer</p>
                  </div>
                );
              })()
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SimulationResultBox;


// import { useState, useEffect } from 'react';
// import { useSimulation } from '../../utils/SimulationContext';
// import styles from '../../styles/Simulation.module.css';

// const SimulationResultBox = ({
//   timeOfDay,
//   gasFeeData,
//   poolMetricsData,
// }: {
//   timeOfDay: any[];
//   gasFeeData: any[];
//   poolMetricsData: any[];
// }) => {
//   const { simulationResult } = useSimulation();
//   const [processingStep, setProcessingStep] = useState<string | null>(null);

//   const getTransferSuggestions = (gasEstimate: string) => {
//     const gasWei = parseInt(gasEstimate);
//     const gasEth = gasWei / 1e18;

//     const currentHour = new Date().getHours();
//     const currentHourData = timeOfDay.find((d) => d.hour_of_day === currentHour);
//     const avgGasFeeEth = currentHourData?.avg_gas_fee_eth || 0;
//     const historicalAvg = timeOfDay.reduce((sum, d) => sum + d.avg_gas_fee_eth, 0) / timeOfDay.length;
//     const isGoodTime = avgGasFeeEth < historicalAvg * 0.9;
//     const nextBestHour = timeOfDay
//       .filter((d) => d.hour_of_day > currentHour)
//       .sort((a, b) => a.avg_gas_fee_eth - b.avg_gas_fee_eth)[0]?.hour_of_day;

//     const recentGasAvg = gasFeeData.slice(-5).reduce((sum, d) => sum + d.avg_gas_fee_eth, 0) / 5;
//     const isGasTrendingDown = gasEth < recentGasAvg;

//     const avgPoolGas = poolMetricsData.reduce((sum, d) => sum + d.median_gas_fee_eth, 0) / poolMetricsData.length;
//     const isEfficient = gasEth < avgPoolGas;

//     return {
//       gasWei,
//       gasEth,
//       suggestion: isGoodTime ? 'Good time to send now!' : `Wait until ${nextBestHour}:00 for lower fees`,
//       trend: isGasTrendingDown ? 'Gas fees are trending down' : 'Gas fees are stable or rising',
//       efficiency: isEfficient ? 'Efficient gas usage' : 'Higher than average gas',
//     };
//   };

//   const getSwapSuggestions = (result: any) => {
//     const gasWei = parseInt(result.gasEstimate);
//     const gasEth = gasWei / 1e18;
//     const amountInNum = parseFloat(result.amountIn);

//     // Map tokenIn to pool address
//     const poolAddresses = {
//       USDT: '0xdd2e0d86a45e4ef9bd490c2809e6405720cc357c',
//       USDC: '0x383e6b4437b59fff47b619cba855ca29342a8559',
//       crvUSD: '0x625e92624bc2d88619accc1788365a69767f6200',
//     };
//     const poolAddress = poolAddresses[result.tokenIn];
//     const pool = poolMetricsData.find((p) => p.pool_address.toLowerCase() === poolAddress.toLowerCase());
//     if (!pool) {
//       console.error('Pool not found in poolMetricsData:', result.tokenIn);
//       return { error: 'Pool data not available' };
//     }

//     const tvl = pool.tvl_usd;
//     const volume24h = pool.total_volume_usd;
//     const decimals = result.tokenIn === 'crvUSD' ? 18 : 6;
//     const amountInBase = amountInNum / 10 ** (decimals - 6); // Normalize to 6 decimals for USD calc

//     // Calculate Slippage
//     const amountInUsd = amountInBase; // Assume 1:1 with USD for stables
//     const reserveUsd = tvl / 2;
//     const priceImpact = amountInUsd / (reserveUsd + amountInUsd);
//     const volumeFactor = volume24h / tvl;
//     let slippage = priceImpact * (1 + volumeFactor);
//     slippage = Math.min(slippage, 0.001); // Cap at 0.1% for stablecoin swaps

//     // Calculate Amount Out
//     const amountOut = amountInBase * (1 - slippage);

//     // Gas Suggestions
//     const currentHour = new Date().getHours();
//     const currentHourData = timeOfDay.find((d) => d.hour_of_day === currentHour);
//     const avgGasFeeEth = currentHourData?.avg_gas_fee_eth || 0;
//     const historicalAvg = timeOfDay.reduce((sum, d) => sum + d.avg_gas_fee_eth, 0) / timeOfDay.length;
//     const isGoodTime = avgGasFeeEth < historicalAvg * 0.9;

//     const avgSwapGas = gasFeeData
//       .filter((d) => d.event_type === 'Swap')
//       .reduce((sum, d) => sum + d.avg_gas_fee_eth, 0) / (gasFeeData.length || 1); // Avoid division by 0
//     const isEfficient = gasEth < avgSwapGas;

//     let suggestion = '';
//     if (isGoodTime && slippage < 0.01) {
//       suggestion = 'Swap now for low gas and low slippage!';
//     } else if (isGoodTime) {
//       suggestion = 'Swap now for low gas, but slippage is moderate';
//     } else {
//       suggestion = 'Wait for lower gas fees or better pool conditions';
//     }

//     return {
//       gasWei,
//       gasEth,
//       amountOut: amountOut.toFixed(3),
//       slippage: (slippage * 100).toFixed(1),
//       suggestion,
//       poolEfficiency: amountOut > amountInBase * 0.99 ? 'Efficient compared to average' : 'Below average efficiency',
//     };
//   };

//   useEffect(() => {
//     if (simulationResult && !simulationResult.error) {
//       const isSwap = !!simulationResult.amountIn;
//       const steps = isSwap
//         ? ['Fetching pool data...', 'Estimating swap rates...', 'Analyzing gas and slippage...']
//         : ['Fetching gas trends...', 'Analyzing historical data...', 'Generating suggestion...'];
//       setProcessingStep(steps[0]);
//       let stepIndex = 1;

//       const interval = setInterval(() => {
//         if (stepIndex < steps.length) {
//           setProcessingStep(steps[stepIndex]);
//           stepIndex++;
//         } else {
//           setProcessingStep(null);
//           clearInterval(interval);
//         }
//       }, 1000);

//       return () => clearInterval(interval);
//     } else {
//       setProcessingStep(null);
//     }
//   }, [simulationResult]);

//   if (!simulationResult) return null;

//   return (
//     <div className={`${styles.simulationBox} ${styles.fadeIn} ${processingStep ? styles.processing : ''}`}>
//       {simulationResult.error ? (
//         <p>Error: {simulationResult.error}</p>
//       ) : (
//         <div className={styles.contentWrapper}>
//           {processingStep ? (
//             <div className={styles.processingWrapper}>
//               <p>Gas Estimate: {simulationResult.gasEstimate} wei</p>
//               <p className={styles.processingText}>{processingStep}</p>
//             </div>
//           ) : simulationResult.amountIn ? (
//             (() => {
//               const { gasWei, gasEth, amountOut, slippage, suggestion, poolEfficiency } = getSwapSuggestions(
//                 simulationResult
//               );
//               return (
//                 <div className={styles.resultContent}>
//                   <p>Gas Estimate: {gasWei} wei</p>
//                   <p>Gas in ETH: {gasEth.toFixed(6)} ETH</p>
//                   <p>Amount In: {simulationResult.amountIn} {simulationResult.tokenIn}</p>
//                   <p>Amount Out: {amountOut} PYUSD</p>
//                   <p className={styles.suggestion}>Mira AI Suggestion: {suggestion}</p>
//                   <p>Slippage: {slippage}%</p>
//                   <p>Pool Efficiency: {poolEfficiency}</p>
//                 </div>
//               );
//             })()
//           ) : (
//             (() => {
//               const { gasWei, gasEth, suggestion, trend, efficiency } = getTransferSuggestions(
//                 simulationResult.gasEstimate
//               );
//               return (
//                 <div className={styles.resultContent}>
//                   <p>Gas Estimate: {gasWei} wei</p>
//                   <p>Gas in ETH: {gasEth.toFixed(9)} ETH</p>
//                   <p className={styles.suggestion}>Mira AI Suggestion: {suggestion}</p>
//                   <p className={styles.detail}>Trend: {trend}</p>
//                   <p className={styles.detail}>Efficiency: {efficiency}</p>
//                 </div>
//               );
//             })()
//           )}
//         </div>
//       )}
//     </div>
//   );
// };

// export default SimulationResultBox;