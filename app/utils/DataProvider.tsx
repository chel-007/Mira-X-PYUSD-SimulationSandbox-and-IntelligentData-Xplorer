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
  realTimeLoading: boolean;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

// Pool addresses
const UNISWAP_POOL = "0xdd2e0d86a45e4ef9bd490c2809e6405720cc357c"; // PYUSD/USDT
const CURVE_POOL_PYUSD_CRVUSD = "0x625e92624bc2d88619accc1788365a69767f6200"; // PYUSD/crvUSD
const CURVE_POOL_PYUSD_USDC = "0x383e6b4437b59fff47b619cba855ca29342a8559"; // PYUSD/USDC

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Historical data states
  const [historicalDailyVolume, setHistoricalDailyVolume] = useState<{ date: string; value: number }[]>([]);
  const [historicalMonthlyVolume, setHistoricalMonthlyVolume] = useState<{ date: string; value: number }[]>([]);
  const [historicalWalletGrowthData, setHistoricalWalletGrowthData] = useState<
    { date: string; newWallets: number; wallets?: string[] }[]
  >([]);
  const [historicalActiveWallets, setHistoricalActiveWallets] = useState<number>(0);
  const [historicalDormantWallets, setHistoricalDormantWallets] = useState<number>(0);
  const [historicalHourlyVelocity, setHistoricalHourlyVelocity] = useState<{ hour: string; txPerHour: number }[]>([]);
  const [historicalActiveWalletSet, setHistoricalActiveWalletSet] = useState<Set<string>>(new Set());
  const [historicalGasFeeData, setHistoricalGasFeeData] = useState<GasFeeOverTimeData[]>([]);
  const [historicalTimeOfDay, setHistoricalTimeOfDay] = useState<TimeOfDayData[]>([]);
  const [historicalSwapVolumeData, setHistoricalSwapVolumeData] = useState<
    { pool_address: string; date: string; total_volume_usd: number }[]
  >([]);
  const [historicalPoolMetricsData, setHistoricalPoolMetricsData] = useState<PoolMetricsData[]>([]);

  // Real-time data states
  const [realTimeDailyVolume, setRealTimeDailyVolume] = useState<{ date: string; value: number }[]>([]);
  const [realTimeMonthlyVolume, setRealTimeMonthlyVolume] = useState<{ date: string; value: number }[]>([]);
  const [realTimeWalletGrowthData, setRealTimeWalletGrowthData] = useState<
    { date: string; newWallets: number }[]
  >([]);
  const [realTimeActiveWallets, setRealTimeActiveWallets] = useState<number>(0);
  const [realTimeDormantWallets, setRealTimeDormantWallets] = useState<number>(0);
  const [realTimeGasFeeData, setRealTimeGasFeeData] = useState<GasFeeOverTimeData[]>([]);
  const [realTimeTimeOfDay, setRealTimeTimeOfDay] = useState<TimeOfDayData[]>([]);
  const [realTimeSwapVolumeData, setRealTimeSwapVolumeData] = useState<
    { pool_address: string; date: string; total_volume_usd: number }[]
  >([]);
  const [realTimePoolMetricsData, setRealTimePoolMetricsData] = useState<PoolMetricsData[]>([]);

  // Combined data states (for rendering)
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
  const [realTimeLoading, setRealTimeLoading] = useState(true);
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
  const historicalDataRef = useRef(null);

  const fetchBigQueryData = async () => {
    const response = await fetch("/api/bigQueryTransactions");
    const bigQueryData = await response.json();
    if (bigQueryData.error) {
      console.error("Failed to fetch BigQuery data:", bigQueryData.error);
      return null;
    }
    return bigQueryData;
  };

  const fetchCurveData = async () => {
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
    return curvePoolsData;
  };

  const processBigQueryData = async (bigQueryData: any) => {
    // console.log("Raw BigQuery dailyWalletGrowth:", bigQueryData.dailyWalletGrowth);
    // Process Daily Volume (historical)
    const dailyData = bigQueryData.dailyData.map((row: any) => ({
      date: row.date,
      value: parseFloat(row.value),
    }));

    // Process Monthly Volume (historical)
    const monthlyData = bigQueryData.monthlyData.map((row: any) => ({
      date: row.date,
      value: parseFloat(row.value),
    }));

    const hourlyVelocity = bigQueryData.hourlyVelocity.map((row: any) => ({
        hour: row.hour,
        txPerHour: row.txPerHour,
      }));

    // Process Wallet Growth (historical)
    const dailyWalletGrowth = bigQueryData.dailyWalletGrowth.map((row: any) => ({
      date: row.date,
      newWallets: Number(row.newWallets),
      wallets: row.wallets || [], // Assuming the query includes wallet addresses
    }));
    // console.log("BigQuery Wallet Growth Data:", dailyWalletGrowth);

    // Process Gas Fees Chart data (historical)
    // const gasComparisonData = bigQueryData.gasComparisonData.map((row: any) => {
    //   const avgGasFeeEth = parseFloat(row.avg_gas_fee_eth);
    //   return {
    //     event_date: row.event_date,
    //     event_type: row.event_type,
    //     avg_gas_fee_eth: avgGasFeeEth,
    //     avg_gas_fee_usd: ethPrice ? avgGasFeeEth * ethPrice : 0,
    //     transaction_count: parseInt(row.transaction_count),
    //   };
    // });

    // Process Time of Day Chart data (historical)
    // const timeOfDayData = bigQueryData.timeOfDayData.map((row: any) => {
    //   const avgGasFeeEth = parseFloat(row.avg_gas_fee_eth);
    //   return {
    //     event_date: row.event_date,
    //     hour_of_day: parseInt(row.hour_of_day),
    //     avg_gas_fee_eth: avgGasFeeEth,
    //     avg_gas_fee_usd: ethPrice ? avgGasFeeEth * ethPrice : 0,
    //     transaction_count: parseInt(row.transaction_count),
    //   };
    // });

    // // Process Swap Volume Chart data (historical)
    // const swapVolumeData = Array.isArray(bigQueryData.swapVolumeData)
    //   ? bigQueryData.swapVolumeData.map((row: any) => ({
    //       pool_address: row.pool_address.toLowerCase(),
    //       date: row.date,
    //       total_volume_usd: parseFloat(row.total_volume_usd),
    //     }))
    //   : [];

    // Process Pool Metrics Chart data (historical)
    // let poolData: PoolMetricsData[] = bigQueryData.poolMetricsData.map((row: any) => ({
    //   pool_address: row.pool_address.toLowerCase(),
    //   median_gas_fee_eth: parseFloat(row.median_gas_fee_eth),
    //   swap_count: parseInt(row.swap_count),
    //   total_volume_usd: parseFloat(row.total_volume_usd),
    //   tvl_usd: 0, // Will be updated with Curve API data
    //   apr: 0, // Will be updated with Curve API data
    // }));

    // Fetch Curve API data for TVL and APR
    // const curvePoolsData = await fetchCurveData();
    // poolData = poolData.map(pool => {
    //   const poolAddress = pool.pool_address.toLowerCase();
    //   const curveData = curvePoolsData[poolAddress] || { tvl: 0, baseApy: 0 };
    //   return {
    //     ...pool,
    //     tvl_usd: curveData.tvl,
    //     apr: curveData.baseApy,
    //   };
    // });

    return {
      dailyData,
      monthlyData,
      dailyWalletGrowth,
      activeWallets: bigQueryData.activeWallets,
      totalWallets: bigQueryData.totalWallets,
    //   dormantWallets: bigQueryData.dormantWallets,
      hourlyVelocity,
      // gasComparisonData,
      // timeOfDayData,
      // swapVolumeData,
      // poolMetricsData: poolData,
    };
  };

  // Helper function to refresh BigQuery data and update states
  const refreshBigQueryData = async () => {
    const bigQueryData = await fetchBigQueryData();
    if (!bigQueryData) return null;
    const historicalData = await processBigQueryData(bigQueryData);

    historicalDataRef.current = historicalData;

    setHistoricalDailyVolume(historicalData.dailyData);
    setHistoricalMonthlyVolume(historicalData.monthlyData);
    setHistoricalWalletGrowthData(historicalData.dailyWalletGrowth);
    setHistoricalActiveWallets(historicalData.activeWallets);
    setHistoricalHourlyVelocity(historicalData.hourlyVelocity);
    // setHistoricalGasFeeData(historicalData.gasComparisonData);
    // setHistoricalTimeOfDay(historicalData.timeOfDayData);
    // setHistoricalSwapVolumeData(historicalData.swapVolumeData);
    // setHistoricalPoolMetricsData(historicalData.poolMetricsData);

const activeWalletSet = new Set(historicalData.activeWallets);
  setHistoricalActiveWalletSet(activeWalletSet);
  setHistoricalActiveWallets(activeWalletSet.size); // Still a number here
  setHistoricalDormantWallets(historicalData.totalWallets - activeWalletSet.size);

    return historicalData; // Return for potential use (e.g., totalWallets)
  };

  // Fetch historical data once on mount
  useEffect(() => {
    const loadHistoricalData = async () => {
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

        setLoading(true);
        const historicalData = await refreshBigQueryData();
        if (!historicalData) {
          setLoading(false);
          setSwapVolumeData([]);
          return;
        }

        const totalHistoricalWallets = historicalData.totalWallets;
       

          // Subscribe to transfer_transactions for real-time updates
    const unsubscribeTransfers = onSnapshot(
      collection(db, "transfer_transactions"),
      (snapshot: QuerySnapshot<any>) => {
        const transactions = snapshot.docs.map((doc) => doc.data());
        setTransfers(transactions);

        const now = new Date();
        const oneHourAgo = now.getTime() - 3600000;
        const thirtyDaysAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;

        // Check if collection is empty to trigger BigQuery refresh
        if (snapshot.size === 0 && !refreshTimeoutRef.current) {
          console.log("transfer_transactions is empty, scheduling BigQuery refresh...");
          refreshTimeoutRef.current = setTimeout(async () => {
            console.log("Refreshing BigQuery data after 3 seconds...");
            await refreshBigQueryData();
            refreshTimeoutRef.current = null;
          }, 3000);
        }

        prevTransferCountRef.current = snapshot.size;

        console.log("prevtransfercountref", prevTransferCountRef.current)

        // Update transaction velocity
        // Get the current hour truncated to match BigQuery's format (e.g., "2025-03-30 14:00:00 UTC")
        const currentHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours()).toISOString();
        const historicalHour = historicalDataRef.current?.hourlyVelocity.find(row => row.hour === currentHour);
        const historicalTxCount = historicalHour ? historicalHour.txPerHour : 0;
        console.log("velocity now", currentHour)
        console.log("velocityhour", historicalHour)
        console.log("velocityhistory", historicalTxCount)
        console.log("main velocity", historicalData.hourlyVelocity)

        const recentTx = transactions.filter(t => new Date(t.timestamp).getTime() >= oneHourAgo);
        const realTimeTxCount = recentTx.length;

        const calculatedTxPerHour = historicalTxCount + realTimeTxCount;
        setTxPerHour(calculatedTxPerHour);
        setMaxTxPerHour(500);

        // Update Daily Volume (real-time)
        const dailyMap = transactions.reduce((acc: Record<string, number>, tx: any) => {
          const timestampMs = new Date(tx.timestamp).getTime();
          const date = new Date(timestampMs).toISOString().split("T")[0];
          const value = Number(tx.value);
          if (date && !isNaN(value)) acc[date] = (acc[date] || 0) + value;
          return acc;
        }, {});

        const formattedDailyData = Object.entries(dailyMap)
          .map(([date, value]) => ({ date, value: Number(value.toFixed(2)) }))
          .filter((d) => {
            const dateMs = new Date(d.date).getTime();
            return d.date && !isNaN(d.value) && dateMs >= thirtyDaysAgo;
          })
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        setRealTimeDailyVolume(formattedDailyData);

        // Update Monthly Volume (real-time)
        const monthlyMap = transactions.reduce((acc: Record<string, number>, tx: any) => {
          const timestampMs = new Date(tx.timestamp).getTime();
          const dateObj = new Date(timestampMs);
          const yearMonth = `${dateObj.getFullYear()}-${(dateObj.getMonth() + 1).toString().padStart(2, "0")}`;
          const value = Number(tx.value);
          if (yearMonth && !isNaN(value)) acc[yearMonth] = (acc[yearMonth] || 0) + value;
          return acc;
        }, {});

        const formattedMonthlyData = Object.entries(monthlyMap)
          .map(([date, value]) => ({ date, value: Number(value.toFixed(2)) }))
          .filter((d) => d.date && !isNaN(d.value))
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        setRealTimeMonthlyVolume(formattedMonthlyData);

        // Update Wallet Growth (real-time)
        const seenWallets = new Set(historicalDataRef.current?.dailyWalletGrowth.flatMap((row: any) => row.wallets || []));
        // console.log("seenwallets", historicalWalletGrowthData)
        const realTimeNewWallets = transactions.reduce((acc: Record<string, number>, t: any) => {
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
        newWallets: Number(count), // Ensure count is a number
        }));

        setRealTimeWalletGrowthData(realTimeWalletGrowth);
        // console.log("realtimewallet growth",realTimeWalletGrowth)

        // Update Active and Dormant Wallets (real-time)
        // Update Active and Dormant Wallets (real-time)
          const allHistoricalWallets = new Set(historicalDataRef.current?.dailyWalletGrowth.flatMap((row: any) => row.wallets || []));
        //   console.log("allhistoricalwallets", allHistoricalWallets);
          const allRealTimeWallets = new Set(transactions.flatMap((t: any) => [t.sender, t.receiver]));
        //   console.log("allRealTimeWallets", allRealTimeWallets);
          const allWallets = new Set([...allHistoricalWallets, ...allRealTimeWallets]);
        //   console.log("allWallets", allWallets);

          // Use totalWallets from BigQuery as the authoritative total
          const totalWalletsBase = totalHistoricalWallets;
          const totalWallets = Math.max(totalWalletsBase, allWallets.size); // Adjust if real-time adds new wallets

          const activeSet = new Set(historicalDataRef.current?.activeWallets);
        //   console.log(activeSet)
          transactions.forEach((t: any) => {
            if (new Date(t.timestamp).getTime() >= thirtyDaysAgo) {
              activeSet.add(t.sender);
              activeSet.add(t.receiver);
            }
          });

          const activeWalletsCount = activeSet.size;
          const dormantWalletsCount = totalWallets - activeWalletsCount;

          setRealTimeActiveWallets(activeWalletsCount);
          setRealTimeDormantWallets(dormantWalletsCount);

        //   console.log("Real-Time Total Wallets:", totalWallets);
        //   console.log("Real-Time Active Wallets:", activeWalletsCount);
        //   console.log("Real-Time Dormant Wallets:", dormantWalletsCount);
       
        setLoading(false);
      },
      (error) => {
        console.error("Firestore error (transfer_transactions):", error);

        setLoading(false);
      }
    );

    return () => {
      unsubscribeTransfers();
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
    };

      } catch (error) {
        console.error("Error loading historical data:", error);
        setLoading(false);
      }
    };

    loadHistoricalData();
  }, [ethPrice, ethPriceLoading]);

