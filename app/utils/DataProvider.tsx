"use client";

import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { collection, onSnapshot, QuerySnapshot } from "firebase/firestore";
import { db } from "../lib/clientFirestore";
import { useEthPrice } from "../utils/EthPriceProvider";

interface GasFeeOverTimeData {
  event_date: string;
  event_type: string;
  avg_gas_fee_eth: number;
  avg_gas_fee_usd: number;
  transaction_count: number;
}

interface TimeOfDayData {
  event_date: string;
  hour_of_day: number;
  avg_gas_fee_eth: number;
  avg_gas_fee_usd: number;
  transaction_count: number;
}

interface PoolMetricsData {
  pool_address: string;
  median_gas_fee_eth: number;
  swap_count: number;
  total_volume_usd: number;
  tvl_usd: number;
  apr: number;
}

interface DataContextType {
  dailyVolume: { date: string; value: number }[];
  monthlyVolume: { date: string; value: number }[];
  walletGrowthData: { date: string; newWallets: number }[];
  transfers: any[];
  lpEvents: any[];
  txPerHour: number;
  maxTxPerHour: number;
  activeWallets: number;
  dormantWallets: number;
  loading: boolean;
  gasFeeData: GasFeeOverTimeData[];
  timeOfDay: TimeOfDayData[];
  swapVolumeData: { pool_address: string; date: string; total_volume_usd: number }[];
  poolMetricsData: PoolMetricsData[];
}

const DataContext = createContext<DataContextType | undefined>(undefined);

