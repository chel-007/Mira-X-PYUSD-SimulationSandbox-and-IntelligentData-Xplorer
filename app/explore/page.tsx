"use client"

import { useState, useEffect, useRef } from "react";
import styles from "../styles/Explore.module.css";
import style1 from "../styles/Home.module.css";
import "../globals.css";
import { useRouter } from 'next/navigation';
import { collection, onSnapshot, QuerySnapshot, DocumentData } from "firebase/firestore";
import { db } from "../lib/clientFirestore";
import TransactionChart from "../components/explore/TransactionChart";
import VelocityChart from "../components/explore/VelocityChart";
import ActiveWalletsChart from "../components/explore/ActiveWalletsChart";
import WalletGrowthChart from "../components/explore/WalletGrowthChart";
import GasFeesChart from "../components/explore/GasFeesChart";
import TimeOfDayChart from "../components/explore/TimeOfDayChart";
import ChartWrapper from "../components/explore/ChartWrapper";
import SwapVolumeChart from "../components/explore/SwapVolumeChart";
import PoolMetricsChart from "../components/explore/PoolMetricsChart";
import { useEthPrice } from "../utils/EthPriceProvider";
import { useData } from "../utils/DataProvider";
import * as d3 from "d3";

// interface GasFeeOverTimeData {
//   event_date: string;
//   event_type: string;
//   avg_gas_fee_eth: number;
//   avg_gas_fee_usd: number;
//   transaction_count: number;
// }

// interface GasVolatilityOverTime {
//   event_date: string;
//   event_type: string;
//   gas_fee_volatility_eth: number;
//   gas_fee_volatility_usd: number;
//   transaction_count: number;
// }

// interface PoolMetricsData {
//   pool_address: string;
//   median_gas_fee_eth: number;
//   swap_count: number;
//   total_volume_usd: number;
//   tvl_usd: number;
//   apr: number;
// }

