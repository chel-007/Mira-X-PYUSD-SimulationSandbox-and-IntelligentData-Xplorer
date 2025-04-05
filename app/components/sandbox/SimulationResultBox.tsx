import { useState, useEffect } from 'react';
import { useSimulation } from '../../utils/SimulationContext';
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
  const [sending, setSending] = useState(false);
  

  const getTransferSuggestions = (gasEstimate: string, gasPrice: string) => {
    const gasUnits = BigInt(gasEstimate);         // 66532
    const gasPriceWei = BigInt(gasPrice);         // 1317282
    const gasWei = gasUnits * gasPriceWei;        // 87641406024
    const gasEth = Number(gasWei) / 1_000_000_000_000_000_000; // Explicit 1e18
  
    console.log("timeofday", timeOfDay)
    console.log("gasFeeData", gasFeeData)
  
    // --- Time-of-Day Insights (7-day window) ---
    const now = new Date();
    const currentHour = now.getUTCHours();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    sevenDaysAgo.setUTCHours(0, 0, 0, 0);
  
    const sevenDayTimeOfDay = timeOfDay.filter(d => new Date(d.event_date) >= sevenDaysAgo);
    const hourlyAverages = sevenDayTimeOfDay.reduce((acc, d) => {
      const hour = d.hour_of_day;
      acc[hour] = acc[hour] || { total: 0, count: 0 };
      acc[hour].total += d.avg_gas_fee_eth * d.transaction_count;
      acc[hour].count += d.transaction_count;
      acc.total += d.avg_gas_fee_eth * d.transaction_count;
      acc.count += d.transaction_count;
      return acc;
    }, { total: 0, count: 0 });
  
    const overallAvg = hourlyAverages.count > 0 ? hourlyAverages.total / hourlyAverages.count : 0.005;
    const sevenDayAvg: { [hour: number]: number } = {};
    for (let hour = 0; hour < 24; hour++) {
      sevenDayAvg[hour] = hourlyAverages[hour] && hourlyAverages[hour].count > 0
        ? hourlyAverages[hour].total / hourlyAverages[hour].count
        : overallAvg;
    }
  
    const currentFee = sevenDayAvg[currentHour] || overallAvg;
    const isGoodTime = gasEth < currentFee * 0.9;
  
    const predictions: { [hour: number]: number } = {};
    for (let i = 1; i <= 3; i++) {
      const hour = (currentHour + i) % 24;
      predictions[hour] = sevenDayAvg[hour];
    }
  
    const nextBest = Object.entries(predictions).reduce(
      (best, [hour, fee]) => fee < best.fee ? { hour: parseInt(hour), fee } : best,
      { hour: (currentHour + 1) % 24, fee: predictions[(currentHour + 1) % 24] }
    );
  
    // --- Gas Fee Trend (last hour) ---
    const oneHourAgo = Math.floor((now.getTime() - 60 * 60 * 1000) / 1000);
    const thirtyMinsAgo = Math.floor((now.getTime() - 30 * 60 * 1000) / 1000);
  
    const lastHourFees = gasFeeData
      .filter(d => {
        const timestamp = Math.floor(new Date(d.event_date).getTime() / 1000);
        return timestamp >= oneHourAgo && d.transaction_count > 0;
      })
      .map(d => d.avg_gas_fee_eth)
      .sort((a, b) => a - b);
  
    const avgLastHour = lastHourFees.length > 0
      ? lastHourFees.reduce((sum, fee) => sum + fee, 0) / lastHourFees.length
      : overallAvg;
  
    const earlyHourFees = gasFeeData
      .filter(d => {
        const timestamp = Math.floor(new Date(d.event_date).getTime() / 1000);
        return timestamp >= oneHourAgo && timestamp < thirtyMinsAgo && d.transaction_count > 0;
      })
      .map(d => d.avg_gas_fee_eth);
  
    const earliestLastHour = earlyHourFees.length > 0
      ? earlyHourFees.reduce((sum, fee) => sum + fee, 0) / earlyHourFees.length
      : avgLastHour;
  
    const percentChange = earliestLastHour > 0
      ? Math.min(((avgLastHour - earliestLastHour) / earliestLastHour * 100), 1000)
      : 0;
    const gasTrendDirection = percentChange < -5 ? 'dropping' : percentChange > 5 ? 'rising' : 'stable';
  
    // --- Pool Metrics Efficiency ---
    const avgPoolGas = poolMetricsData.reduce((sum, d) => sum + d.median_gas_fee_eth, 0) / poolMetricsData.length;
    const isEfficient = gasEth < avgPoolGas;
  
    // --- Suggestions ---
    const suggestion = isGoodTime && isEfficient
      ? 'Good time to send now!'
      : nextBest.fee < currentFee * 0.95
      ? `Wait until ${nextBest.hour}:00 UTC for lower fees`
      : 'Fees are steady—send if urgent';
  
    const trend = `Gas fees are ${gasTrendDirection} (last hour: ${avgLastHour.toFixed(6)} ETH)`;
    const efficiency = isEfficient ? 'Efficient gas usage' : 'Higher than average gas';
    console.log({ gasUnits, gasPriceWei, gasWei, gasEth })
  
    return {
      gasUnits: gasUnits.toString(),
      gasWei: gasWei.toString(),
      gasEth, // Add gasEth here
      suggestion,
      trend,
      efficiency,
    };
  };

    useEffect(() => {
      if (simulationResult && !simulationResult.error && !simulationResult.txHash) {
        const steps = ['Fetching gas trends...', 'Analyzing hourly patterns...', 'Generating suggestion...'];
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

  const explorerUrl = simulationResult?.txHash
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
          {simulationResult.error ? (
            <p>Error: {simulationResult.error}</p>
          ) : simulationResult.status === 'Sending now' ? (
            <div className={styles.processingWrapper}>
              <p>Sending now...</p>
            </div>
          ) : simulationResult.txHash ? (
            <div className={styles.resultContent}>
              <p>
                Transaction Hash:{' '}
                <a href={explorerUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#7bcfff' }}>
                  {simulationResult.txHash.slice(0, 6)}...{simulationResult.txHash.slice(-4)}
                </a>
              </p>
              <p className={styles.detail}>Add Tx in Mira X Sandbox</p>
            </div>
          ) : (
            <div className={styles.contentWrapper}>
              {processingStep ? (
                <div className={styles.processingWrapper}>
                  <p>Gas Estimate: {simulationResult.gasEstimate} wei</p>
                  <p className={styles.processingText}>{processingStep}</p>
                </div>
              ) : (
                (() => {
                  const { gasUnits, gasWei, gasEth, suggestion, trend, efficiency } = getTransferSuggestions(
                    simulationResult.gasEstimate,
                    simulationResult.gasPrice
                  );
                  return (
                    <div className={styles.resultContent}>
                      <p>Gas Units: {gasUnits}</p>
                      <p>Total Gas Cost: {gasEth.toFixed(9)} ETH</p>
                      <p className={styles.suggestion}>Mira AI Suggestion: {suggestion}</p>
                      <p className={styles.detail}>Trend: {trend}</p>
                      <p className={styles.detail}>Efficiency: {efficiency}</p>
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