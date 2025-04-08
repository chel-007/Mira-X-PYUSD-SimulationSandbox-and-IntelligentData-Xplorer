"use client";
import React, { useState, useRef, useEffect } from 'react';
import styles from '../../styles/Wallet.module.css';
import { useAccount, useDisconnect } from 'wagmi';
import { walletModal } from '../../lib/walletConfig';
import ChartReports from './ChartReports';
import StakingChart from './StakingChart';
import { useEthPrice } from "../../utils/EthPriceProvider";
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const gcpProjectId = process.env.NEXT_PUBLIC_GOOGLE_CLOUD_PROJECT_ID;
const gcpApiKey = process.env.NEXT_PUBLIC_GOOGLE_CLOUD_KEY;

const RPC_URL = `https://blockchain.googleapis.com/v1/projects/${gcpProjectId}/locations/us-central1/endpoints/ethereum-mainnet/rpc?key=${gcpApiKey}`;

const PYUSD_ADDRESS = '0x6c3ea9036406852006290770bedfcaba0e23a0e8'.toLowerCase();

const Wallets = () => {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const [activeSection, setActiveSection] = useState(0);
  const scrollContainerRef = useRef(null);
  const isScrolling = useRef(false);

  const [balance, setBalance] = useState(null);
  const [transactionCount, setTransactionCount] = useState(0);
  const [transactionData, setTransactionData] = useState([]);
  const [gasData, setGasData] = useState([]);
  const [stakingData, setStakingData] = useState<StakingPool[]>([]);
  const [score, setScore] = useState(0);
  const [view, setView] = useState('balance');
  const [isLoading, setIsLoading] = useState(false);
  const [isStakingLoading, setIsStakingLoading] = useState(false);
  const [mockAddress, setMockAddress] = useState<string | null>(null);
  const [isMocking, setIsMocking] = useState(false);
  const [tempMockAddress, setTempMockAddress] = useState<string>(''); // For confirmation step
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const { ethPrice, loading: ethPriceLoading } = useEthPrice();
  

  const effectiveAddress = mockAddress || address;

  interface StakingPool {
    pool: string;
    stakeAmount: number;
    apy: number;
    tvl: number;
  }

  const sections = ['Performance'];

  // Fetch Wallet Balance (PYUSD ERC-20)
  useEffect(() => {
    const fetchBalance = async () => {
      if (!effectiveAddress) return; // Use effectiveAddress
      const data = {
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_call',
        params: [
          {
            to: PYUSD_ADDRESS,
            data: `0x70a08231${effectiveAddress.slice(2).padStart(64, '0')}`,
          },
          'latest',
        ],
      };
      const response = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (result.error) {
        console.error('Balance fetch error:', result.error.message);
        toast.error(`Balance fetch error:, ${result.error.message}`, {
          position: "top-right",
          autoClose: 5000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
        });
        setBalance('Error');
        return;
      }
      const balanceHex = result.result;
      const balanceDecimal = parseInt(balanceHex, 16) / 1e6;
      setBalance(balanceDecimal.toFixed(2));
    };
    fetchBalance();
  }, [effectiveAddress]); // Update dependency to effectiveAddress

  // Fetch Transaction and Gas Data
  const fetchTransactionData = async () => {
  
    if (!effectiveAddress || isLoading) return;
  
    // Capture the address at the start of the fetch
    const requestedAddress = effectiveAddress;
    setIsLoading(true);
  
    try {
      const response = await fetch(`/api/bigQueryTxSandbox?address=${requestedAddress}`);
      const { transactionData, gasData } = await response.json();
  
      // Check if effectiveAddress changed during the fetch
      if (requestedAddress !== effectiveAddress) {
        toast.info(`Address changed during fetch. Requested: ${requestedAddress}, Current: ${effectiveAddress}. Discarding data.`, {
          position: "top-right",
          autoClose: 10000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
        });
        // console.log(
        //   `Address changed during fetch. Requested: ${requestedAddress}, Current: ${effectiveAddress}. Discarding data.`
        // );
        return; // Abort setting state if address changed
      }
  
      // Wait for ethPrice to load
      if (ethPriceLoading) {
        await new Promise(resolve => {
          const checkEthPrice = () => {
            if (!ethPriceLoading) resolve();
            else setTimeout(checkEthPrice, 100);
          };
          checkEthPrice();
        });
      }
  
      // Process gasData into USD
      const gasDataUsd = gasData.map(day => ({
        date: day.date,
        gas: ethPrice ? (parseFloat(day.gas) * ethPrice).toFixed(2) : '0.00', // Fallback if ethPrice is unavailable
      }));

      console.log("gasDataUsd", gasDataUsd)
      console.log("ethPrice", ethPrice)
  
      // Update state only if address still matches
      setTransactionData(transactionData || []);
      setGasData(gasDataUsd || []);
      const totalTxs = transactionData.reduce((sum, day) => sum + day.transactions, 0);
      setTransactionCount(totalTxs);
  
      console.log('Transaction Data:', transactionData);
      console.log('Gas Data (USD):', gasDataUsd);
    } catch (error) {
      console.error('Error fetching transaction data:', error);
      // Only reset state if the address hasn't changed
      if (requestedAddress === effectiveAddress) {
        setTransactionData([]);
        setGasData([]);
      }
    } finally {
      // Only clear loading if the address hasn't changed
      if (requestedAddress === effectiveAddress) {
        setIsLoading(false);
      }
    }
  };

  const fetchStakingData = async () => {
    if (!effectiveAddress || isStakingLoading) return;
    setIsStakingLoading(true);
    const newStakingData = [];
  
    // Fetch APY and TVL from Curve API
    let curvePoolsData = {};
    try {
      const response = await fetch('https://api.curve.fi/v1/getPools/big/ethereum');
      const data = await response.json();
      if (data.success && data.data.poolData) {
        curvePoolsData = data.data.poolData.reduce((acc, pool) => {
          acc[pool.address.toLowerCase()] = {
            tvl: pool.usdTotal || 0,
          };
          return acc;
        }, {});
      } else {
        toast.error(`Failed to fetch API data ${data}`, {
          position: "top-right",
          autoClose: 5000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
        });
        // console.error('Failed to fetch Curve API data or poolData missing:', data);
      }
    } catch (error) {
      toast.error(`Unstable connection. Reload page ${error}`, {
        position: "top-right",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
      // console.error('Error fetching Curve API (getPools):', error);
    }
  
    // Fetch Base APY from getVolumes/ethereum
    try {
      const volumeResponse = await fetch('https://api.curve.fi/v1/getVolumes/ethereum');
      const volumeData = await volumeResponse.json();
      if (volumeData.data && Array.isArray(volumeData.data.pools)) {
        volumeData.data.pools.forEach(pool => {
          const poolAddress = pool.address.toLowerCase();
          if (curvePoolsData[poolAddress]) {
            curvePoolsData[poolAddress].baseApy = pool.latestDailyApyPcent || 0;
          }
        });
      } else {
        toast.error(`Failed to fetch API data ${volumeData}`, {
          position: "top-right",
          autoClose: 5000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
        });
        // console.error('Failed to fetch Curve volume data: pools array missing', volumeData);
      }
    } catch (error) {
      toast.error(`Unstable connection. Reload page ${error}`, {
        position: "top-right",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
      console.error('Error fetching Curve volume API:', error);
    }
  
    // Curve PYUSD/USDC
    const PYUSD_USDC_POOL_ADDRESS = '0x383E6b4437b59fff47B619CBA855CA29342A8559';
    let payPoolStake = 0;
    try {
      const PayPoolBalanceData = {
        jsonrpc: '2.0',
        id: 2,
        method: 'eth_call',
        params: [
          {
            to: PYUSD_USDC_POOL_ADDRESS,
            data: `0x70a08231${effectiveAddress.slice(2).padStart(64, '0')}`,
          },
          'latest',
        ],
      };
      const PayPoolResponse = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(PayPoolBalanceData),
      });
      const PayPoolResult = await PayPoolResponse.json();
      payPoolStake = PayPoolResult.result ? parseInt(PayPoolResult.result, 16) / 1e18 : 0;
      console.log('PayPoolStake:', payPoolStake);
    } catch (error) {
      toast.error(`Error fetching Curve PYUSD/USDC stake: ${error}`, {
        position: "top-right",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
      // console.error('Error fetching Curve PYUSD/USDC stake:', error);
      payPoolStake = 0;
    }
  
    const usdcPoolData = curvePoolsData[PYUSD_USDC_POOL_ADDRESS.toLowerCase()] || {};
    newStakingData.push({
      pool: 'Curve PYUSD/USDC',
      stakeAmount: payPoolStake,
      apy: usdcPoolData.baseApy || 1.57, // Fallback APY
      tvl: usdcPoolData.tvl || 15110000, // Fallback TVL
    });
  
    // Curve PYUSD/crvUSD
    const PYUSD_CRVUSD_POOL_ADDRESS = '0x625E92624Bc2D88619ACCc1788365A69767f6200';
    let curveCrvUsdStake = 0;
    try {
      const curveCrvUsdBalanceData = {
        jsonrpc: '2.0',
        id: 3,
        method: 'eth_call',
        params: [
          {
            to: PYUSD_CRVUSD_POOL_ADDRESS,
            data: `0x70a08231${effectiveAddress.slice(2).padStart(64, '0')}`,
          },
          'latest',
        ],
      };
      const curveCrvUsdResponse = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(curveCrvUsdBalanceData),
      });
      const curveCrvUsdResult = await curveCrvUsdResponse.json();
      curveCrvUsdStake = curveCrvUsdResult.result ? parseInt(curveCrvUsdResult.result, 16) / 1e18 : 0;
      console.log('curveCrvUsdStake:', curveCrvUsdStake);
    } catch (error) {
      toast.error(`Error fetching Curve PYUSD/crvUSDC stake: ${error}`, {
        position: "top-right",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
      // console.error('Error fetching Curve PYUSD/crvUSD stake:', error);
      curveCrvUsdStake = 0;
    }
  
    const crvUsdPoolData = curvePoolsData[PYUSD_CRVUSD_POOL_ADDRESS.toLowerCase()] || {};
    newStakingData.push({
      pool: 'Curve PYUSD/crvUSD',
      stakeAmount: curveCrvUsdStake,
      apy: crvUsdPoolData.baseApy || 2.1,
      tvl: crvUsdPoolData.tvl || 8000000,
    });
  
    setStakingData(newStakingData);
    setIsStakingLoading(false);
    return newStakingData;
  };

  

  useEffect(() => {
    if (effectiveAddress) {
      fetchTransactionData();
      fetchStakingData();
    }
  }, [effectiveAddress]);

  const getActivityStatus = (count) => {
    if (count === 0) return 'IDLE';
    if (count < 5) return 'LOW';
    if (count < 10) return 'MEDIUM';
    return 'HIGH';
  };

  const getActivityColor = (status) => {
    switch (status) {
      case 'IDLE': return '#7BCFFF';
      case 'LOW': return '#f44336';
      case 'MEDIUM': return '#ffeb3b';
      case 'HIGH': return 'rgb(5, 221, 5)';
      default: return '#fff';
    }
  };

  const activityStatus = getActivityStatus(transactionCount);

  const calculatePerformanceScore = async () => {
    if (!balance || !effectiveAddress) return 0; // Use effectiveAddress
    const yieldScore = balance > 0 ? 50 : 0;
    const routingScore = 50;
    const gasScore = transactionCount > 0 ? 50 : 0;
    return Math.round((yieldScore + routingScore + gasScore) / 3);
  };

  useEffect(() => {
    const fetchScore = async () => {
      const newScore = await calculatePerformanceScore();
      setScore(newScore);
    };
    fetchScore();
  }, [balance, transactionCount]);

  // Scroll Handling (unchanged)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const sectionHeight = container.clientHeight;
    const handleWheel = (e) => {
      if (isScrolling.current) return;
      e.preventDefault();
      const delta = e.deltaY;
      let newIndex = activeSection;
      if (delta > 0 && activeSection < sections.length - 1) {
        newIndex = activeSection + 1;
      } else if (delta < 0 && activeSection > 0) {
        newIndex = activeSection - 1;
      }
      if (newIndex !== activeSection) {
        isScrolling.current = true;
        container.scrollTo({
          top: newIndex * sectionHeight,
          behavior: 'smooth',
        });
        setActiveSection(newIndex);
        setTimeout(() => (isScrolling.current = false), 500);
      }
    };
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [activeSection]);

  const scrollToSection = (index) => {
    const container = scrollContainerRef.current;
    if (container && !isScrolling.current) {
      isScrolling.current = true;
      container.scrollTo({
        top: index * container.clientHeight,
        behavior: 'smooth',
      });
      setActiveSection(index);
      setTimeout(() => (isScrolling.current = false), 500);
    }
  };

  const handleMockAddressSubmit = () => {
    console.log("Mock address set:", tempMockAddress);
    setMockAddress(tempMockAddress);
    setShowConfirmDialog(false);
    setIsMocking(false);
    setTempMockAddress('');
  };

  const handleMockAddressCancel = () => {
    console.log("Mock address cleared");
    setMockAddress(null);
    setShowConfirmDialog(false);
    setIsMocking(false);
    setTempMockAddress('');
  };

  return (
<div className={styles.walletContainer}>
  {mockAddress && (
    <div className={styles.mockBanner}>
      <span>
        Mock Mode Active: Using address {mockAddress.slice(0, 6)}...{mockAddress.slice(-4)}
      </span>
      <button className={styles.cancelMockButton} disabled={isLoading} onClick={() => setMockAddress(null)}>
        Exit Mock Mode
      </button>
    </div>
  )}

  {!isConnected ? (
    <div className={styles.connectButton}>
      <button onClick={() => walletModal.open()}>Connect a Wallet</button>
    </div>
  ) : (
    <div className={styles.performanceGrid}>
      <div className={styles.leftTop}>
        <div className={styles.balance}>
          <span>
            <i className="fa-solid fa-dollar-sign"></i>
            <h3>Wallet Balance</h3>
          </span>
          <p>{balance ? `${balance} PYUSD` : 'Loading...'}</p>
        </div>
        <div className={styles.activityStat}>
          <span>
            <i className="fa-solid fa-dollar-sign"></i>
            <h3>Activity Status</h3>
          </span>
          <div className={styles.activityIndicator}>
            {isLoading ? (
              <p>Loading...</p>
            ) : (
              <>
                <p>{activityStatus}</p>
                <div
                  className={styles.pulse}
                  style={{ backgroundColor: getActivityColor(activityStatus) }}
                ></div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className={styles.scoreContainer}>
        <svg width="80" height="80" viewBox="0 0 120 120">
          <defs>
            <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
            </filter>
          </defs>
          <circle cx="60" cy="60" r="50" fill="none" stroke="#e6e6e6" strokeWidth="20" />
          <circle
            cx="60"
            cy="60"
            r="50"
            fill="none"
            stroke="#7BCFFF"
            strokeWidth="20"
            strokeDasharray={`${(score / 100) * 314}, 314`}
            transform="rotate(-90 60 60)"
            filter="url(#softGlow)"
          />
          <text
            x="60"
            y="60"
            textAnchor="middle"
            dy=".3em"
            fontSize="32"
            fill="white"
            fontFamily="Josefin Sans"
          >
            {isLoading ? '...' : score}
          </text>
        </svg>
      </div>

      <div className={`${styles.rightTop} ${mockAddress ? styles.mockActive : ''}`}>
        <div className={styles.greeting}>
          Hi, {effectiveAddress?.slice(0, 6)}...{effectiveAddress?.slice(-4)}
        </div>
        <div className={styles.mockContainer}>
          {mockAddress ? (
            <div className={styles.mockingState}>
              <span>Mocking...</span>
              <button className={styles.cancelMockButton} disabled={isLoading} onClick={() => setMockAddress(null)}>
                Cancel
              </button>
            </div>
          ) : isMocking ? (
            <div className={styles.mockPrompt}>
              <input
                type="text"
                placeholder="Enter address to mock"
                className={styles.mockInput}
                value={tempMockAddress}
                onChange={(e) => {
                  const value = e.target.value;
                  setTempMockAddress(value);
                  if (value.match(/^0x[a-fA-F0-9]{40}$/)) {
                    setShowConfirmDialog(true);
                  }
                }}
              />
              <button
                className={styles.cancelMockButton}
                onClick={() => {
                  setIsMocking(false);
                  setTempMockAddress('');
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className={styles.noMock}>
              <button disabled={isLoading} className={styles.mockButton} onClick={() => setIsMocking(true)}>
                Mock Address
              </button>
            </div>
          )}
        </div>
        <button onClick={() => disconnect()} className={styles.disconnectBut}>
          <i className="fa-thin fa-user-minus"></i>
        </button>
      </div>

      {showConfirmDialog && (
        <div className={styles.confirmDialog}>
          <div className={styles.confirmContent}>
            <p>
              You are about to mock address {tempMockAddress.slice(0, 6)}...{tempMockAddress.slice(-4)}.
              All data will reflect this address instead of your connected wallet. Continue?
            </p>
            <div className={styles.confirmButtons}>
              <button className={styles.confirmButton} onClick={handleMockAddressSubmit}>
                Yes
              </button>
              <button
                className={styles.cancelMockButton}
                onClick={() => {
                  setShowConfirmDialog(false);
                  setTempMockAddress('');
                  setIsMocking(false);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.mainContainer}>
        <div className={styles.viewSelector}>
          <span>
            {view === 'balance' ? 'Transaction Reports' : view === 'staking' ? 'Staking' : 'Gas'}
          </span>
          <select value={view} onChange={(e) => setView(e.target.value)}>
            <option value="balance">Transaction Reports</option>
            <option value="staking">Staking</option>
            <option value="gas">Gas</option>
          </select>
        </div>

        {isLoading && (view === 'balance' || view === 'gas') && (
          <div className={styles.loading}>Loading...</div>
        )}
        {isStakingLoading && view === 'staking' && (
          <div className={styles.loading}>Loading...</div>
        )}

        {!isLoading && view === 'balance' && transactionData.every(d => d.transactions === 0) && (
          <div className={styles.noData}>No transaction data for user</div>
        )}
        {!isLoading && view === 'gas' && gasData.every(d => parseFloat(d.gas) === 0) && (
          <div className={styles.noData}>No gas data for user</div>
        )}
        {!isStakingLoading && view === 'staking' && stakingData.length === 0 && (
          <div className={styles.noData}>No staking data for user</div>
        )}

        {!isLoading && (view === 'balance' || view === 'gas') && (
          <ChartReports view={view} transactionData={transactionData} gasData={gasData} />
        )}
        {!isStakingLoading && view === 'staking' && stakingData.length > 0 && (
          <StakingChart stakingData={stakingData} address={effectiveAddress} />
        )}
      </div>
    </div>
  )}
          <ToastContainer
          position="top-right"
          autoClose={5000}
          hideProgressBar={false}
          newestOnTop={false}
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          style={{ zIndex: 10000 }}
        />
</div>
  );
};

export default Wallets;