const Explore = () => {
  const [activeTab, setActiveTab] = useState("adoption");
  const router = useRouter();
  const [view, setView] = useState<"daily" | "monthly">("daily");
  // const [dailyVolume, setDailyVolume] = useState<{ date: string; value: number }[]>([]);
  // const [monthlyVolume, setMonthlyVolume] = useState<{ date: string; value: number }[]>([]);
  // const [walletGrowthData, setWalletGrowthData] = useState<{ date: string; newWallets: number }[]>([]);
  // const [transfers, setTransfers] = useState<any[]>([]);
  // const [txPerHour, setTxPerHour] = useState<number>(0);
  // const [maxTxPerHour, setMaxTxPerHour] = useState<number>(100);
  // const [activeWallets, setActiveWallets] = useState<number>(0);
  // const [dormantWallets, setDormantWallets] = useState<number>(0);
  // const [loading, setLoading] = useState(true);
  // const [gasFeeData, setGasFeesData] = useState<GasFeeOverTimeData[]>([]);
  // const [timeOfDay, setTimeOfDay] = useState<
  //   { event_date: string; hour_of_day: number; avg_gas_fee_eth: number; 
  //     avg_gas_fee_usd: number; transaction_count: number }[]
  // >([]);
  // const [swapVolumeData, setSwapVolumeData] = useState<
  //   { pool_address: string; date: string; total_volume_usd: number }[]
  // >([]);
  // const [poolMetricsData, setPoolMetricsData] = useState<PoolMetricsData[]>([]);
  // const { ethPrice, loading: ethPriceLoading } = useEthPrice();

  const {
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
  } = useData();

  const handleHomeClick = () => router.push("/");

  // useEffect(() => {
  //   let unsubscribe: () => void;

  //   const loadData = async () => {
  //     try {
  //       // Wait for ETH price to be ready
  //       if (ethPriceLoading) {
  //         await new Promise<void>(resolve => {
  //           const checkEthPrice = () => {
  //             if (!ethPriceLoading) resolve();
  //             else setTimeout(checkEthPrice, 100);
  //           };
  //           checkEthPrice();
  //         });
  //       }

  //       // Fetch BigQuery data
  //       const response = await fetch("/api/bigQueryTransactions");
  //       const bigQueryData = await response.json();

  //       if (bigQueryData.error) {
  //         console.error("Failed to fetch BigQuery data:", bigQueryData.error);
  //         setLoading(false);
  //         setSwapVolumeData([]); // Fallback to empty array
  //         return;
  //       }

  //       // Process gas fee data
  //       const gasComparison = bigQueryData.gasComparisonData;
        
  //       const gasComparisonData = gasComparison.map((row: any) => {
  //         const avgGasFeeEth = parseFloat(row.avg_gas_fee_eth);
  //         return {
  //           event_date: row.event_date,
  //           event_type: row.event_type,
  //           avg_gas_fee_eth: avgGasFeeEth,
  //           avg_gas_fee_usd: ethPrice ? avgGasFeeEth * ethPrice : 0,
  //           transaction_count: parseInt(row.transaction_count),
  //         };
  //       });

  //       setGasFeesData(gasComparisonData);

  //       // Process swap volume data
  //       const newSwapVolumeData = Array.isArray(bigQueryData.swapVolumeData) ? bigQueryData.swapVolumeData : [];
  //       setSwapVolumeData(newSwapVolumeData);

  //       // Process time-of-day data
  //       const timeOfDay = bigQueryData.timeOfDayData
  //       const timeOfDayData = timeOfDay.map((row: any) => {
  //         const avgGasFeeEth = parseFloat(row.avg_gas_fee_eth);
  //         return {
  //           event_date: row.event_date,
  //           hour_of_day: row.hour_of_day,
  //           avg_gas_fee_eth: avgGasFeeEth,
  //           avg_gas_fee_usd: ethPrice ? avgGasFeeEth * ethPrice : 0,
  //           transaction_count: parseInt(row.transaction_count),
  //         };
  //       });
  //       setTimeOfDay(timeOfDayData);

  //       // Process pool metrics data
  //       let poolData: PoolMetricsData[] = bigQueryData.poolMetricsData.map((row: any) => ({
  //         pool_address: row.pool_address.toLowerCase(),
  //         median_gas_fee_eth: parseFloat(row.median_gas_fee_eth),
  //         swap_count: parseInt(row.swap_count),
  //         total_volume_usd: parseFloat(row.total_volume_usd),
  //       }));

  //       // Fetch TVL and APR from Curve API
  //       let curvePoolsData: { [key: string]: { tvl: number; baseApy: number } } = {};
  //       try {
  //         const response = await fetch("https://api.curve.fi/v1/getPools/big/ethereum");
  //         const data = await response.json();
  //         if (data.success && data.data.poolData) {
  //           curvePoolsData = data.data.poolData.reduce((acc: any, pool: any) => {
  //             acc[pool.address.toLowerCase()] = {
  //               tvl: pool.usdTotal || 0,
  //             };
  //             return acc;
  //           }, {});
  //           console.log(data)
  //         } else {
  //           console.error("Failed to fetch Curve API data or poolData missing:", data);
  //         }
  //       } catch (error) {
  //         console.error("Error fetching Curve API (getPools):", error);
  //       }

  //       try {
  //         const volumeResponse = await fetch("https://api.curve.fi/v1/getVolumes/ethereum");
  //         const volumeData = await volumeResponse.json();
  //         if (volumeData.data && Array.isArray(volumeData.data.pools)) {
  //           volumeData.data.pools.forEach((pool: any) => {
  //             const poolAddress = pool.address.toLowerCase();
  //             if (curvePoolsData[poolAddress]) {
  //               curvePoolsData[poolAddress].baseApy = pool.latestDailyApyPcent || 0;
  //             }
  //           });
  //         } else {
  //           console.error("Failed to fetch Curve volume data: pools array missing", volumeData);
  //         }
  //       } catch (error) {
  //         console.error("Error fetching Curve volume API:", error);
  //       }

  //       poolData = poolData.map(pool => {
  //         const poolAddress = pool.pool_address.toLowerCase();
  //         const curveData = curvePoolsData[poolAddress] || { tvl: 0, baseApy: 0 };
  //         return {
  //           ...pool,
  //           tvl_usd: curveData.tvl,
  //           apr: curveData.baseApy,
  //         };
  //       });

  //       console.log("poolData", poolData)
  //       setPoolMetricsData(poolData);

  //       // Process transaction-related data
  //       setActiveWallets(bigQueryData.activeWallets);
  //       setDormantWallets(bigQueryData.dormantWallets);

  //       unsubscribe = onSnapshot(
  //         collection(db, "transfer_transactions"),
  //         (snapshot: QuerySnapshot<any>) => {
  //           const transactions = snapshot.docs.map((doc) => doc.data());

  //           setTransfers(transactions);

  //           // Calculate txPerHour (last hour)
  //           const now = new Date();
  //           const oneHourAgo = now.getTime() - 3600000;
  //           const recentTx = transactions.filter(t => new Date(t.timestamp).getTime() >= oneHourAgo);
  //           const calculatedTxPerHour = recentTx.length;
  //           setTxPerHour(calculatedTxPerHour);

  //           const historicalMax = bigQueryData.hourlyVelocity;
  //           setMaxTxPerHour(500);

  //           // Process transaction volume (daily and monthly)
  //           const dailyMap = transactions.reduce((acc: Record<string, number>, tx: any) => {
  //             const timestampMs = new Date(tx.timestamp).getTime();
  //             const date = new Date(timestampMs).toISOString().split("T")[0];
  //             const value = Number(tx.value);
  //             if (date && !isNaN(value)) acc[date] = (acc[date] || 0) + value;
  //             return acc;
  //           }, {});

  //           const monthlyMap = transactions.reduce((acc: Record<string, number>, tx: any) => {
  //             const timestampMs = new Date(tx.timestamp).getTime();
  //             const dateObj = new Date(timestampMs);
  //             const yearMonth = `${dateObj.getFullYear()}-${(dateObj.getMonth() + 1).toString().padStart(2, "0")}`;
  //             const value = Number(tx.value);
  //             if (yearMonth && !isNaN(value)) acc[yearMonth] = (acc[yearMonth] || 0) + value;
  //             return acc;
  //           }, {});

  //           const combinedDaily = { ...dailyMap };
  //           bigQueryData.dailyData.forEach((d: any) => {
  //             if (d.date && !isNaN(d.value)) combinedDaily[d.date] = (combinedDaily[d.date] || 0) + d.value;
  //           });

  //           const combinedMonthly = { ...monthlyMap };
  //           bigQueryData.monthlyData.forEach((d: any) => {
  //             if (d.date && !isNaN(d.value)) combinedMonthly[d.date] = (combinedMonthly[d.date] || 0) + d.value;
  //           });

  //           const thirtyDaysAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  //           const formattedDailyData = Object.entries(combinedDaily)
  //             .map(([date, value]) => ({ date, value: Number(value.toFixed(2)) }))
  //             .filter((d) => {
  //               const dateMs = new Date(d.date).getTime();
  //               return d.date && !isNaN(d.value) && dateMs >= thirtyDaysAgo;
  //             })
  //             .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  //           const formattedMonthlyData = Object.entries(combinedMonthly)
  //             .map(([date, value]) => ({ date, value: Number(value.toFixed(2)) }))
  //             .filter((d) => d.date && !isNaN(d.value))
  //             .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  //           setDailyVolume(formattedDailyData);
  //           setMonthlyVolume(formattedMonthlyData);

  //           // Process wallet growth
  //           const seenWallets = new Set(bigQueryData.dailyWalletGrowth.flatMap((row: any) => [row.sender, row.receiver]));
  //           const realTimeNewWallets = transactions.reduce((acc: any, t: any) => {
  //             const date = new Date(t.timestamp).toISOString().split("T")[0];
  //             if (!seenWallets.has(t.sender)) {
  //               acc[date] = (acc[date] || 0) + 1;
  //               seenWallets.add(t.sender);
  //             }
  //             if (!seenWallets.has(t.receiver)) {
  //               acc[date] = (acc[date] || 0) + 1;
  //               seenWallets.add(t.receiver);
  //             }
  //             return acc;
  //           }, {});

  //           const realTimeWalletGrowth = Object.entries(realTimeNewWallets).map(([date, count]) => ({
  //             date,
  //             newWallets: count,
  //           }));

  //           const combinedWalletGrowth = [...bigQueryData.dailyWalletGrowth];
  //           realTimeWalletGrowth.forEach((rt: any) => {
  //             const existing = combinedWalletGrowth.find((d: any) => d.date === rt.date);
  //             if (existing) existing.newWallets += rt.newWallets;
  //             else combinedWalletGrowth.push(rt);
  //           });

  //           setWalletGrowthData(combinedWalletGrowth.sort((a: any, b: any) => a.date.localeCompare(b.date)));

  //           // Calculate real-time active wallets (last 30 days)
  //           const realTimeActiveSet = new Set();
  //           transactions.forEach((t: any) => {
  //             if (new Date(t.timestamp).getTime() >= thirtyDaysAgo) {
  //               realTimeActiveSet.add(t.sender);
  //               realTimeActiveSet.add(t.receiver);
  //             }
  //           });

  //           const combinedActive = bigQueryData.activeWallets + realTimeActiveSet.size;
  //           const totalWallets = bigQueryData.activeWallets + bigQueryData.dormantWallets + new Set(transactions.flatMap((t: any) => [t.sender, t.receiver])).size;
  //           const combinedDormant = totalWallets - combinedActive;

  //           setActiveWallets(combinedActive);
  //           setDormantWallets(combinedDormant);

  //           setLoading(false);
  //         },
  //         (error) => {
  //           console.error("Firestore error:", error);
  //           setLoading(false);
  //         }
  //       );
  //     } catch (error) {
  //       console.error("Error loading data:", error);
  //       setLoading(false);
  //     }
  //   };

  //   loadData();

  //   return () => unsubscribe && unsubscribe();
  // }, [ethPrice, ethPriceLoading]);

  const handleToggle = (newView: "daily" | "monthly") => {
    setView(newView);
  };

  

  return (
    <div className={styles.container}>
      {/* Top Bar (unchanged) */}
      <div className={styles.topBar}>
        <div className={styles.appContainer}>
          <h1 className={style1.appName}>
            Mira <span>X</span>
          </h1>
          <div className={style1.betaBadge}>BETA</div>
        </div>
        <button onClick={handleHomeClick} className={styles.homeButton}>
          <i className="fa-solid fa-home"></i>
        </button>
        <button className={styles.sandboxStatus}>
          <span className={styles.pulse}></span> Sandbox is Live
        </button>
      </div>
  
      {/* Chart Container */}
      <div className={styles.chartContainer}>
        <h3 className={styles.tabTitle}>
          {activeTab === "adoption" && "Adoption Metrics"}
          {activeTab === "gas" && "Cost Efficiency & Gas Fees"}
          {activeTab === "defi" && "Liquidity Usage"}
        </h3>
  
        <div className={styles.tabCharts}>
          {activeTab === "adoption" && (
            <>
              {/* Left Side: TransactionChart */}
              <ChartWrapper
                  title="Transaction Volume"
                  loading={loading}
                  extraControls={
                    <div className={styles.toggleContainer}>
                      <label className={styles.toggleLabel}>
                        <input
                          type="checkbox"
                          checked={view === "monthly"}
                          onChange={(e) => handleToggle(e.target.checked ? "monthly" : "daily")}
                        />
                        <span className={styles.toggleSlider}></span>
                        <span className={styles.toggleText}>{view === "daily" ? "Daily" : "Monthly"}</span>
                      </label>
                    </div>
                  }
                  showExtraControls={true}
                  showChartControls={true}
                >
                  <TransactionChart
                    dailyData={dailyVolume}
                    monthlyData={monthlyVolume}
                    view={view}
                    onToggle={handleToggle}
                  />
                </ChartWrapper>
  
              {/* Right Side: WalletGrowthChart on top, ActiveWalletsChart and VelocityChart side by side below */}
              <div className={styles.rightSide}>
                <ChartWrapper
                  title="Wallet Growth Rate"
                  loading={loading}
                  showExtraControls={true}
                  showChartControls={true}
                  onZoom={() => console.log("Zoom clicked")} // Temporary for testing
                  onPan={() => console.log("Pan clicked")}
                  onDownload={() => console.log("Download clicked")}
                >
                  <WalletGrowthChart 
                  walletGrowthData={walletGrowthData}
                  onZoom={() => console.log("Zoom passed to SwapVolumeChart")}
                  onPan={() => console.log("Pan passed to SwapVolumeChart")}
                  onDownload={() => console.log("Download passed to SwapVolumeChart")}
                   />
                </ChartWrapper>
  
                <div className={styles.bottomPair}>
                  <ChartWrapper
                    title="Active vs. Dormant Wallets"
                    loading={loading}
                    showExtraControls={false}
                    showChartControls={false}
                  >
                    <ActiveWalletsChart activeWallets={activeWallets} dormantWallets={dormantWallets} loading={loading} />
                  </ChartWrapper>
                  <ChartWrapper
                    title="Velocity of Transfers"
                    loading={loading}
                    showExtraControls={false}
                    showChartControls={false}
                  >
                    <VelocityChart txPerHour={txPerHour} maxTxPerHour={maxTxPerHour} loading={loading} />
                  </ChartWrapper>
                </div>
              </div>
            </>
          )}
  
          {activeTab === "defi" && (
            <>
              <ChartWrapper
                title="Swap Volume (Current)"
                loading={loading}
                showExtraControls={true}
                showChartControls={true}
              onZoom={() => console.log("Zoom clicked")} // Temporary for testing
              onPan={() => console.log("Pan clicked")}
              onDownload={() => console.log("Download clicked")}
            >
              <SwapVolumeChart
                data={swapVolumeData}
                onZoom={() => console.log("Zoom passed to SwapVolumeChart")}
                onPan={() => console.log("Pan passed to SwapVolumeChart")}
                onDownload={() => console.log("Download passed to SwapVolumeChart")}
              />
              </ChartWrapper>
              <ChartWrapper
                title="Pool Metrics (Last 24 Hours)"
                loading={loading}
                showExtraControls={true}
                showChartControls={true}
              >
                <PoolMetricsChart data={poolMetricsData} />
              </ChartWrapper>
            </>
          )}
  
          {activeTab === "gas" && (
            <>
              <ChartWrapper
                title="Gas Comparision (Transfer vs Swaps)"
                loading={loading}
                showExtraControls={false}
                showChartControls={false}
                onZoom={() => console.log("Zoom clicked")} // Temporary for testing
                onPan={() => console.log("Pan clicked")}
                onDownload={() => console.log("Download clicked")}
            >
              <GasFeesChart
                gasFeeData={gasFeeData}
                onZoom={() => console.log("Zoom passed to SwapVolumeChart")}
                onPan={() => console.log("Pan passed to SwapVolumeChart")}
                onDownload={() => console.log("Download passed to SwapVolumeChart")}
              />
              </ChartWrapper>
              <ChartWrapper
                title="Network Congestion (Hourly)"
                loading={loading}
                showExtraControls={false}
                showChartControls={false}
              >
              <TimeOfDayChart 
                timeOfDayData={timeOfDay}
                 />
              </ChartWrapper>
            </>
          )}
        </div>
      </div>
  
      {/* Tabs (unchanged) */}
      <div className={styles.tabs}>
        <button
          className={activeTab === "adoption" ? styles.activeTab : styles.tab}
          onClick={() => setActiveTab("adoption")}
        >
          <i className="fas fa-search"></i>
        </button>
        <button
          className={activeTab === "gas" ? styles.activeTab : styles.tab}
          onClick={() => setActiveTab("gas")}
        >
          <i className="fas fa-search"></i>
        </button>
        <button
          className={activeTab === "defi" ? styles.activeTab : styles.tab}
          onClick={() => setActiveTab("defi")}
        >
          <i className="fa-solid fa-bolt"></i>
        </button>
      </div>
    </div>
  );
};

export default Explore;