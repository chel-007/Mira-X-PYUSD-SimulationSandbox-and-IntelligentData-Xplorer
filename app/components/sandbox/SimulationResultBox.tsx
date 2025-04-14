import { useState, useEffect } from 'react';
import { useSimulation, BaseSimulationResult } from '../../utils/SimulationContext'; // Import the types
import styles from '../../styles/Simulation.module.css';
import { ethers } from 'ethers';

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
    const gasEth = Number(ethers.formatEther(gasPriceWei * gasUnits));

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
    // const gasEth = Number(gasWei * gasPriceWei) / 1_000_000_000_000_000_000;
    const gasEth = Number(ethers.formatEther(gasWei * gasPriceWei));
    const amountInNum = parseFloat(result.amountIn || '0');
    const amountOutNum = parseFloat(result.amountOut || '0');
    const slippage = parseFloat(result.slippage?.replace('%', '') || '0');

    // console.log("gas", gasEth)

    // console.log("simulation slippage", slippage)
    const currentDate = new Date(); // 2025-04-12
    const previousDay = new Date(currentDate);
    previousDay.setDate(currentDate.getDate() - 1); // 2025-04-11
    const previousDayStr = previousDay.toISOString().split('T')[0]; // '2025-04-11'
    
    // Find the previous day's swap gas fee from gasFeeData
    const previousDaySwapData = gasFeeData.find(
      (d) => d.event_date === previousDayStr && d.event_type === 'Swap'
    );
    const previousDaySwapGasEth = previousDaySwapData?.avg_gas_fee_eth || 0;

    // console.log("previousday", previousDay)

    // console.log("previousDaySwapDataETh", previousDaySwapGasEth)
    
    const mostRecentSwapGasEth = previousDaySwapGasEth || gasFeeData
      .filter((d) => d.event_type === 'Swap')
      .sort((a, b) => new Date(b.event_date) - new Date(a.event_date))[0]?.avg_gas_fee_eth || 0;
    
    // Determine if it's a good time to swap based on the previous day's swap gas fee
    const isGoodTime = gasEth < mostRecentSwapGasEth * 0.2; // Current gas fee is less than 20% of the previous day's swap gas fee
    
    // console.log("most recernt", mostRecentSwapGasEth)
    // console.log("isgood", isGoodTime)
    // Calculate average swap gas fee for efficiency (optional, for reporting)
    const avgSwapGasEth = gasFeeData
      .filter((d) => d.event_type === 'Swap')
      .reduce((sum, d) => sum + d.avg_gas_fee_eth, 0) / (gasFeeData.filter((d) => d.event_type === 'Swap').length || 1);
    const isEfficient = gasEth < avgSwapGasEth;

    const swapValueDiff = amountOutNum - amountInNum;
    const gasCostImpact = gasEth / Math.max(Math.abs(swapValueDiff), 1); // Prevent division by zero

    // Dynamically scale the threshold based on amountIn
    let dynamicThreshold;
    if (amountInNum < 100) {
      dynamicThreshold = 0.005; 
    } else if (amountInNum < 1000) {
      dynamicThreshold = 0.05;
    } else {
      dynamicThreshold = 0.1;
    }
    
    // const swapValueDiff = amountOutNum - amountInNum;
    // console.log("swapvaluediff", swapValueDiff)
    // const gasCostImpact = gasEth / Math.abs(swapValueDiff || 1);

    // console.log("gascostimact", gasCostImpact)
    const isWorthIt = gasCostImpact < dynamicThreshold;

    const pool = poolMetricsData.find((p) => p.pool_address.toLowerCase() === result.poolAddress?.toLowerCase());
    const liquidityTrend = pool?.tvl_usd > pool?.total_volume_usd * 2 ? 'stable' : 'volatile';

    let suggestion = '';
    if (isGoodTime && slippage < 0.5 && isWorthIt) {
      suggestion = `Optimal time to swap: low gas (${gasEth.toFixed(6)} ETH), low slippage (${slippage}%), and efficient cost impact (${(gasCostImpact * 100).toFixed(2)}%)`;
    } else if (isGoodTime && isWorthIt) {
      suggestion = `Gas is low (${gasEth.toFixed(6)} ETH) and cost impact is good (${(gasCostImpact * 100).toFixed(2)}%), but slippage is high (${slippage}%)`;
    } else if (isGoodTime && slippage < 0.1) {
      suggestion = `Low gas and low slippage, but cost impact is high (${(gasCostImpact * 100).toFixed(2)}%).`;
    } else if (liquidityTrend === 'volatile') {
      suggestion = `Pool is volatile (TVL: $${pool?.tvl_usd?.toFixed(2)}, Volume: $${pool?.total_volume_usd?.toFixed(2)}). Consider waiting.`;
    } else {
      suggestion = `Not ideal: Gas (${gasEth.toFixed(6)} ETH), slippage (${slippage}%), or cost impact (${(gasCostImpact * 100).toFixed(2)}%) too high.`;
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