//   // Subscribe to transfer_transactions for real-time updates
//   useEffect(() => {
//     const unsubscribeTransfers = onSnapshot(
//       collection(db, "transfer_transactions"),
//       (snapshot: QuerySnapshot<any>) => {
//         const transactions = snapshot.docs.map((doc) => doc.data());
//         setTransfers(transactions);

//         const now = new Date();
//         const oneHourAgo = now.getTime() - 3600000;
//         const thirtyDaysAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;

//         // Update transaction velocity
//         const recentTx = transactions.filter(t => new Date(t.timestamp).getTime() >= oneHourAgo);
//         const calculatedTxPerHour = recentTx.length;
//         setTxPerHour(calculatedTxPerHour);
//         setMaxTxPerHour(500);

//         // Update Daily Volume (real-time)
//         const dailyMap = transactions.reduce((acc: Record<string, number>, tx: any) => {
//           const timestampMs = new Date(tx.timestamp).getTime();
//           const date = new Date(timestampMs).toISOString().split("T")[0];
//           const value = Number(tx.value);
//           if (date && !isNaN(value)) acc[date] = (acc[date] || 0) + value;
//           return acc;
//         }, {});

//         const formattedDailyData = Object.entries(dailyMap)
//           .map(([date, value]) => ({ date, value: Number(value.toFixed(2)) }))
//           .filter((d) => {
//             const dateMs = new Date(d.date).getTime();
//             return d.date && !isNaN(d.value) && dateMs >= thirtyDaysAgo;
//           })
//           .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
//         setRealTimeDailyVolume(formattedDailyData);

