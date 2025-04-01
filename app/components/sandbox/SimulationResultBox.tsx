import { useState, useEffect } from 'react';
import { useSimulation } from '../../utils/SimulationContext';
import styles from '../../styles/Simulation.module.css';

const SimulationResultBox = ({ timeOfDay, gasFeeData, poolMetricsData }: { 
  timeOfDay: any[]; 
  gasFeeData: any[]; 
  poolMetricsData: any[] 
}) => {
  const { simulationResult } = useSimulation();
  const [processingStep, setProcessingStep] = useState<string | null>('Fetching gas trends...'); // Start with first step

  const getAiSuggestions = (gasEstimate: string) => {
    const gasWei = parseInt(gasEstimate);
    const gasEth = gasWei / 1e18;

    const currentHour = new Date().getHours();
    const currentHourData = timeOfDay.find(d => d.hour_of_day === currentHour);
    const avgGasFeeEth = currentHourData?.avg_gas_fee_eth || 0;
    const historicalAvg = timeOfDay.reduce((sum, d) => sum + d.avg_gas_fee_eth, 0) / timeOfDay.length;
    const isGoodTime = avgGasFeeEth < historicalAvg * 0.9;
    const nextBestHour = timeOfDay
      .filter(d => d.hour_of_day > currentHour)
      .sort((a, b) => a.avg_gas_fee_eth - b.avg_gas_fee_eth)[0]?.hour_of_day;

    const recentGasAvg = gasFeeData
      .slice(-5)
      .reduce((sum, d) => sum + d.avg_gas_fee_eth, 0) / 5;
    const isGasTrendingDown = gasEth < recentGasAvg;

    const avgPoolGas = poolMetricsData.reduce((sum, d) => sum + d.median_gas_fee_eth, 0) / poolMetricsData.length;
    const isEfficient = gasEth < avgPoolGas;

    return {
      gasWei,
      gasEth,
      suggestion: isGoodTime 
        ? 'Good time to send now!' 
        : `Wait until ${nextBestHour}:00 for lower fees`,
      trend: isGasTrendingDown ? 'Gas fees are trending down' : 'Gas fees are stable or rising',
      efficiency: isEfficient ? 'Efficient gas usage' : 'Higher than average gas',
    };
  };

  useEffect(() => {
    if (simulationResult && !simulationResult.error) {
      const steps = [
        'Fetching gas trends...',
        'Analyzing historical data...',
        'Generating suggestion...',
      ];
      setProcessingStep(steps[0]); // Reset to first step immediately
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
    } else if (!simulationResult) {
      setProcessingStep(null); // Clear when no result
    }
  }, [simulationResult]);

  if (!simulationResult) return null;

  return (
    <div className={`${styles.simulationBox} ${styles.fadeIn} ${processingStep ? styles.processing : ''}`}>
      {simulationResult.error ? (
        <p>Error: {simulationResult.error}</p>
      ) : (
        <div className={styles.contentWrapper}>
          {processingStep ? (
            <div className={styles.processingWrapper}>
              <p>Gas Estimate: {simulationResult.gasEstimate} wei</p>
              <p className={styles.processingText}>{processingStep}</p>
            </div>
          ) : (
            (() => {
              const { gasWei, gasEth, suggestion, trend, efficiency } = getAiSuggestions(simulationResult.gasEstimate);
              return (
                <div className={styles.resultContent}>
                  <p>Gas Estimate: {gasWei} wei</p>
                  <p>Gas in ETH: {gasEth.toFixed(9)} ETH</p>
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
  );
};

export default SimulationResultBox;