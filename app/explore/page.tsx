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


const Explore = () => {
  const [activeTab, setActiveTab] = useState("adoption");
  const router = useRouter();
  const [view, setView] = useState<"daily" | "monthly">("daily");

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
    realTimeLoading,
    gasFeeData,
    timeOfDay,
    swapVolumeData,
    poolMetricsData,
  } = useData();

  const handleHomeClick = () => router.push("/");
  const handleSandboxClick = () => {
    router.push("/sandbox")
  console.log("clicked");
  };


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
        <button onClick={handleSandboxClick} className={styles.sandboxStatus}>
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
                    <ActiveWalletsChart
                    activeWallets={activeWallets} dormantWallets={dormantWallets} loading={loading} />
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