//         // Update Monthly Volume (real-time)
//         const monthlyMap = transactions.reduce((acc: Record<string, number>, tx: any) => {
//           const timestampMs = new Date(tx.timestamp).getTime();
//           const dateObj = new Date(timestampMs);
//           const yearMonth = `${dateObj.getFullYear()}-${(dateObj.getMonth() + 1).toString().padStart(2, "0")}`;
//           const value = Number(tx.value);
//           if (yearMonth && !isNaN(value)) acc[yearMonth] = (acc[yearMonth] || 0) + value;
//           return acc;
//         }, {});

//         const formattedMonthlyData = Object.entries(monthlyMap)
//           .map(([date, value]) => ({ date, value: Number(value.toFixed(2)) }))
//           .filter((d) => d.date && !isNaN(d.value))
//           .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
//         setRealTimeMonthlyVolume(formattedMonthlyData);

//         // Update Wallet Growth (real-time)
//         const seenWallets = new Set(historicalWalletGrowthData.flatMap((row: any) => row.wallets || []));
//         const realTimeNewWallets = transactions.reduce((acc: Record<string, number>, t: any) => {
//         const date = new Date(t.timestamp).toISOString().split("T")[0];
//         if (!seenWallets.has(t.sender)) {
//             acc[date] = (acc[date] || 0) + 1;
//             seenWallets.add(t.sender);
//         }
//         if (!seenWallets.has(t.receiver)) {
//             acc[date] = (acc[date] || 0) + 1;
//             seenWallets.add(t.receiver);
//         }
//         return acc;
//         }, {});