// Pool addresses
const UNISWAP_POOL = '0xdd2e0d86a45e4ef9bd490c2809e6405720cc357c'; // PYUSD/USDT
const CURVE_POOL_PYUSD_CRVUSD = '0x625e92624bc2d88619accc1788365a69767f6200'; // PYUSD/crvUSD
const CURVE_POOL_PYUSD_USDC = '0x383e6b4437b59fff47b619cba855ca29342a8559'; // PYUSD/USDC

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dailyVolume, setDailyVolume] = useState<{ date: string; value: number }[]>([]);
  const [monthlyVolume, setMonthlyVolume] = useState<{ date: string; value: number }[]>([]);
  const [walletGrowthData, setWalletGrowthData] = useState<{ date: string; newWallets: number }[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [lpEvents, setLpEvents] = useState<any[]>([]);
  const [txPerHour, setTxPerHour] = useState<number>(0);
  const [maxTxPerHour, setMaxTxPerHour] = useState<number>(100);
  const [activeWallets, setActiveWallets] = useState<number>(0);
  const [dormantWallets, setDormantWallets] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [gasFeeData, setGasFeesData] = useState<GasFeeOverTimeData[]>([]);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDayData[]>([]);
  const [swapVolumeData, setSwapVolumeData] = useState<
    { pool_address: string; date: string; total_volume_usd: number }[]
  >([]);
  const [poolMetricsData, setPoolMetricsData] = useState<PoolMetricsData[]>([]);
  const { ethPrice, loading: ethPriceLoading } = useEthPrice();
  const prevLpCountRef = useRef<number>(0);
  const prevTransferCountRef = useRef<number>(0);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchBigQueryData = async () => {
    const response = await fetch("/api/bigQueryTransactions");
    const bigQueryData = await response.json();
    if (bigQueryData.error) {
      console.error("Failed to fetch BigQuery data:", bigQueryData.error);
      return null;
    }
    return bigQueryData;
  };

  const processBigQueryData = (bigQueryData: any) => {
    // Process Gas Fees Chart data (historical)
    const gasComparison = bigQueryData.gasComparisonData;
    const gasComparisonData = gasComparison.map((row: any) => {
      const avgGasFeeEth = parseFloat(row.avg_gas_fee_eth);
      return {
        event_date: row.event_date,
        event_type: row.event_type,
        avg_gas_fee_eth: avgGasFeeEth,
        avg_gas_fee_usd: ethPrice ? avgGasFeeEth * ethPrice : 0,
        transaction_count: parseInt(row.transaction_count),
      };
    });
    // Set immediately to display historical data in the UI while waiting for real-time data
    setGasFeesData(gasComparisonData);

    // Process Time of Day Chart data (historical)
    const timeOfDayData = bigQueryData.timeOfDayData.map((row: any) => {
      const avgGasFeeEth = parseFloat(row.avg_gas_fee_eth);
      return {
        event_date: row.event_date,
        hour_of_day: row.hour_of_day,
        avg_gas_fee_eth: avgGasFeeEth,
        avg_gas_fee_usd: ethPrice ? avgGasFeeEth * ethPrice : 0,
        transaction_count: parseInt(row.transaction_count),
      };
    });
    // Set immediately to display historical data in the UI
    setTimeOfDay(timeOfDayData);

    // Process Swap Volume Chart data (historical)
    const newSwapVolumeData = Array.isArray(bigQueryData.swapVolumeData) ? bigQueryData.swapVolumeData : [];
    // Set immediately to display historical data in the UI
    setSwapVolumeData(newSwapVolumeData);

    // Process Pool Metrics Chart data (historical)
    let poolData: PoolMetricsData[] = bigQueryData.poolMetricsData.map((row: any) => ({
      pool_address: row.pool_address.toLowerCase(),
      median_gas_fee_eth: parseFloat(row.median_gas_fee_eth),
      swap_count: parseInt(row.swap_count),
      total_volume_usd: parseFloat(row.total_volume_usd),
    }));
    (async () => {
    let curvePoolsData: { [key: string]: { tvl: number; baseApy: number } } = {};
    try {
      const response = await fetch("https://api.curve.fi/v1/getPools/big/ethereum");
      const data = await response.json();
      if (data.success && data.data.poolData) {
        curvePoolsData = data.data.poolData.reduce((acc: any, pool: any) => {
          acc[pool.address.toLowerCase()] = {
            tvl: pool.usdTotal || 0,
          };
          return acc;
        }, {});
      }
    } catch (error) {
      console.error("Error fetching Curve API (getPools):", error);
    }

    try {
      const volumeResponse = await fetch("https://api.curve.fi/v1/getVolumes/ethereum");
      const volumeData = await volumeResponse.json();
      if (volumeData.data && Array.isArray(volumeData.data.pools)) {
        volumeData.data.pools.forEach((pool: any) => {
          const poolAddress = pool.address.toLowerCase();
          if (curvePoolsData[poolAddress]) {
            curvePoolsData[poolAddress].baseApy = pool.latestDailyApyPcent || 0;
          }
        });
      }
    } catch (error) {
      console.error("Error fetching Curve volume API:", error);
    }

    poolData = poolData.map(pool => {
      const poolAddress = pool.pool_address.toLowerCase();
      const curveData = curvePoolsData[poolAddress] || { tvl: 0, baseApy: 0 };
      return {
        ...pool,
        tvl_usd: curveData.tvl,
        apr: curveData.baseApy,
      };
    });
    // Set immediately to display historical data in the UI
    setPoolMetricsData(poolData);
    })();
    // Set wallet metrics (historical)
    setActiveWallets(bigQueryData.activeWallets);
    setDormantWallets(bigQueryData.dormantWallets);


    return {
      dailyData: bigQueryData.dailyData,
      monthlyData: bigQueryData.monthlyData,
      dailyWalletGrowth: bigQueryData.dailyWalletGrowth,
      activeWallets: bigQueryData.activeWallets,
      dormantWallets: bigQueryData.dormantWallets,
      hourlyVelocity: bigQueryData.hourlyVelocity,
      gasComparisonData,
      timeOfDayData,
      swapVolumeData: newSwapVolumeData,
      poolMetricsData: poolData,
    };

  };

  useEffect(() => {
    let unsubscribeTransfers: () => void;
    let unsubscribeLpEvents: () => void;

    const loadData = async () => {
      try {
        if (ethPriceLoading) {
          await new Promise<void>(resolve => {
            const checkEthPrice = () => {
              if (!ethPriceLoading) resolve();
              else setTimeout(checkEthPrice, 100);
            };
            checkEthPrice();
          });
        }

        let bigQueryData = await fetchBigQueryData();
        if (!bigQueryData) {
          setLoading(false);
          setSwapVolumeData([]);
          return;
        }

        const historicalData = processBigQueryData(bigQueryData);

        unsubscribeTransfers = onSnapshot(
          collection(db, "transfer_transactions"),
          (snapshot: QuerySnapshot<any>) => {
            const transactions = snapshot.docs.map((doc) => doc.data());
            setTransfers(transactions);

            // Check if collection is empty to trigger BigQuery refresh
            if (snapshot.size === 0 && !refreshTimeoutRef.current) {
              console.log("transfer_transactions is empty, scheduling BigQuery refresh...");
              refreshTimeoutRef.current = setTimeout(async () => {
                console.log("Refreshing BigQuery data after 3 seconds...");
                const newBigQueryData = await fetchBigQueryData();
                if (newBigQueryData) {
                  const newHistoricalData = processBigQueryData(newBigQueryData);
                  historicalData.dailyData = newHistoricalData.dailyData;
                  historicalData.monthlyData = newHistoricalData.monthlyData;
                  historicalData.dailyWalletGrowth = newHistoricalData.dailyWalletGrowth;
                  historicalData.activeWallets = newHistoricalData.activeWallets;
                  historicalData.dormantWallets = newHistoricalData.dormantWallets;
                  historicalData.hourlyVelocity = newHistoricalData.hourlyVelocity;
                  // Update all chart data with new historical data
                  setGasFeesData(newHistoricalData.gasComparisonData);
                  setTimeOfDay(newHistoricalData.timeOfDayData);
                  setSwapVolumeData(newHistoricalData.swapVolumeData);
                  setPoolMetricsData(newHistoricalData.poolMetricsData);
                }
                refreshTimeoutRef.current = null;
              }, 3000);
            }
            prevTransferCountRef.current = snapshot.size;

            const now = new Date();
            const oneHourAgo = now.getTime() - 3600000;
            const recentTx = transactions.filter(t => new Date(t.timestamp).getTime() >= oneHourAgo);
            const calculatedTxPerHour = recentTx.length;
            setTxPerHour(calculatedTxPerHour);
            setMaxTxPerHour(500);

            const dailyMap = transactions.reduce((acc: Record<string, number>, tx: any) => {
              const timestampMs = new Date(tx.timestamp).getTime();
              const date = new Date(timestampMs).toISOString().split("T")[0];
              const value = Number(tx.value);
              if (date && !isNaN(value)) acc[date] = (acc[date] || 0) + value;
              return acc;
            }, {});

            const monthlyMap = transactions.reduce((acc: Record<string, number>, tx: any) => {
              const timestampMs = new Date(tx.timestamp).getTime();
              const dateObj = new Date(timestampMs);
              const yearMonth = `${dateObj.getFullYear()}-${(dateObj.getMonth() + 1).toString().padStart(2, "0")}`;
              const value = Number(tx.value);
              if (yearMonth && !isNaN(value)) acc[yearMonth] = (acc[yearMonth] || 0) + value;
              return acc;
            }, {});

            const combinedDaily = { ...dailyMap };
            historicalData.dailyData.forEach((d: any) => {
              if (d.date && !isNaN(d.value)) combinedDaily[d.date] = (combinedDaily[d.date] || 0) + d.value;
            });

            const combinedMonthly = { ...monthlyMap };
            historicalData.monthlyData.forEach((d: any) => {
              if (d.date && !isNaN(d.value)) combinedMonthly[d.date] = (combinedMonthly[d.date] || 0) + d.value;
            });

            const thirtyDaysAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;
            const formattedDailyData = Object.entries(combinedDaily)
              .map(([date, value]) => ({ date, value: Number(value.toFixed(2)) }))
              .filter((d) => {
                const dateMs = new Date(d.date).getTime();
                return d.date && !isNaN(d.value) && dateMs >= thirtyDaysAgo;
              })
              .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            const formattedMonthlyData = Object.entries(combinedMonthly)
              .map(([date, value]) => ({ date, value: Number(value.toFixed(2)) }))
              .filter((d) => d.date && !isNaN(d.value))
              .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            setDailyVolume(formattedDailyData);
            setMonthlyVolume(formattedMonthlyData);

            const seenWallets = new Set(historicalData.dailyWalletGrowth.flatMap((row: any) => [row.sender, row.receiver]));
            const realTimeNewWallets = transactions.reduce((acc: any, t: any) => {
              const date = new Date(t.timestamp).toISOString().split("T")[0];
              if (!seenWallets.has(t.sender)) {
                acc[date] = (acc[date] || 0) + 1;
                seenWallets.add(t.sender);
              }
              if (!seenWallets.has(t.receiver)) {
                acc[date] = (acc[date] || 0) + 1;
                seenWallets.add(t.receiver);
              }
              return acc;
            }, {});

            const realTimeWalletGrowth = Object.entries(realTimeNewWallets).map(([date, count]) => ({
              date,
              newWallets: count,
            }));

            const combinedWalletGrowth = [...historicalData.dailyWalletGrowth];
            realTimeWalletGrowth.forEach((rt: any) => {
              const existing = combinedWalletGrowth.find((d: any) => d.date === rt.date);
              if (existing) existing.newWallets += rt.newWallets;
              else combinedWalletGrowth.push(rt);
            });

            setWalletGrowthData(combinedWalletGrowth.sort((a: any, b: any) => a.date.localeCompare(b.date)));

            const realTimeActiveSet = new Set();
            transactions.forEach((t: any) => {
              if (new Date(t.timestamp).getTime() >= thirtyDaysAgo) {
                realTimeActiveSet.add(t.sender);
                realTimeActiveSet.add(t.receiver);
              }
            });

            const combinedActive = historicalData.activeWallets + realTimeActiveSet.size;
            const totalWallets = historicalData.activeWallets + historicalData.dormantWallets + new Set(transactions.flatMap((t: any) => [t.sender, t.receiver])).size;
            const combinedDormant = totalWallets - combinedActive;

            setActiveWallets(combinedActive);
            setDormantWallets(combinedDormant);
          },
          (error) => {
            console.error("Firestore error (transfer_transactions):", error);
          }
        );

        unsubscribeLpEvents = onSnapshot(
          collection(db, "lp_and_transfers"),
          async (snapshot: QuerySnapshot<any>) => {
            const events = snapshot.docs.map((doc) => doc.data());
            setLpEvents(events);

            // Check if collection is empty to trigger BigQuery refresh
            if (snapshot.size === 0 && !refreshTimeoutRef.current) {
              console.log("lp_and_transfers is empty, scheduling BigQuery refresh...");
              refreshTimeoutRef.current = setTimeout(async () => {
                console.log("Refreshing BigQuery data after 3 seconds...");
                const newBigQueryData = await fetchBigQueryData();
                if (newBigQueryData) {
                  const newHistoricalData = processBigQueryData(newBigQueryData);
                  historicalData.dailyData = newHistoricalData.dailyData;
                  historicalData.monthlyData = newHistoricalData.monthlyData;
                  historicalData.dailyWalletGrowth = newHistoricalData.dailyWalletGrowth;
                  historicalData.activeWallets = newHistoricalData.activeWallets;
                  historicalData.dormantWallets = newHistoricalData.dormantWallets;
                  historicalData.hourlyVelocity = newHistoricalData.hourlyVelocity;
                  // Update all chart data with new historical data
                  setGasFeesData(newHistoricalData.gasComparisonData);
                  setTimeOfDay(newHistoricalData.timeOfDayData);
                  setSwapVolumeData(newHistoricalData.swapVolumeData);
                  setPoolMetricsData(newHistoricalData.poolMetricsData);
                }
                refreshTimeoutRef.current = null;
              }, 3000);
            }
            prevLpCountRef.current = snapshot.size;

            const now = new Date();
            const thirtyDaysAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;

            // Update Gas Fees Chart with real-time data
            const realTimeGasFees = events
              .filter(e => e.block_timestamp >= thirtyDaysAgo)
              .reduce((acc: Record<string, { [type: string]: { totalGasEth: number; count: number } }>, event: any) => {
                const date = new Date(event.block_timestamp).toISOString().split("T")[0];
                const eventType = event.event_type;
                const gasFeeEth = (event.gas_price * event.gas_used) / 1e18;
                if (!acc[date]) acc[date] = {};
                if (!acc[date][eventType]) acc[date][eventType] = { totalGasEth: 0, count: 0 };
                acc[date][eventType].totalGasEth += gasFeeEth;
                acc[date][eventType].count += 1;
                return acc;
              }, {});

            const realTimeGasFeeData = Object.entries(realTimeGasFees).flatMap(([date, types]) =>
              Object.entries(types).map(([eventType, { totalGasEth, count }]) => ({
                event_date: date,
                event_type: eventType,
                avg_gas_fee_eth: totalGasEth / count,
                avg_gas_fee_usd: ethPrice ? (totalGasEth / count) * ethPrice : 0,
                transaction_count: count,
              }))
            );

            const combinedGasFeeData = [...gasFeeData];
            realTimeGasFeeData.forEach(rt => {
              const existing = combinedGasFeeData.find(
                d => d.event_date === rt.event_date && d.event_type === rt.event_type
              );
              if (existing) {
                existing.avg_gas_fee_eth = (existing.avg_gas_fee_eth * existing.transaction_count + rt.avg_gas_fee_eth * rt.transaction_count) / (existing.transaction_count + rt.transaction_count);
                existing.avg_gas_fee_usd = ethPrice ? existing.avg_gas_fee_eth * ethPrice : 0;
                existing.transaction_count += rt.transaction_count;
              } else {
                combinedGasFeeData.push(rt);
              }
            });
            setGasFeesData(combinedGasFeeData.sort((a, b) => a.event_date.localeCompare(b.event_date)));

            // Update Time of Day Chart with real-time data
            const realTimeTimeOfDay = events
              .filter(e => e.block_timestamp >= thirtyDaysAgo)
              .map(event => {
                const date = new Date(event.block_timestamp);
                const eventDate = date.toISOString().split("T")[0];
                const hourOfDay = date.getUTCHours();
                const gasFeeEth = (event.gas_price * event.gas_used) / 1e18;
                return {
                  event_date: eventDate,
                  hour_of_day: hourOfDay,
                  avg_gas_fee_eth: gasFeeEth,
                  avg_gas_fee_usd: ethPrice ? gasFeeEth * ethPrice : 0,
                  transaction_count: 1,
                };
              })
              .reduce((acc: Record<string, { totalGasEth: number; totalGasUsd: number; count: number }>, event) => {
                const key = `${event.event_date}-${event.hour_of_day}`;
                if (!acc[key]) {
                  acc[key] = { totalGasEth: 0, totalGasUsd: 0, count: 0 };
                }
                acc[key].totalGasEth += event.avg_gas_fee_eth;
                acc[key].totalGasUsd += event.avg_gas_fee_usd;
                acc[key].count += event.transaction_count;
                return acc;
              }, {});

            const realTimeTimeOfDayData = Object.entries(realTimeTimeOfDay).map(([key, { totalGasEth, totalGasUsd, count }]) => {
              const [event_date, hour_of_day] = key.split('-');
              return {
                event_date,
                hour_of_day: parseInt(hour_of_day),
                avg_gas_fee_eth: totalGasEth / count,
                avg_gas_fee_usd: totalGasUsd / count,
                transaction_count: count,
              };
            });

            const combinedTimeOfDay = [...timeOfDay];
            realTimeTimeOfDayData.forEach(rt => {
              const existing = combinedTimeOfDay.find(
                d => d.event_date === rt.event_date && d.hour_of_day === rt.hour_of_day
              );
              if (existing) {
                existing.avg_gas_fee_eth = (existing.avg_gas_fee_eth * existing.transaction_count + rt.avg_gas_fee_eth * rt.transaction_count) / (existing.transaction_count + rt.transaction_count);
                existing.avg_gas_fee_usd = (existing.avg_gas_fee_usd * existing.transaction_count + rt.avg_gas_fee_usd * rt.transaction_count) / (existing.transaction_count + rt.transaction_count);
                existing.transaction_count += rt.transaction_count;
              } else {
                combinedTimeOfDay.push(rt);
              }
            });
            setTimeOfDay(combinedTimeOfDay.sort((a, b) => a.event_date.localeCompare(b.event_date) || a.hour_of_day - b.hour_of_day));

            // Update Swap Volume Chart with real-time data
            const realTimeSwapVolume = events
              .filter(e => e.event_type === 'Swap' && e.block_timestamp >= thirtyDaysAgo)
              .reduce((acc: Record<string, { [pool: string]: number }>, event: any) => {
                const date = new Date(event.block_timestamp).toISOString().split("T")[0];
                const poolAddress = event.address.toLowerCase();
                let volumeUsd = 0;
                if (event.event_type === 'Swap') {
                  if (poolAddress === UNISWAP_POOL) {
                    // Uniswap pool: args[2] and args[3] are amount0 and amount1
                    const amount0 = parseFloat(event.args[2]) / 1_000_000; // PYUSD (6 decimals)
                    const amount1 = parseFloat(event.args[3]) / 1_000_000; // USDT (6 decimals)
                    volumeUsd = Math.abs(amount0) + Math.abs(amount1);
                  } else if (poolAddress === CURVE_POOL_PYUSD_CRVUSD) {
                    // Curve pool: PYUSD/crvUSD
                    const soldId = parseInt(event.args.sold_id);
                    const boughtId = parseInt(event.args.bought_id);
                    const tokensSoldDecimals = soldId === 0 ? 1_000_000 : 1_000_000_000_000_000_000; // PYUSD (6) or crvUSD (18)
                    const tokensBoughtDecimals = boughtId === 0 ? 1_000_000 : 1_000_000_000_000_000_000; // PYUSD (6) or crvUSD (18)
                    const tokensSold = parseFloat(event.args.tokens_sold) / tokensSoldDecimals;
                    const tokensBought = parseFloat(event.args.tokens_bought) / tokensBoughtDecimals;
                    volumeUsd = tokensSold + tokensBought;
                  } else if (poolAddress === CURVE_POOL_PYUSD_USDC) {
                    // Curve pool: PYUSD/USDC
                    const tokensSold = parseFloat(event.args.tokens_sold) / 1_000_000; // PYUSD (6 decimals)
                    const tokensBought = parseFloat(event.args.tokens_bought) / 1_000_000; // USDC (6 decimals)
                    volumeUsd = tokensSold + tokensBought;
                  }
                }
                if (!acc[date]) acc[date] = {};
                acc[date][poolAddress] = (acc[date][poolAddress] || 0) + volumeUsd;
                return acc;
              }, {});

            const realTimeSwapVolumeData = Object.entries(realTimeSwapVolume).flatMap(([date, pools]) =>
              Object.entries(pools).map(([pool_address, total_volume_usd]) => ({
                pool_address,
                date,
                total_volume_usd,
              }))
            );

            const combinedSwapVolume = [...swapVolumeData];
            realTimeSwapVolumeData.forEach(rt => {
              const existing = combinedSwapVolume.find(
                d => d.date === rt.date && d.pool_address === rt.pool_address
              );
              if (existing) {
                existing.total_volume_usd += rt.total_volume_usd;
              } else {
                combinedSwapVolume.push(rt);
              }
            });
            setSwapVolumeData(combinedSwapVolume.sort((a, b) => a.date.localeCompare(b.date)));

            // Update Pool Metrics Chart with real-time data
            const realTimePoolMetrics = events
              .filter(e => e.event_type === 'Swap' && e.block_timestamp >= thirtyDaysAgo)
              .reduce((acc: Record<string, { medianGasFees: number[]; swap_count: number; total_volume_usd: number }>, event: any) => {
                const poolAddress = event.address.toLowerCase();
                const gasFeeEth = (event.gas_price * event.gas_used) / 1e18;
                let volumeUsd = 0;
                if (event.event_type === 'Swap') {
                  if (poolAddress === UNISWAP_POOL) {
                    const amount0 = parseFloat(event.args[2]) / 1_000_000;
                    const amount1 = parseFloat(event.args[3]) / 1_000_000;
                    volumeUsd = Math.abs(amount0) + Math.abs(amount1);
                  } else if (poolAddress === CURVE_POOL_PYUSD_CRVUSD) {
                    const soldId = parseInt(event.args.sold_id);
                    const boughtId = parseInt(event.args.bought_id);
                    const tokensSoldDecimals = soldId === 0 ? 1_000_000 : 1_000_000_000_000_000_000;
                    const tokensBoughtDecimals = boughtId === 0 ? 1_000_000 : 1_000_000_000_000_000_000;
                    const tokensSold = parseFloat(event.args.tokens_sold) / tokensSoldDecimals;
                    const tokensBought = parseFloat(event.args.tokens_bought) / tokensBoughtDecimals;
                    volumeUsd = tokensSold + tokensBought;
                  } else if (poolAddress === CURVE_POOL_PYUSD_USDC) {
                    const tokensSold = parseFloat(event.args.tokens_sold) / 1_000_000;
                    const tokensBought = parseFloat(event.args.tokens_bought) / 1_000_000;
                    volumeUsd = tokensSold + tokensBought;
                  }
                }
                if (!acc[poolAddress]) {
                  acc[poolAddress] = { medianGasFees: [], swap_count: 0, total_volume_usd: 0 };
                }
                acc[poolAddress].medianGasFees.push(gasFeeEth);
                acc[poolAddress].swap_count += 1;
                acc[poolAddress].total_volume_usd += volumeUsd;
                return acc;
              }, {});

            const realTimePoolMetricsData = Object.entries(realTimePoolMetrics).map(([pool_address, data]) => {
              const sortedGasFees = data.medianGasFees.sort((a, b) => a - b);
              const medianGasFeeEth = sortedGasFees[Math.floor(sortedGasFees.length / 2)];
              return {
                pool_address,
                median_gas_fee_eth: medianGasFeeEth,
                swap_count: data.swap_count,
                total_volume_usd: data.total_volume_usd,
                tvl_usd: 0, // Will be updated with Curve API data
                apr: 0,     // Will be updated with Curve API data
              };
            });

            const combinedPoolMetrics = [...poolMetricsData];
            realTimePoolMetricsData.forEach(rt => {
              const existing = combinedPoolMetrics.find(d => d.pool_address === rt.pool_address);
              if (existing) {
                const allGasFees = [...Array(existing.swap_count).fill(existing.median_gas_fee_eth), ...rt.medianGasFees];
                const sortedGasFees = allGasFees.sort((a, b) => a - b);
                existing.median_gas_fee_eth = sortedGasFees[Math.floor(sortedGasFees.length / 2)];
                existing.swap_count += rt.swap_count;
                existing.total_volume_usd += rt.total_volume_usd;
              } else {
                combinedPoolMetrics.push({ ...rt, tvl_usd: 0, apr: 0 });
              }
            });

            // Fetch Curve API data to update TVL and APR
            let curvePoolsData: { [key: string]: { tvl: number; baseApy: number } } = {};
            try {
              const response = await fetch("https://api.curve.fi/v1/getPools/big/ethereum");
              const data = await response.json();
              if (data.success && data.data.poolData) {
                curvePoolsData = data.data.poolData.reduce((acc: any, pool: any) => {
                  acc[pool.address.toLowerCase()] = {
                    tvl: pool.usdTotal || 0,
                  };
                  return acc;
                }, {});
              }
            } catch (error) {
              console.error("Error fetching Curve API (getPools):", error);
            }

            try {
              const volumeResponse = await fetch("https://api.curve.fi/v1/getVolumes/ethereum");
              const volumeData = await volumeResponse.json();
              if (volumeData.data && Array.isArray(volumeData.data.pools)) {
                volumeData.data.pools.forEach((pool: any) => {
                  const poolAddress = pool.address.toLowerCase();
                  if (curvePoolsData[poolAddress]) {
                    curvePoolsData[poolAddress].baseApy = pool.latestDailyApyPcent || 0;
                  }
                });
              }
            } catch (error) {
              console.error("Error fetching Curve volume API:", error);
            }

            const updatedPoolMetrics = combinedPoolMetrics.map(pool => {
              const poolAddress = pool.pool_address.toLowerCase();
              const curveData = curvePoolsData[poolAddress] || { tvl: pool.tvl_usd, baseApy: pool.apr };
              return {
                ...pool,
                tvl_usd: curveData.tvl,
                apr: curveData.baseApy,
              };
            });
            setPoolMetricsData(updatedPoolMetrics);
          },
          (error) => {
            console.error("Firestore error (lp_and_transfers):", error);
          }
        );

        setLoading(false);
      } catch (error) {
        console.error("Error loading data:", error);
        setLoading(false);
      }
    };

    loadData();

    return () => {
      unsubscribeTransfers && unsubscribeTransfers();
      unsubscribeLpEvents && unsubscribeLpEvents();
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, [ethPrice, ethPriceLoading]);

  const value: DataContextType = {
    dailyVolume,
    monthlyVolume,
    walletGrowthData,
    transfers,
    lpEvents,
    txPerHour,
    maxTxPerHour,
    activeWallets,
    dormantWallets,
    loading,
    gasFeeData,
    timeOfDay,
    swapVolumeData,
    poolMetricsData,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error("useData must be used within a DataProvider");
  }
  return context;
};