//         const realTimeWalletGrowth = Object.entries(realTimeNewWallets).map(([date, count]) => ({
//         date,
//         newWallets: Number(count), // Ensure count is a number
//         }));

//         setRealTimeWalletGrowthData(realTimeWalletGrowth);

//         // Update Active and Dormant Wallets (real-time)
//         const realTimeActiveSet = new Set();
//         transactions.forEach((t: any) => {
//           if (new Date(t.timestamp).getTime() >= thirtyDaysAgo) {
//             realTimeActiveSet.add(t.sender);
//             realTimeActiveSet.add(t.receiver);
//           }
//         });

//         const realTimeTotalWallets = new Set(transactions.flatMap((t: any) => [t.sender, t.receiver])).size;
//         setRealTimeActiveWallets(realTimeActiveSet.size);
//         setRealTimeDormantWallets(realTimeTotalWallets - realTimeActiveSet.size);

//         setRealTimeLoading(false);
//       },
//       (error) => {
//         console.error("Firestore error (transfer_transactions):", error);
//         setRealTimeLoading(false);
//       }
//     );

//     return () => unsubscribeTransfers();
//   }, []);

  // Subscribe to lp_and_transfers for real-time updates
  useEffect(() => {
    const unsubscribeLpEvents = onSnapshot(
      collection(db, "lp_and_transfers"),
      async (snapshot: QuerySnapshot<any>) => {
        const events = snapshot.docs.map((doc) => doc.data());
        setLpEvents(events);

        const now = new Date();
        const thirtyDaysAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;

        if (snapshot.size === 0 && !refreshTimeoutRef.current) {
          console.log("transfer_transactions is empty, scheduling BigQuery refresh...");
          refreshTimeoutRef.current = setTimeout(async () => {
            console.log("Refreshing BigQuery data after 3 seconds...");
            await refreshBigQueryData();
            refreshTimeoutRef.current = null;
          }, 3000);
        }


        // Update Gas Fees Chart (real-time)
        // Update Gas Fees Chart (real-time)
        const realTimeGasFees = events
        .filter(e => e.block_timestamp >= thirtyDaysAgo)
        .reduce((acc: Record<string, { [type: string]: { totalGasEth: number; count: number } }>, event: any) => {
            const date = new Date(event.block_timestamp).toISOString().split("T")[0];
            const eventType = event.event_type;
            const gasPrice = Number(event.gas_price); // Ensure number
            const gasUsed = Number(event.gas_used);   // Ensure number
            const gasFeeEth = (gasPrice * gasUsed) / 1e18;

            if (isNaN(gasPrice) || isNaN(gasUsed) || isNaN(gasFeeEth)) {
            console.warn(`Skipping invalid gas data for ${eventType} on ${date}`, { gasPrice, gasUsed });
            return acc;
            }

            if (!acc[date]) acc[date] = {};
            if (!acc[date][eventType]) acc[date][eventType] = { totalGasEth: 0, count: 0 };
            acc[date][eventType].totalGasEth += gasFeeEth;
            acc[date][eventType].count += 1;
            return acc;
        }, {});

        const realTimeGasFeeData = Object.entries(realTimeGasFees).flatMap(([date, types]) =>
        Object.entries(types).map(([eventType, { totalGasEth, count }]) => {
        const avgGasFeeEth = totalGasEth / count;
        return {
            event_date: date,
            event_type: eventType,
            avg_gas_fee_eth: avgGasFeeEth,
            avg_gas_fee_usd: ethPrice ? avgGasFeeEth * ethPrice : 0,
            transaction_count: count,
        };
        })
        );
        console.log("realtimegas", realTimeGasFeeData);
        setRealTimeGasFeeData(realTimeGasFeeData);

        // Update Time of Day Chart (real-time)
        // Update Time of Day Chart (real-time)
        const realTimeTimeOfDay = events
        .filter(e => e.block_timestamp >= thirtyDaysAgo)
        .reduce((acc: Record<string, { totalGasEth: number; totalGasUsd: number; count: number }>, event) => {
          // Ensure valid gas data
          const gasPrice = Number(event.gas_price);
          const gasUsed = Number(event.gas_used);
          const gasFeeEth = (gasPrice * gasUsed) / 1e18;
      
          if (isNaN(gasPrice) || isNaN(gasUsed) || isNaN(gasFeeEth)) {
            console.warn(`Skipping invalid gas data for event at ${event.block_timestamp}`, { gasPrice, gasUsed });
            return acc; // Skip NaN entries
          }
      
          const date = new Date(event.block_timestamp);
          const eventDate = date.toISOString().split("T")[0]; // "2025-03-30"
          console.log("eventdate", eventDate);
          const hourOfDay = date.getUTCHours();
          const gasFeeUsd = ethPrice ? gasFeeEth * ethPrice : 0;
      
          const key = `${eventDate}-${hourOfDay}`; // e.g., "2025-03-30-14"
          console.log("key", key);
          if (!acc[key]) {
            acc[key] = { totalGasEth: 0, totalGasUsd: 0, count: 0 };
          }
          acc[key].totalGasEth += gasFeeEth;
          acc[key].totalGasUsd += gasFeeUsd;
          acc[key].count += 1;
      
          return acc;
        }, {});
      
      const realTimeTimeOfDayData = Object.entries(realTimeTimeOfDay).map(([key, { totalGasEth, totalGasUsd, count }]) => {
        const parts = key.split("-"); // ["2025", "03", "30-14"]
        const event_date = `${parts[0]}-${parts[1]}-${parts[2]}`; // "2025-03-30"
        const hour_of_day = parseInt(parts[3], 10); // 5
        console.log('key parts', parts);
        return {
          event_date, // Full date like "2025-03-30"
          hour_of_day, // Correct hour like 14
          avg_gas_fee_eth: totalGasEth / count,
          avg_gas_fee_usd: totalGasUsd / count,
          transaction_count: count,
        };
      });
      console.log("realtimeofday", realTimeTimeOfDayData);
      setRealTimeTimeOfDay(realTimeTimeOfDayData);

        // Update Swap Volume Chart (real-time)
        const realTimeSwapVolume = events
          .filter(e => e.event_type === "Swap" && e.block_timestamp >= thirtyDaysAgo)
          .reduce((acc: Record<string, { [pool: string]: number }>, event: any) => {
            const date = new Date(event.block_timestamp).toISOString().split("T")[0];
            const poolAddress = event.address.toLowerCase();
            let volumeUsd = 0;
            if (event.event_type === "Swap") {
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
        setRealTimeSwapVolumeData(realTimeSwapVolumeData);

        // Update Pool Metrics Chart (real-time)
        const realTimePoolMetrics = events
          .filter(e => e.event_type === "Swap" && e.block_timestamp >= thirtyDaysAgo)
          .reduce((acc: Record<string, { medianGasFees: number[]; swap_count: number; total_volume_usd: number }>, event: any) => {
            const poolAddress = event.address.toLowerCase();
            const gasFeeEth = (event.gas_price * event.gas_used) / 1e18;
            let volumeUsd = 0;
            if (event.event_type === "Swap") {
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
            apr: 0, // Will be updated with Curve API data
          };
        });
        setRealTimePoolMetricsData(realTimePoolMetricsData);
        setRealTimeLoading(false);
      },
      (error) => {
        console.error("Firestore error (lp_and_transfers):", error);
        setRealTimeLoading(false);
      }
    );

    return () => unsubscribeLpEvents();
  }, [ethPrice]);

  // Combine historical and real-time data for Daily Volume
  useEffect(() => {
    const combinedDaily = [...historicalDailyVolume];
    realTimeDailyVolume.forEach(rt => {
      const existing = combinedDaily.find(d => d.date === rt.date);
      if (existing) {
        existing.value += rt.value;
      } else {
        combinedDaily.push(rt);
      }
    });
    const now = new Date();
    const thirtyDaysAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;
    setDailyVolume(
      combinedDaily
        .filter(d => new Date(d.date).getTime() >= thirtyDaysAgo)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    );
  }, [historicalDailyVolume, realTimeDailyVolume]);

  // Combine historical and real-time data for Monthly Volume
  useEffect(() => {
    const combinedMonthly = [...historicalMonthlyVolume];
    realTimeMonthlyVolume.forEach(rt => {
      const existing = combinedMonthly.find(d => d.date === rt.date);
      if (existing) {
        existing.value += rt.value;
      } else {
        combinedMonthly.push(rt);
      }
    });
    setMonthlyVolume(
      combinedMonthly.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    );
  }, [historicalMonthlyVolume, realTimeMonthlyVolume]);

  useEffect(() => {
    // console.log("Combining Wallet Growth - Historical:", historicalWalletGrowthData);
    // console.log("Combining Wallet Growth - Real-Time:", realTimeWalletGrowthData);
    const combinedWalletGrowth = [...historicalWalletGrowthData];
    realTimeWalletGrowthData.forEach(rt => {
      const existing = combinedWalletGrowth.find(d => d.date === rt.date);
      if (existing) {
        existing.newWallets = Number(existing.newWallets) + Number(rt.newWallets); // Ensure numbers
      } else {
        combinedWalletGrowth.push({ date: rt.date, newWallets: Number(rt.newWallets) });
      }
    });
    const sortedData = combinedWalletGrowth
      .map(d => ({
        date: d.date,
        newWallets: Number(d.newWallets), // Ensure number type
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
    // console.log("Combined Wallet Growth:", sortedData);
    setWalletGrowthData(sortedData);
  }, [realTimeWalletGrowthData]);

  useEffect(() => {
    setActiveWallets(realTimeActiveWallets);
    setDormantWallets(realTimeDormantWallets);
    console.log("Combined Active/Dormant:", {
      activeWallets: realTimeActiveWallets,
      dormantWallets: realTimeDormantWallets,
      totalWallets: realTimeActiveWallets + realTimeDormantWallets,
    });
  }, [realTimeActiveWallets, realTimeDormantWallets]);

  // Combine historical and real-time data for Active and Dormant Wallets
//   useEffect(() => {
//     const combinedActive = historicalActiveWallets + realTimeActiveWallets;
//     const totalWallets =
//       historicalActiveWallets +
//       historicalDormantWallets +
//       realTimeActiveWallets +
//       realTimeDormantWallets;
//     const combinedDormant = totalWallets - combinedActive;
//     console.log("Combining Active/Dormant:", { combinedActive, combinedDormant, totalWallets });
//     setActiveWallets(combinedActive);
//     setDormantWallets(combinedDormant);
//   }, [historicalActiveWallets, historicalDormantWallets, realTimeActiveWallets, realTimeDormantWallets]);

  // Combine historical and real-time data for Gas Fees
  useEffect(() => {
    const combinedGasFeeData = [...historicalGasFeeData];
    realTimeGasFeeData.forEach(rt => {
      const existing = combinedGasFeeData.find(
        d => d.event_date === rt.event_date && d.event_type === rt.event_type
      );
      if (existing) {
        existing.avg_gas_fee_eth =
          (existing.avg_gas_fee_eth * existing.transaction_count +
            rt.avg_gas_fee_eth * rt.transaction_count) /
          (existing.transaction_count + rt.transaction_count);
        existing.avg_gas_fee_usd = ethPrice ? existing.avg_gas_fee_eth * ethPrice : 0;
        existing.transaction_count += rt.transaction_count;
      } else {
        combinedGasFeeData.push(rt);
      }
    });
    setGasFeesData(combinedGasFeeData.sort((a, b) => a.event_date.localeCompare(b.event_date)));
  }, [historicalGasFeeData, realTimeGasFeeData, ethPrice]);

  // Combine historical and real-time data for Time of Day
  useEffect(() => {
    const combinedTimeOfDay = [...historicalTimeOfDay];
    realTimeTimeOfDay.forEach(rt => {
      const existing = combinedTimeOfDay.find(
        d => d.event_date === rt.event_date && d.hour_of_day === rt.hour_of_day
      );
      if (existing) {
        existing.avg_gas_fee_eth =
          (existing.avg_gas_fee_eth * existing.transaction_count +
            rt.avg_gas_fee_eth * rt.transaction_count) /
          (existing.transaction_count + rt.transaction_count);
        existing.avg_gas_fee_usd =
          (existing.avg_gas_fee_usd * existing.transaction_count +
            rt.avg_gas_fee_usd * rt.transaction_count) /
          (existing.transaction_count + rt.transaction_count);
        existing.transaction_count += rt.transaction_count;
      } else {
        combinedTimeOfDay.push(rt);
      }
    });
    setTimeOfDay(
      combinedTimeOfDay.sort(
        (a, b) => a.event_date.localeCompare(b.event_date) || a.hour_of_day - b.hour_of_day
      )
    );
  }, [historicalTimeOfDay, realTimeTimeOfDay]);

  // Combine historical and real-time data for Swap Volume
  useEffect(() => {
    const combinedSwapVolume = [...historicalSwapVolumeData];
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
  }, [historicalSwapVolumeData, realTimeSwapVolumeData]);

  // Combine historical and real-time data for Pool Metrics
  useEffect(() => {
    const combinedPoolMetrics = [...historicalPoolMetricsData];
    realTimePoolMetricsData.forEach(rt => {
      const existing = combinedPoolMetrics.find(d => d.pool_address === rt.pool_address);
      if (existing) {
        const allGasFees = [
          ...Array(existing.swap_count).fill(existing.median_gas_fee_eth),
          ...Array(rt.swap_count).fill(rt.median_gas_fee_eth),
        ];
        const sortedGasFees = allGasFees.sort((a, b) => a - b);
        existing.median_gas_fee_eth = sortedGasFees[Math.floor(sortedGasFees.length / 2)];
        existing.swap_count += rt.swap_count;
        existing.total_volume_usd += rt.total_volume_usd;
        // Preserve existing tvl_usd and apr, which are updated in the lp_and_transfers subscription
      } else {
        combinedPoolMetrics.push({ ...rt });
      }
    });

    setPoolMetricsData(combinedPoolMetrics);
  }, [historicalPoolMetricsData, realTimePoolMetricsData]);

  // Provide the context value
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
    realTimeLoading,
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