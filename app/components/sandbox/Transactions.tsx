"use client";

import React, { useState, useEffect, useRef } from 'react';
import styles from "../../styles/Transaction.module.css";
import { FixedSizeList } from 'react-window'; // For virtualized timeline
import debounce from 'lodash/debounce';
import { useReactFlow, ReactFlow, Background, Controls, Handle, Position, Node, Edge, applyNodeChanges, applyEdgeChanges, addEdge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useTransactionTrace } from './useTransactionTrace';
import LatestTxScroller from './latestTxScroller';
import { useChainId, useAccount } from 'wagmi';
import { useTransactionSimulation } from './useTransactionSimulation';
import { useSimulation } from '../../utils/SimulationContext';
import SimulationResultBox from './SimulationResultBox';
import { useData } from '../../utils/DataProvider';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useEthPrice } from "../../utils/EthPriceProvider";
import { createPortal } from 'react-dom';


const gcpProjectId = process.env.NEXT_PUBLIC_GOOGLE_CLOUD_PROJECT_ID;
const gcpApiKey = process.env.NEXT_PUBLIC_GOOGLE_CLOUD_KEY;

const MAINNET_RPC_URL = `https://blockchain.googleapis.com/v1/projects/${gcpProjectId}/locations/us-central1/endpoints/ethereum-mainnet/rpc?key=${gcpApiKey}`;
const SEPOLIA_RPC_URL = `https://blockchain.googleapis.com/v1/projects/${gcpProjectId}/locations/us-central1/endpoints/ethereum-sepolia/rpc?key=${gcpApiKey}`;

const PYUSD_MAINNET_ADDRESS = '0x6c3ea9036406852006290770bedfcaba0e23a0e8';
const PYUSD_SEPOLIA_ADDRESS = '0xcac524bca292aaade2df8a05cc58f0a65b1b3bb9';

// Define Node Data Types
interface TransactionNodeData {
  label: string;
  onAddNode: (nodeId: string) => void;
  hasChild?: boolean;
}

interface TextInputNodeData {
  label: string;
  onSubmit?: (hash: string) => void;
}

interface OptionsNodeData {
  options: string[];
  parentId?: string;
  onSelect: (nodeId: string, option: string) => void;
}

type CustomNode = Node<TransactionNodeData | TextInputNodeData | OptionsNodeData>;

// Convert gasUsed (wei) to ETH
const weiToEth = (gasUsed: string, gasPriceGwei = 20) => {
  const gasUsedDecimal = parseInt(gasUsed, 16);
  const gasPriceWei = BigInt(gasPriceGwei) * BigInt(10 ** 9);
  const costWei = BigInt(gasUsedDecimal) * gasPriceWei;
  const costEth = Number(costWei) / 10 ** 18;
  return costEth.toFixed(6); // 6 decimal places
};

// Custom Components
const TransactionNode = ({ id, data }: { id: string; data: TransactionNodeData }) => (
  <div className={styles.transactionNode}>
    <Handle type="target" position={Position.Top} style={{ background: '#00ffcc' }} />
    <div className={styles.nodeContent}>
      {data.label}
      {!data.hasChild && (
        <button className={styles.nodePlus} onClick={() => data.onAddNode(id)}>
          +
        </button>
      )}
    </div>
    <Handle type="source" position={Position.Bottom} style={{ background: '#00ffcc' }} />
  </div>
);

const TextInputNode = ({ data, id }: { data: TextInputNodeData; id: string }) => {
  const [hash, setHash] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (/^0x[a-fA-F0-9]{64}$/.test(hash)) {
      // console.log(`Submitting TX: ${hash}`);
      if (data.onSubmit) data.onSubmit(hash);
    } else {
      toast.error("Please enter a valid transaction hash (0x + 64 hex characters)", {
        position: "top-right",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
      // alert('Please enter a valid transaction hash (0x + 64 hex characters)');
    }
  };

  return (
    <div className={styles.textInputNode}>
      <Handle type="target" position={Position.Top} style={{ background: '#00ffcc' }} />
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder={data.label}
          value={hash}
          onChange={(e) => setHash(e.target.value)}
        />
        <button type="submit" className={styles.submitButton}>
          <i className="fa-duotone fa-solid fa-paper-plane-top"></i>
        </button>
      </form>
      {data.loading && <p>Loading...</p>}
      {data.error && <p>Error: {data.error.message}</p>}
      <Handle type="source" position={Position.Bottom} style={{ background: '#00ffcc' }} />
    </div>
  );
};

const OptionsNode = ({ id, data }: { id: string; data: OptionsNodeData }) => (
  <div className={styles.optionsNode}>
    <Handle type="target" position={Position.Top} style={{ background: '#00ffcc' }} />
    {data.options.map((option) => (
      <button key={option} className={styles.optionButton} onClick={() => data.onSelect(id, option)}>
        {option}
      </button>
    ))}
    <Handle type="source" position={Position.Bottom} style={{ background: '#00ffcc' }} />
  </div>
);


const CallNode = ({ data, id, selected }) => {
  const { setNodes, getNodes } = useReactFlow();
  const [showTooltip, setShowTooltip] = useState(false);
  

  const colors = {
    pyusd: { bg: 'rgba(0, 102, 204)', border: '#818499' },
    usdc: { bg: '#00A3D6', border: '#007BA7' },
    uniswap: { bg: '#FF69B4', border: '#FF1493' },
    coinbase: { bg: '#0052FF', border: '#0033CC' },
    kyberswap: { bg: '#31CB9E', border: '#1A8C6B' },
    usdt: { bg: '#26A17B', border: '#1A7559' },
    inch: { bg: '#7F00FF', border: '#7F00FF' },
    mev: { bg: '#FF4500', border: '#CC3700' },
    mimic: { bg: '#bdbcb9', border: '#807f7c' },
    aave: { bg: '#2EBAC6', border: '#1A7A84' },
    unknown: { bg: '#333', border: '#fff' },
  };

  const getColor = () => {
    if (data.isPyusd) return colors.pyusd;
    if (!data.isKnown) return colors.unknown;
    const name = data.contractName?.toLowerCase() || '';
    if (name.includes('uniswap')) return colors.uniswap;
    if (name.includes('coinbase')) return colors.coinbase;
    if (name.includes('kyberswap')) return colors.kyberswap;
    if (name === 'usdt') return colors.usdt;
    if (name === 'usdc') return colors.usdc;
    if (name.includes('1inch')) return colors.inch;
    if (name.includes('mev')) return colors.mev;
    if (name.includes('mimic')) return colors.mimic;
    if (name.includes('aave')) return colors.aave;
    return colors.unknown;
  };

  const shortenContractName = (name) => {
    if (!name) return 'Unknown';
    if (name === 'Uniswap V3: Nonfungible Position Manager') {
      return 'Uniswap V3: NFT Pos. Mgr.';
    }
    return name;
  };

  const { bg, border } = getColor();
  const isImportant = data.type === 'call' && (data.isKnown || data.isPyusd || data.isError);
  const totalCalls = getNodes().length + (data.callCount || 0);
  const useTreeStyle = totalCalls >= 10;

  const toggleCollapse = () => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, collapsed: !n.data.collapsed } } : n
      )
    );
  };

  const displayContractName = shortenContractName(data.contractName) || (useTreeStyle ? `${data.to.slice(0, 6)}...${data.to.slice(-4)}` : data.to);

  return (
    <div
      style={{
        background: bg,
        padding: '10px',
        borderRadius: '5px',
        color: '#fff',
        position: 'relative',
        border: data.isError ? '2px dashed #FF0000' : `1px solid ${border}`,
        minWidth: useTreeStyle ? '200px' : undefined,
        opacity: data.selected ? 1 : 0.7,
        animation: data.selected ? 'callpulse 1s infinite' : 'none',
      }}
      onMouseEnter={() => isImportant && setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <Handle type="target" position={Position.Top} id="top" style={{ background: '#fff' }} />
      <Handle type="target" position={Position.Left} id="left" style={{ background: '#fff' }} />

      {useTreeStyle ? (
        <div style={{ display: 'flex', alignItems: 'center' }}>
{data.hasSubcalls && (
  <button
    onClick={(e) => {
      e.stopPropagation(); // Prevent click from bubbling up to React Flow
      toggleCollapse();
    }}
    onMouseDown={(e) => e.stopPropagation()} // Prevent mousedown from bubbling up, allowing dragging
    style={{
      marginRight: '5px',
      background: 'none',
      border: 'none',
      color: '#fff',
      fontSize: '14px',
    }}
  >
    {data.collapsed ? '▶' : '▼'}
  </button>
)}
          <strong>{data.type || 'Call'}</strong>
        </div>
      ) : (
        <strong>{data.type || 'Call'}</strong>
      )}
      <div>
        To: {useTreeStyle ? `${data.to.slice(0, 6)}...${data.to.slice(-4)}` : data.to}
        {useTreeStyle ? null : <br />}
      </div>
      <div>Gas Used: {weiToEth(data.gasUsed)} ETH</div>
      {data.isKnown && data.contractName && (
        <span style={{ fontSize: '12px' }}>({data.contractName})</span>
      )}
      {data.isError && <span style={{ fontSize: '12px', color: '#FF0000' }}>(Failed)</span>}
      {showTooltip &&
  createPortal(
    <div
      style={{
        position: 'absolute',
        top: data.position ? data.position.y - 50 : 0,
        left: data.position ? data.position.x + 75 : 0,
        background: '#222',
        color: '#fff',
        padding: '5px 10px',
        borderRadius: '3px',
        fontSize: '12px',
        zIndex: 1000,
      }}
    >
      {displayContractName}<br />
      Description: {data.functionDescription || 'No description available'}<br />
      Value: {weiToEth(data.value)} ETH<br />
      Input: {data.input.slice(0, 10)}...
    </div>,
    document.body
  )}

      <Handle type="source" position={Position.Bottom} id="bottom" style={{ background: '#fff' }} />
    </div>
  );
};

const ErrorNode = ({ data }) => {
  const colors = {
    pyusd: { bg: 'rgba(0, 102, 204)', border: '#FFA500' },
    uniswap: { bg: '#FF69B4', border: '#FF1493' },
    coinbase: { bg: '#0052FF', border: '#0033CC' },
    kyberswap: { bg: '#31CB9E', border: '#1A8C6B' },
    usdt: { bg: '#26A17B', border: '#1A7559' },
    mev: { bg: '#FF4500', border: '#CC3700' },
    unknown: { bg: '#FF6347', border: '#fff' },
  };

  const getColor = () => {
    if (data.isPyusd) return colors.pyusd;
    if (!data.isKnown) return colors.unknown;
    const name = data.contractName?.toLowerCase() || '';
    if (name.includes('uniswap')) return colors.uniswap;
    if (name.includes('coinbase')) return colors.coinbase;
    if (name.includes('kyberswap')) return colors.kyberswap;
    if (name === 'usdt') return colors.usdt;
    if (name.includes('mev')) return colors.mev;
    return colors.unknown;
  };

  const { bg, border } = getColor();

  return (
    <div
      style={{
        background: bg,
        padding: '10px',
        borderRadius: '5px',
        color: '#fff',
        position: 'relative',
        border: `2px dashed #FF0000`, // Dashed red border for all errors
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: '#fff' }} />
      <strong>Error</strong><br />
      To: {data.to}<br />
      {data.error}<br />
      {data.isKnown && data.contractName && (
        <span style={{ fontSize: '12px' }}> ({data.contractName})</span>
      )}
      <Handle type="source" position={Position.Bottom} style={{ background: '#fff' }} />
    </div>
  );
};

const SummaryNode = ({ data }) => {
  const contractNames = {
    '0x3c11f6265ddec22f4d049dde480615735f451646': 'Mimic Swapper',
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'USDC',
    '0xdac17f958d2ee523a2206206994597c13d831ec7': 'USDT',
    '0x264bd8291fae1d75db2c5f573b07faa6715997b5': 'Paxos 4',
    '0x6c3ea9036406852006290770bedfcaba0e23a0e8': 'PYUSD',
    '0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43': 'Coinbase 10',
    '0x7a250d5630b4cf539739df2c5dacb4c659f2488d': 'Uniswap V2 Router',
    '0xa7ca2c8673bcfa5a26d8ceec2887f2cc2b0db22a': 'Uniswap V3: NFT Pos Mgr.',
    '0x1111111254eeb25477b68fb85ed929f73a960582': '1inch v5: Router',
    '0xe592427a0aece92de3edee1f18e0157c05861564': 'Uniswap V3 Router',
    '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45': 'Uniswap Universal Router',
    '0xc30c8b862f7de6ba5d7eaeb113c78ec6b5ded04b': 'Uniswap V3: Swap Router 02',
    '0xdef1c0ded9bec7f1a1670819833240f027b25eff': '0x Exchange Proxy',
    '0x9008d19f58aabd9ed0d60971565aa8510560ab41': 'KyberSwap',
    '0x3e88c9b0e3be6817973a6e629211e702d12c577f': 'Aave: Pool V3',
    '0x00000000000000adc04c56bf30ac9d3c0aaf14dc': 'Seaport (OpenSea)',
    '0x0000000000a39bb272e79075ade125fd351887ac': 'Blur Pool',
    '0x00000000009E50a7dDb7a7B0e2ee6604fd120E49': 'MEV Bot (Common on Curve Swaps)',
    '0x000000000000000000000000000000000000dead': 'MEV Bot (Burner)',
    '0x0000000000007f150bd6f54c40a34d7c3d5e9f56': 'MEV Bot (Common)',
  };

  const formatAddress = (addr) => {
    const tag = contractNames[addr.toLowerCase()];
    return tag ? tag : `${addr.slice(0, 12)}...`;
  };

  return (
    <div style={{ 
      background: 'rgba(129, 132, 153, 0.08)', 
      padding: '10px', 
      borderRadius: '5px', 
      color: 'rgba(255, 255, 255, 0.75)', 
      maxWidth: '300px',
      overflow: 'hidden', 
      textOverflow: 'ellipsis' 
    }}>
      <strong>Summary</strong><br />
      From:{' '}
      <span style={{ color: '#fff', borderRadius: '8px', background: '#333', padding: '0 4px' }}>
        {formatAddress(data.from)}
      </span>{' '}
      to{' '}
      <span style={{ color: '#fff', borderRadius: '8px', background: '#333', padding: '0 4px' }}>
        {formatAddress(data.to)}
      </span><br />
      Value: <span style={{ color: '#00FF00' }}>{data.pyusdValue || '0'} PYUSD</span><br />
      <span style={{ color: '#7BCFFF' }}>{data.callCount} calls</span>,{' '}
      <span style={{ color: '#FF6347' }}>{data.errorCount} errors</span>,{' '}
      <span style={{ color: '#fff', borderRadius: '8px', background: '#333', padding: '0 4px' }}>
        {data.highestGasContract?.slice(0, 12) || 'Unknown'}{data.highestGasContract?.length > 12 ? '...' : ''}
      </span>{' '}
      used highest gas (<span style={{ color: 'orange' }}>{data.highestGasEth} ETH</span>)
    </div>
  );
};

const TraceContainerNode = ({ data }) => (
  <div style={{ 
    border: '1px dashed rgba(255, 255, 255, 0.4)', 
    padding: '20px', 
    borderRadius: '10px', 
    background: 'transparent', 
    width: '100%',
    height: '100%',
  }}>
    {data.label}
  </div>
);

const DigDeeperNode = ({ id, data }) => (
  <div className={styles.digDeeperButton}>
    <button onClick={() => data.onDigDeeper(id)}>
    <i className="fa-duotone fa-thin fa-gear-code"></i>
    </button>
  </div>
);

const InspectNode = ({ data }) => {
  const icons = {
    'Balances Of': 'fa-thin fa-wallet',
    'Last Transacts': 'fa-thin fa-list',
    'Cross Examine': "fa-sharp fa-light fa-magnifying-glass",
  };
  const iconClass = icons[data.option] || 'fa-question';

  return (
    <div className={styles.inspectNode}>
      <div className={styles.inspectContent}>
        {data.loading ? (
           <span>loading...</span>
        ) : (
          <i className={`${iconClass}`} />
        )}
        <span>{data.option}</span>
      </div>
      <Handle type="source" position={Position.Right} style={{ background: '#00ffcc' }} />
    </div>
  );
};

const TableNode = ({ data }) => (
  <div className={styles.tableNode}>
    <Handle type="target" position={Position.Left} style={{ background: '#00ffcc' }} />
    <strong>{data.title}</strong>
    <table>
      <tbody>
        {data.content.map((row, idx) => (
          <tr key={idx}>
            <td>{row}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// Define transaction inputs mapping
const transactionInputs = {
  Transfer: [
    { label: 'From', xOffset: 0, yOffset: 50 },
    { label: 'To', xOffset: 400, yOffset: 50 },
    { label: 'Amount', xOffset: 200, yOffset: 100 },
  ],
  Swap: [
    { label: 'From', xOffset: 0, yOffset: 50 },
    { label: 'Select Pair', type: 'selector', options: ['USDC to PYUSD', 'crvUSD to PYUSD'], xOffset: 200, yOffset: 50 },
    // { label: 'To', xOffset: 400, yOffset: 50 },
    { label: 'AmountIn', xOffset: 0, yOffset: 150 },
    { label: 'AmountOut', xOffset: 400, yOffset: 50 },
  ],
};

const SelectorNode = ({ data, id }) => {
  const [selectedOption, setSelectedOption] = useState(data.options[0]); // Default to first option

  useEffect(() => {
    // Set initial selection
    if (data.onSelect) {
      const inputToken = data.options[0].split(' to ')[0];
      data.onSelect(data.options[0]);
    }
  }, []);

  const handleChange = (e) => {
    const value = e.target.value;
    // console.log('Selector changed to:', value);
    setSelectedOption(value);
    if (data.onSelect) {
      data.onSelect(value); // Update mockInputs
    }
  };

  return (
    <div className={styles.selectorNode}>
      <select value={selectedOption} onChange={handleChange}>
        {data.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
};


// const parseTrace = (trace, parentId, position, contractNames = {}) => {
//   if (!trace || typeof trace !== 'object') {
//     // console.error('Invalid trace data:', trace);
//     return { nodes: [], edges: [], callCount: 0, errorCount: 0 };
//   }

//   const nodes = [];
//   const edges = [];
//   const nodeId = `${parentId}-${trace.type || 'call'}-${Math.random().toString(36).substr(2, 5)}`;

//   const toLower = trace.to?.toLowerCase();
//   const isPyusd = toLower === PYUSD_MAINNET_ADDRESS
//   const isError = trace.error || trace.revertReason;
//   const contractName = contractNames[toLower] || null;

//   nodes.push({
//     id: nodeId,
//     type: isError ? 'errorNode' : 'callNode',
//     data: {
//       to: trace.to || 'Unknown',
//       gasUsed: trace.gasUsed || '0',
//       value: trace.value || '0', // Include for tooltips (ETH or token amounts)
//       input: trace.input || '', // For decoding swaps, approvals, etc.
//       error: isError ? (trace.error || trace.revertReason) : null,
//       contractName,
//       isPyusd,
//       isKnown: !!contractNames[toLower], // True if in contractNames
//       type: trace.type || 'call', // Keep call type (call, staticcall, etc.)
//     },
//     position: { x: position.x, y: position.y },
//   });

//   if (trace.calls && Array.isArray(trace.calls) && trace.calls.length > 0) {
//     trace.calls.forEach((subcall, index) => {
//       const subPosition = { x: position.x + 200, y: position.y + 180 * (index + 1) };
//       const { nodes: subNodes, edges: subEdges } = parseTrace(subcall, nodeId, subPosition, contractNames);
//       nodes.push(...subNodes);
//       edges.push(...subEdges);
//       edges.push({
//         id: `e${nodeId}-${subNodes[0].id}`,
//         source: nodeId,
//         target: subNodes[0].id,
//         animated: true,
//       });
//     });
//   }

//   return {
//     nodes,
//     edges,
//     callCount: nodes.length,
//     errorCount: nodes.filter((n) => n.type === 'errorNode').length,
//   };
// };

const generateColors = () => {
  const colors = [];
  for (let i = 0; i < 100; i++) {
    const hue = Math.floor(Math.random() * 360);
    const saturation = 70 + Math.random() * 30; // 70-100%
    const lightness = 40 + Math.random() * 20; // 40-60%
    colors.push(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
  }
  return colors;
};
const callColors = generateColors();
const defaultColor = '#818499';

// Add callIndex to track unique calls
const parseTrace = (trace, parentId, position, contractNames = {}, depth = 0, totalCallCount = null, callIndex = 0) => {
  if (!trace || typeof trace !== 'object') {
    return { nodes: [], edges: [], callCount: 0, errorCount: 0, nextCallIndex: callIndex };
  }

  const nodes = [];
  const edges = [];
  const nodeId = `${parentId || 'root'}-${trace.type || 'call'}-${Math.random().toString(36).substr(2, 5)}`;

  const shortenContractName = (name) => {
    if (!name) return null;
    if (name === 'Uniswap V3: Nonfungible Position Manager') {
      return 'Uniswap V3: NFT Pos. Mgr.';
    }
    if (name === '1inch v5: Aggregation Router') {
      return '1inch v5 Router';
    }
    if (name === 'Uniswap V3: Swap Router 02') {
      return 'Uniswap V3: Swap Router';
    }
    return name;
  };

  const toLower = trace.to?.toLowerCase();
  const isPyusd = toLower === PYUSD_MAINNET_ADDRESS;
  const isError = trace.error || trace.revertReason;
  const contractName = shortenContractName(contractNames[toLower] || null);
  const hasSubcalls = trace.calls && Array.isArray(trace.calls) && trace.calls.length > 0;

  if (totalCallCount === null) {
    const countSubcalls = (t) => {
      let count = 1;
      if (t.calls && Array.isArray(t.calls)) {
        t.calls.forEach((sub) => (count += countSubcalls(sub)));
      }
      return count;
    };
    totalCallCount = countSubcalls(trace);
  }

  const useTreeStyle = totalCallCount >= 10;

  nodes.push({
    id: nodeId,
    type: isError ? 'errorNode' : 'callNode',
    data: {
      to: trace.to || 'Unknown',
      gasUsed: trace.gasUsed || '0',
      value: trace.value || '0',
      input: trace.input || '',
      error: isError ? (trace.error || trace.revertReason) : null,
      contractName,
      isPyusd,
      isKnown: !!contractNames[toLower],
      type: trace.type || 'call',
      collapsed: hasSubcalls && useTreeStyle,
      hasSubcalls,
      callCount: totalCallCount,
      callDepthColor: callColors[callIndex % 100] || defaultColor,
      parentId: depth === 0 ? null : parentId,
    },
    position: {
      x: useTreeStyle ? position.x + depth * 250 : position.x + 200,
      y: useTreeStyle ? position.y : position.y,
    },
  });

  let nextCallIndex = callIndex + 1;
  if (hasSubcalls) {
    let subcallY = position.y + (useTreeStyle ? 100 : 180);
    trace.calls.forEach((subcall, index) => {
      const subPosition = {
        x: useTreeStyle ? position.x : position.x + 200,
        y: subcallY,
      };
      const { nodes: subNodes, edges: subEdges, nextCallIndex: updatedIndex } = parseTrace(
        subcall,
        nodeId,
        subPosition,
        contractNames,
        depth + 1,
        totalCallCount,
        nextCallIndex
      );
      nodes.push(...subNodes);
      edges.push(...subEdges);

      // Determine which handles to use for the edge
      const parentNode = nodes.find(n => n.id === nodeId);
      const childNode = subNodes[0];
      let sourceHandle = 'bottom';
      let targetHandle = 'top';

      if (useTreeStyle) {
        // If child is to the right (tree style), connect bottom-to-left
        if (childNode.position.x > parentNode.position.x) {
          targetHandle = 'left';
        }
        // If child is directly below (same x), connect bottom-to-top (already set)
      }

      // Define edge style based on useTreeStyle
      const edgeStyle = useTreeStyle
        ? { stroke: '#fff', strokeWidth: 2, opacity: '0.6' } // Thicker white stroke for tree style
        : { stroke: '#555', strokeWidth: 1 }; // Default for non-tree style

      const edgeType = useTreeStyle ? 'smoothstep' : 'default'; // Smoothstep for tree style, default otherwise

      edges.push({
        id: `e${nodeId}-${subNodes[0].id}`,
        source: nodeId,
        target: subNodes[0].id,
        sourceHandle,
        targetHandle,
        animated: true,
        style: edgeStyle,
        type: edgeType,
      });

      subcallY += useTreeStyle ? 120 : 180 * (index + 1);
      nextCallIndex = updatedIndex;
    });
  }

  return {
    nodes,
    edges,
    callCount: nodes.length,
    errorCount: nodes.filter((n) => n.type === 'errorNode').length,
    nextCallIndex,
  };
};
// Parse trace data
// const parseTrace = (trace, parentId, position, contractNames = {}) => {
//   // console.log('Parsing Trace:', trace);
//   if (!trace || typeof trace !== 'object') {
//     // console.error('Invalid trace data:', trace);
//     return { nodes: [], edges: [], callCount: 0, errorCount: 0 };
//   }

//   const nodes = [];
//   const edges = [];
//   const nodeId = `${parentId}-${trace.type || 'call'}-${Math.random().toString(36).substr(2, 5)}`;

//   const isError = trace.error || trace.revertReason;
//   nodes.push({
//     id: nodeId,
//     type: isError ? 'errorNode' : 'callNode',
//     data: {
//       to: trace.to || 'Unknown',
//       gasUsed: trace.gasUsed || '0',
//       error: isError ? (trace.error || trace.revertReason) : null,
//       contractName: contractNames[trace.to] || null,
//     },
//     position: { x: position.x, y: position.y },
//   });

//   if (trace.calls && Array.isArray(trace.calls) && trace.calls.length > 0) {
//     trace.calls.forEach((subcall, index) => {
//       const subPosition = { x: position.x + 200, y: position.y + 180 * (index + 1) };
//       const { nodes: subNodes, edges: subEdges } = parseTrace(subcall, nodeId, subPosition, contractNames);
//       nodes.push(...subNodes);
//       edges.push(...subEdges);
//       edges.push({
//         id: `e${nodeId}-${subNodes[0].id}`,
//         source: nodeId,
//         target: subNodes[0].id,
//         animated: true,
//       });
//     });
//   }

//   // console.log('Generated Nodes:', nodes);
//   return { nodes, edges, callCount: nodes.length, errorCount: nodes.filter(n => n.type === 'errorNode').length };
// };


const InputNode = ({ data, id }) => {
  const [value, setValue] = useState(data.value || '');
  const [lastAlertTime, setLastAlertTime] = useState(0);
  const inputRef = useRef(null);
  const { simulationResult } = useSimulation(); // Access simulation result

  // Determine if this is the "AmountOut" node and simulation has a result
  const isAmountOut = data.label === 'AmountOut';
  const isReadOnly = data.readOnly || (isAmountOut && !!simulationResult?.amountOut);

  useEffect(() => {
    if (isAmountOut && simulationResult?.amountOut) {
      setValue(simulationResult.amountOut);
    } else {
      setValue(data.value || '');
    }
  }, [data.value, simulationResult, isAmountOut]);

  const handleChange = (e) => {
    if (!data.isWalletConnected || isReadOnly) {
      const now = Date.now();
      if (!data.isWalletConnected && now - lastAlertTime > 1000) {
        toast.error("Please connect your wallet first!", {
          position: "top-right",
          autoClose: 5000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
        });
        setLastAlertTime(now);
        inputRef.current.blur();
      }
      return;
    }
    setValue(e.target.value);
    if (data.onChange) {
      data.onChange(data.label, e.target.value, id);
    }
  };

  const handleFocus = (e) => {
    if (!data.isWalletConnected || isReadOnly) {
      const now = Date.now();
      if (!data.isWalletConnected && now - lastAlertTime > 1000) {
        toast.error("Please connect your wallet first!", {
          position: "top-right",
          autoClose: 5000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
        });
        setLastAlertTime(now);
        inputRef.current.blur();
      }
      return;
    }
    if (data.onFocus) {
      data.onFocus(data.label, id);
    }
  };

  return (
    <div className={styles.textInputNode}>
      <Handle type="target" position={Position.Top} style={{ background: '#00ffcc' }} />
      <input
        ref={inputRef}
        type="text"
        placeholder={data.label}
        value={value}
        onChange={handleChange}
        onFocus={handleFocus}
        className={!data.isWalletConnected || isReadOnly ? styles.disabledInput : ''}
        readOnly={isReadOnly}
        title={
          !data.isWalletConnected
            ? "Please connect your wallet first"
            : isReadOnly
            ? "This field is read-only"
            : ""
        }
      />
      <Handle type="source" position={Position.Bottom} style={{ background: '#00ffcc' }} />
      <Handle type="target" position={Position.Bottom} id="bottom-target" style={{ background: '#00ffcc' }} />
    </div>
  );
};

const MockButtonNode = ({ data, id }) => {
  const [loading, setLoading] = useState(false);
  const [isSimulated, setIsSimulated] = useState(false);
  const [errorState, setErrorState] = useState(false);
  const { simulateTransfer, sendTransfer, simulateSwap } = useTransactionSimulation(data.rpcUrl);
  const { setSimulationResult, clearSimulation } = useSimulation();
  const isSwap = data.inputs?.AmountIn;

  const handleMock = async () => {
    if (errorState) {
      data.clearFlow();
      setErrorState(false);
      setIsSimulated(false); // Reset for new simulation
      setLoading(false);
      return;
    }
    setLoading(true);
    clearSimulation();
    const { From, To, Amount, AmountIn, AmountOut, inputToken } = data.inputs || {};
    // console.log("inputtoken", inputToken)

    if (isSwap) {
      if (!From || !AmountIn || !inputToken) {
        setSimulationResult({ error: 'Missing required swap fields' });
        setLoading(false);
        return;
      }
      try {
        const { poolMetricsData } = data.useData();
        const result = await simulateSwap(
          From, 
          To || From,
          String(AmountIn),
          data.isMainnet,
          inputToken,
          poolMetricsData
        );
        // console.log("simulation result", result)
        setSimulationResult(result);
        // setNodes((nds) =>
        //   nds.map((node) =>
        //     node.data.key === 'AmountOut'
        //       ? { ...node, data: { ...node.data, value: result.amountOut } }
        //       : node
        //   )
        // );
      } catch (error) {
        setSimulationResult({ error: error.message });
        setErrorState(true);
      } finally {
        setLoading(false);
      }
    } else {
      if (!From || !To || !Amount) {
        setSimulationResult({ error: 'Missing required transfer fields' });
        setLoading(false);
        return;
      }
      try {
        if (!isSimulated) {
          const result = await simulateTransfer(From, To, String(Amount), data.isMainnet);
          // console.log('Transfer Simulation Result:', result);
          setSimulationResult(result);
          setIsSimulated(true); // Switch to Send mode
        } else {
          setSimulationResult({ status: 'Sending now' });
          const { txHash } = await sendTransfer(To, String(Amount), data.isMainnet);
          setSimulationResult({ txHash, status: 'Sent' });
          toast.success('Transfer successful!', { position: 'top-right' });
          setErrorState(true);
        }
      } catch (error) {
        // console.error('Action error:', error);
        setSimulationResult({ error: `Transfer failed: ${error.message}` });
        setErrorState(true);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className={styles.mockButtonNode}>
      <Handle type="target" position={Position.Top} style={{ background: '#00ffcc' }} />
      <button
        onClick={handleMock}
        disabled={loading}
        style={{
          background: 'green',
        }}
      >
        {loading ? (
          <i className="fa-spin fa-spinner" />
        ) : errorState ? (
          'Restart'
        ) : isSimulated ? (
          'Send'
        ) : (
          'Simulate'
        )}
      </button>
      <Handle type="source" position={Position.Bottom} style={{ background: '#00ffcc' }} />
    </div>
  );
};

// Define nodeTypes
const nodeTypes = {
  transaction: TransactionNode,
  textInput: TextInputNode,
  options: OptionsNode,
  input: InputNode,
  callNode: CallNode,
  errorNode: ErrorNode,
  summaryNode: SummaryNode,
  digDeeper: DigDeeperNode,
  inspect: InspectNode,
  table: TableNode,
  traceContainer: TraceContainerNode,
  mockButton: MockButtonNode,
  selector: SelectorNode,
};

interface TransactionsProps {
  setNodes: React.Dispatch<React.SetStateAction<CustomNode[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  nodes: CustomNode[];
  edges: Edge[];
  setActiveTabMain: (tab: 'transactions' | 'wallets') => void;
  mockAddress: string | null;
  setMockAddress: React.Dispatch<React.SetStateAction<string | null>>;
}

const Transactions = ({ setNodes, setEdges, nodes, edges, setActiveTabMain, mockAddress, setMockAddress }: TransactionsProps ) => {
  const chainId = useChainId();
  const isMainnet = chainId === 1; // Single source of truth
  const isSepolia = chainId === 11155111;
  const rpcUrlRef = useRef(isMainnet ? MAINNET_RPC_URL : SEPOLIA_RPC_URL);
  const { address } = useAccount();
  const isWalletConnected = !!address;
  const { trace, receipt, loading, error, resetTrace, fetchTrace } = useTransactionTrace();
  const { setSimulationResult, clearSimulation } = useSimulation();
  const [fetchingNodeId, setFetchingNodeId] = useState(null);
  // const { setCenter } = useReactFlow();
  const { setCenter, fitView, setViewport } = useReactFlow();
  const { timeOfDay, gasFeeData, poolMetricsData } = useData();
  const { ethPrice, loading: ethPriceLoading } = useEthPrice();
  const [mockInputs, setMockInputs] = useState({});
  const [amountNodeId, setAmountNodeId] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(true);
  const [activeTab, setActiveTab] = useState('timeline');
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [mevAnalysis, setMevAnalysis] = useState({ ran: false, results: [] });

  const debouncedSetNodes = debounce(setNodes, 100);
  const debouncedSetTimeline = debounce(setTimeline, 100);
  

  // Single useEffect for network updates
  useEffect(() => {
    // console.log("chainId changed to:", chainId);
    const newIsMainnet = chainId === 1;
    rpcUrlRef.current = newIsMainnet ? MAINNET_RPC_URL : SEPOLIA_RPC_URL;
    // console.log("Transactions isMainnet:", newIsMainnet, "RPC:", rpcUrlRef.current);

    // Toast notification for network change
    toast.info(`Connected network changed! ${newIsMainnet ? 'Mainnet' : isSepolia ? 'Sepolia' : 'Unknown'}`, {
      position: "top-right",
      autoClose: 5000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
    });
  }, [chainId, isSepolia]);

  const clearFlow = () => {
    setNodes([]);
    setEdges([]);
    setMockInputs({});
    setTimeline([]);
    setAmountNodeId(null);
    setFetchingNodeId(null);
    if (typeof resetTrace === 'function' || typeof clearSimulation === 'function') {
      resetTrace();
      clearSimulation();
    } else {
      console.error('resetTrace is not a function:', resetTrace);
    }
    // Reset zoom and pan
    setTimeout(() => {

      setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 200 });
    }, 0);
  };


  // Validate Ethereum address
  const isValidEthAddress = (addr) => /^0x[a-fA-F0-9]{40}$/.test(addr);


  const MOCK_BUTTON_Y_OFFSET = 150;

  const handleInputChange = (label, value, nodeId) => {
    if (!isWalletConnected) {
      return; // Don’t update mockInputs or nodes
    }
    setMockInputs((prev) => {
      const newInputs = { ...prev, [label]: value };
      // console.log('mockInputs updated:', newInputs);
      if (label === 'Amount' || label === 'AmountIn') {
        setAmountNodeId(nodeId);
      }
      setNodes((nds) =>
        nds.map((node) =>
          node.data.label === label ? { ...node, data: { ...node.data, value } } : node
        )
      );
      return newInputs;
    });
  };

  const handleFocus = (label, nodeId) => {
    if (!isWalletConnected) {
      return;
    }
    if (label === 'From' && address) {
      // console.log("from entered with wallet address:", address);
      setMockInputs((prev) => ({ ...prev, From: address }));
      setNodes((nds) =>
        nds.map((node) =>
          node.id === nodeId ? { ...node, data: { ...node.data, value: address } } : node
        )
      );
    }
  };

  useEffect(() => {
    const existingMockNode = nodes.find((n) => n.type === 'mockButton');
    if (existingMockNode && existingMockNode.data.inputs !== mockInputs) {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === existingMockNode.id
            ? { ...n, data: { ...n.data, inputs: mockInputs } }
            : n
        )
      );
    }
  }, [mockInputs, nodes, setNodes]);

  useEffect(() => {
    const swapSelectorNode = nodes.find((n) => n.type === 'selector' && n.data.label === 'Select Pair');
    if (swapSelectorNode && !mockInputs.inputToken) {
      const defaultInputToken = swapSelectorNode.data.options[0].split(' to ')[0]; // "USDT"
      setMockInputs((prev) => ({
        ...prev,
        inputToken: defaultInputToken,
      }));
    }
  
    const existingMockNode = nodes.find((n) => n.type === 'mockButton');
    const amountNode = amountNodeId ? nodes.find((n) => n.id === amountNodeId) : null;
    const isSwap = nodes.some((n) => n.type === 'input' && n.data.label === 'AmountIn');
    const hasAllFields = isSwap
      ? !!(mockInputs.From && mockInputs.AmountIn && mockInputs.inputToken)
      : !!(mockInputs.From && mockInputs.To && mockInputs.Amount);
    const isValidInputs =
      hasAllFields &&
      isValidEthAddress(mockInputs.From) &&
      (isSwap ? parseFloat(mockInputs.AmountIn) > 0 : parseFloat(mockInputs.Amount) > 0);
  
    // console.log('useEffect debug:', { mockInputs, hasAllFields, isValidInputs, amountNodeId, amountNode, existingMockNode });
  
    if (!isWalletConnected) {
      if (existingMockNode) {
        setNodes((nds) => nds.filter((n) => n.id !== existingMockNode.id));
        setEdges((eds) => eds.filter((e) => e.target !== existingMockNode.id));
      }
      return;
    }
  
    if (existingMockNode && !isValidInputs) {
      setNodes((nds) => nds.filter((n) => n.id !== existingMockNode.id));
      setEdges((eds) => eds.filter((e) => e.target !== existingMockNode.id));
      return;
    }
  
    if (isValidInputs && amountNode && !existingMockNode) {
      const mockId = `${Date.now()}-mock`;
      const mockPosition = {
        x: amountNode.position.x,
        y: amountNode.position.y + MOCK_BUTTON_Y_OFFSET,
      };
  
      setNodes((nds) => {
        const updatedNodes = [
          ...nds,
          {
            id: mockId,
            type: 'mockButton',
            data: {
              inputs: mockInputs,
              isMainnet,
              ethPrice,
              rpcUrl: rpcUrlRef.current,
              useData: () => ({ timeOfDay, gasFeeData, poolMetricsData }),
              clearFlow
            },
            position: mockPosition,
          },
        ];
        // console.log('MockButton added:', updatedNodes.find((n) => n.id === mockId));
        return updatedNodes;
      });
  
      setEdges((eds) => [
        ...eds,
        { id: `e${amountNode.id}-${mockId}`, source: amountNode.id, target: mockId, animated: true },
      ]);
    }
  }, [mockInputs, amountNodeId, setNodes, setEdges, isMainnet, rpcUrlRef, timeOfDay, isWalletConnected, ethPrice, nodes, clearFlow]);

  const addInitialOptionsNode = (x, y) => {
    // console.log("inside add", isMainnet)
    const newNode = {
      id: `${Date.now()}`,
      type: 'options',
      data: {
        options: ['Add TX', 'Mock TX'],
        onSelect: (nodeId, selectedOption) => {
          setNodes((nds) => {
            const node = nds.find((n) => n.id === nodeId);
            if (!node) return nds;
            const newX = node.position.x;
            const newY = node.position.y;
            const updatedNodes = [
              ...nds.filter((n) => n.id !== nodeId),
              {
                id: nodeId,
                type: 'transaction',
                data: {
                  label: selectedOption,
                  onAddNode: (txNodeId) => {
                    setNodes((nds) => {
                      const txNode = nds.find((n) => n.id === txNodeId);
                      if (!txNode || txNode.data.hasChild) return nds;
                      const { position } = txNode;
                      const newId = `${Date.now()}`;
                      const updatedTxNode = { ...txNode, data: { ...txNode.data, hasChild: true } };
                      let newNodes = nds.map((n) => (n.id === txNodeId ? updatedTxNode : n));
                      let childNode;

                      if (selectedOption === 'Add TX') {
                        childNode = {
                          id: newId,
                          type: 'textInput',
                          data: {
                            label: 'Enter TX Hash',
                            onSubmit: (hash) => {
                              setTimeline([]);
                              resetTrace();
                              // console.log("Submitting hash:", hash, "with RPC:", rpcUrlRef.current);
                              setFetchingNodeId(newId);
                              // Clear previous result nodes and edges
                              setNodes((nds) => {
                                const resultNodeTypes = [
                                  'traceContainer',
                                  'callNode',
                                  'summaryNode',
                                  'digDeeper',
                                  'options',
                                  'inspect',
                                  'table',
                                  'textInput'
                                ];
                                const nodesToKeep = nds.filter((n) => 
                                  !resultNodeTypes.includes(n.type) || n.id === newId
                                );
                                return nodesToKeep;
                              });
                              setEdges((eds) => {
                                const resultNodeTypes = [
                                  'traceContainer',
                                  'callNode',
                                  'summaryNode',
                                  'digDeeper',
                                  'options',
                                  'inspect',
                                  'table',
                                  'textInput'
                                ];
                                return eds.filter((e) => {
                                  const sourceNode = nodes.find((n) => n.id === e.source);
                                  const targetNode = nodes.find((n) => n.id === e.target);
                                  return (
                                    (!sourceNode || !resultNodeTypes.includes(sourceNode.type) || e.source === txNodeId) &&
                                    (!targetNode || !resultNodeTypes.includes(targetNode.type) || e.target === newId)
                                  );
                                });
                              });
                              // console.log("fetchTrace called");
                              resetTrace(); // Clear trace/receipt
                              fetchTrace(hash, rpcUrlRef.current);
                            },
                          },
                          position: { x: position.x + 200, y: position.y + 100 },
                        };
                        newNodes = [...newNodes, childNode];
                        setEdges((eds) => [
                          ...eds,
                          { id: `e${txNodeId}-${newId}`, source: txNodeId, target: newId, animated: true },
                        ]);
                      } else if (selectedOption === 'Mock TX') {
                        childNode = {
                          id: newId,
                          type: 'options',
                          data: {
                            options: ['Transfer', 'Swap'],
                            parentId: txNodeId,
                            onSelect: (mockId, option) => {
                              setNodes((nds) => {
                                const mockNode = nds.find((n) => n.id === mockId);
                                if (!mockNode || mockNode.type !== 'options') return nds;
                                const parentId = mockNode.data.parentId;
                                if (!parentId) return nds;

                                const optionId = `${Date.now()}`;
                                let newNodes = [];
                                let newEdges = [];

                                if (option in transactionInputs) {
                                  const inputs = transactionInputs[option];
                                  const inputNodes = inputs.map((input) => {
                                    const inputId = `${Date.now()}-${input.label.toLowerCase().replace(' ', '-')}`;
                                    if (input.type === 'selector') {
                                      return {
                                        id: inputId,
                                        type: 'selector',
                                        data: {
                                          label: input.label,
                                          options: input.options,
                                          onSelect: (value) => {
                                            const inputToken = value.split(' to ')[0];
                                            setMockInputs((prev) => ({ ...prev, inputToken }));
                                          },
                                        },
                                        position: { x: mockNode.position.x + input.xOffset, y: mockNode.position.y + input.yOffset },
                                        draggable: false,
                                      };
                                    } else {
                                      return {
                                        id: inputId,
                                        type: 'input',
                                        data: {
                                          label: input.label,
                                          key: input.label,
                                          onChange: (label, value, id) => handleInputChange(label, value, id),
                                          onFocus: () => handleFocus(input.label, inputId),
                                          isWalletConnected,
                                          readOnly: input.readOnly || false,
                                        },
                                        position: { x: mockNode.position.x + input.xOffset, y: mockNode.position.y + input.yOffset },
                                      };
                                    }
                                  });
                                
                                  newNodes = [
                                    ...nds.filter((n) => n.id !== mockId),
                                    {
                                      id: optionId,
                                      type: 'transaction',
                                      data: { label: option, onAddNode: () => {} },
                                      position: { x: mockNode.position.x + 200, y: mockNode.position.y - 20 },
                                    },
                                    ...inputNodes,
                                  ];
                                
                                  const isSwap = option === 'Swap';
                                  if (isSwap) {
                                    newEdges = [
                                      { id: `e${parentId}-${optionId}`, source: parentId, target: optionId, animated: true }, // Mock TX to Swap
                                      { id: `e${optionId}-${inputNodes[0].id}`, source: optionId, target: inputNodes[0].id, animated: true }, // Swap to From
                                      { id: `e${inputNodes[0].id}-${inputNodes[2].id}`, source: inputNodes[0].id, target: inputNodes[2].id, animated: true }, // From to AmountIn
                                      { id: `e${optionId}-${inputNodes[3].id}`, source: optionId, target: inputNodes[3].id, animated: true }, // From to AmountOut
                                      // {
                                      //   id: `e${inputNodes[2].id}-${inputNodes[3].id}`,
                                      //   source: inputNodes[2].id,
                                      //   target: inputNodes[3].id,
                                      //   targetHandle: 'bottom',
                                      //   animated: true,
                                      // },
                                    ];
                                  } else {
                                    newEdges = [
                                      { id: `e${parentId}-${optionId}`, source: parentId, target: optionId, animated: true },
                                      ...inputNodes.map((node) => ({
                                        id: `e${optionId}-${node.id}`,
                                        source: optionId,
                                        target: node.id,
                                        animated: true,
                                      })),
                                    ];
                                  }
                                
                                  setEdges((eds) => [...eds, ...newEdges]);
                                  return newNodes;
                                } else {
                                  newNodes = [
                                    ...nds.filter((n) => n.id !== mockId),
                                    {
                                      id: optionId,
                                      type: 'transaction',
                                      data: { label: option, onAddNode: () => {} },
                                      position: { x: mockNode.position.x + 200, y: mockNode.position.y + 100 },
                                    },
                                  ];
                                  newEdges = [
                                    { id: `e${parentId}-${optionId}`, source: parentId, target: optionId, animated: true },
                                  ];
                                }

                                setEdges((eds) => [...eds, ...newEdges]);
                                return newNodes;
                              });
                            },
                          },
                          position: { x: position.x + 200, y: position.y + 100 },
                        };
                        newNodes = [...newNodes, childNode];
                        setEdges((eds) => [
                          ...eds,
                          { id: `e${txNodeId}-${newId}`, source: txNodeId, target: newId, animated: true },
                        ]);
                      }
                      return newNodes;
                    });
                  },
                },
                position: { x: newX, y: newY },
              },
            ];
            return updatedNodes;
          });
        },
      },
      position: { x, y },
    };
    setNodes((nds) => [...nds, newNode]);
  };


  useEffect(() => {
    if (trace && receipt && fetchingNodeId) {
      // console.log("Processing trace/receipt for node:", fetchingNodeId);
      handleDataFetched(fetchingNodeId, trace, receipt);
      setFetchingNodeId(null);
    }
  }, [trace, receipt, fetchingNodeId]);

  const isPyusdTransaction = (receipt, trace, isMainnet) => {
    const pyusdAddress = isMainnet ? PYUSD_MAINNET_ADDRESS : PYUSD_SEPOLIA_ADDRESS;
    // Check receipt 'to' field
    if (receipt.to && receipt.to.toLowerCase() === pyusdAddress) return true;
    // Check trace for calls to PYUSD
    const checkTrace = (call) => {
      if (call.to && call.to.toLowerCase() === pyusdAddress) return true;
      if (call.calls) return call.calls.some(checkTrace);
      return false;
    };
    return trace && checkTrace(trace);
  };

  const handleDataFetched = (nodeId: string, trace: any, receipt: any) => {
    if (!isPyusdTransaction(receipt, trace, isMainnet)) {
      toast.error("Only PYUSD transactions are supported. Please enter a PYUSD-related TX.");
      resetTrace();
      return; // Exit early
    }
    // console.log("Valid PYUSD transaction");

    // setTimeline([]);

    debouncedSetTimeline([]);

    const parentNode = nodes.find((n) => edges.some((e) => e.target === nodeId && e.source === n.id));
    if (!parentNode) {
      // console.error('Parent node not found for ID:', nodeId);
      return;
    }
  
    const contractNames = {
      '0x3c11f6265ddec22f4d049dde480615735f451646': 'Mimic Swapper',
      '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'USDC',
      '0xdac17f958d2ee523a2206206994597c13d831ec7': 'USDT',
      '0x264bd8291fae1d75db2c5f573b07faa6715997b5': 'Paxos 4',
      '0x6c3ea9036406852006290770bedfcaba0e23a0e8': 'PYUSD',
      '0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43': 'Coinbase 10',
      '0x7a250d5630b4cf539739df2c5dacb4c659f2488d': 'Uniswap V2 Router',
      '0xa7ca2c8673bcfa5a26d8ceec2887f2cc2b0db22a': 'Uniswap V3: Nonfungible Position Manager',
      '0x1111111254eeb25477b68fb85ed929f73a960582': '1inch v5: Aggregation Router',
      '0xe592427a0aece92de3edee1f18e0157c05861564': 'Uniswap V3 Router',
      '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45': 'Uniswap Universal Router',
      '0xc30c8b862f7de6ba5d7eaeb113c78ec6b5ded04b': 'Uniswap V3: Swap Router 02',
      '0xdef1c0ded9bec7f1a1670819833240f027b25eff': '0x Exchange Proxy',
      '0x9008d19f58aabd9ed0d60971565aa8510560ab41': 'KyberSwap',
      '0x3e88c9b0e3be6817973a6e629211e702d12c577f': 'Aave: Pool V3',
      '0x00000000000000adc04c56bf30ac9d3c0aaf14dc': 'Seaport (OpenSea)',
      '0x0000000000a39bb272e79075ade125fd351887ac': 'Blur Pool',
      '0x00000000009E50a7dDb7a7B0e2ee6604fd120E49': 'MEV Bot (Common on Curve Swaps)',
      '0x000000000000000000000000000000000000dead': 'MEV Bot (Burner)',
      '0x0000000000007f150bd6f54c40a34d7c3d5e9f56': 'MEV Bot (Common)',
    };

  const startPosition = { x: parentNode.position.x + 500, y: parentNode.position.y - 150 };
  const { nodes: traceNodes, edges: traceEdges, callCount, errorCount } = parseTrace(trace, nodeId, startPosition, contractNames);

  if (traceNodes.length === 0) {
    // console.error('No trace nodes generated');
    return;
  }

  const transferLog = receipt.logs.find((log: any) =>
    log.address.toLowerCase() === (isMainnet ? PYUSD_MAINNET_ADDRESS : PYUSD_SEPOLIA_ADDRESS) &&
    log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
  );
  let from = 'Unknown';
  let to = 'Unknown';
  let pyusdValue = '0';
  if (transferLog) {
    from = `0x${transferLog.topics[1].slice(-40)}`;
    to = `0x${transferLog.topics[2].slice(-40)}`;
    pyusdValue = (parseInt(transferLog.data, 16) / 1e6).toFixed(2);
  }

  const highestGasNode = traceNodes.reduce((max, node) =>
    parseInt(node.data.gasUsed || '0', 16) > parseInt(max.data.gasUsed || '0', 16) ? node : max, traceNodes[0]);
  const highestGasEth = weiToEth(highestGasNode.data.gasUsed);
  const summaryData = {
    callCount,
    errorCount,
    highestGasContract: highestGasNode.data.contractName || highestGasNode.data.to,
    highestGasEth,
    from,
    to,
    pyusdValue,
  };

    // Build timeline with collapsed repeats and sliced unknowns
    const timelineData = [];
    let lastAddress = null;
    let lastType = null;
    traceNodes.forEach((node, index) => {
      const { to, contractName, type, isError } = node.data;
      const address = to?.toLowerCase();
      // console.log("address", address)
      const label = contractName || (to && typeof to === 'string' ? `${to.slice(0, 3)}...${to.slice(-3)}` : 'Unknown');
      // console.log("label", label)
      if (address === lastAddress && type === lastType && !isError) {
        timelineData.push({ id: node.id, isDot: true });
      } else {
        timelineData.push({
          id: node.id,
          label: `${index + 1}. ${label} ${type || 'Call'}${isError ? ' (Failed)' : ''}`,
          isPyusd: node.data.isPyusd,
          isKnown: node.data.isKnown,
          isDot: false,
        });
        lastAddress = address;
        lastType = type;
      }
    });

// Find the deepest y position among all trace nodes
const deepestNode = traceNodes.reduce((deepest, node) => 
  (node.position.y + (node.style?.height || 100)) > (deepest.position.y + (deepest.style?.height || 100)) ? node : deepest, 
  traceNodes[0]
);
const summaryNode = {
  id: `${Date.now()}-summary`,
  type: 'summaryNode',
  data: summaryData,
  position: { x: deepestNode.position.x + 50, y: deepestNode.position.y + (deepestNode.style?.height || 100) + 40 }, // Below deepest node
};

const allNodesBeforeFilter = [...traceNodes, summaryNode];
const containerLeft = Math.min(...allNodesBeforeFilter.map((n) => n.position.x)) - 20;
const containerRight = Math.max(...allNodesBeforeFilter.map((n) => n.position.x + (n.style?.width || 200))) + 150;
const containerTop = Math.min(...allNodesBeforeFilter.map((n) => n.position.y)) - 50;
const containerBottom = Math.max(...allNodesBeforeFilter.map((n) => n.position.y + (n.style?.height || 100))) + 100;
const containerWidth = containerRight - containerLeft;
const containerHeight = containerBottom - containerTop;

const containerNode = {
  id: `${nodeId}-container`,
  type: 'traceContainer',
  data: { label: '' },
  position: { x: containerLeft, y: containerTop },
  style: { width: containerWidth, height: containerHeight },
  draggable: false,
};

    // Add DigDeeperNode at container midpoint
    const digDeeperNode = {
      id: `${nodeId}-digdeeper`,
      type: 'digDeeper',
      data: {
        onDigDeeper: (digDeeperId: string) => {
          const existingOptionsNode = nodes.find((n) =>
            n.type === 'options' && edges.some((e) => e.source === digDeeperId && e.target === n.id)
          );
          if (existingOptionsNode) return;
  
          const optionsNodeId = `${digDeeperId}-options`;
          const optionsPosition = { x: digDeeperNode.position.x + 150, y: digDeeperNode.position.y - 20 };
          const optionsNode = {
            id: optionsNodeId,
            type: 'options',
            data: {
              options: ['Mock Address'],
              onSelect: (optId: string, selectedOption: string) => {
                setNodes((nds) => nds.filter((n) => n.id !== optId));
                setEdges((eds) => eds.filter((e) => e.target !== optId));
  
                if (selectedOption === 'Mock Address') {
                  setTimeout(() => {
                    setActiveTabMain('wallets');
                    setMockAddress(from);
                  }, 2000);
                } 
              },
            },
            position: optionsPosition,
          };
          setNodes((nds) => [...nds, optionsNode]);
          setEdges((eds) => [
            ...eds,
            { id: `e${digDeeperId}-${optionsNodeId}`, source: digDeeperId, target: optionsNodeId, animated: true },
          ]);
        },
      },
      position: { x: containerNode.position.x + containerWidth + 50, y: containerNode.position.y + containerHeight / 2 - 40 },
    };
  
debouncedSetTimeline(timelineData);
debouncedSetNodes((nds) => {
  const updatedNodes = [...nds, containerNode, ...traceNodes, summaryNode, digDeeperNode];
  return updatedNodes;
});
setEdges((eds) => {
  const updatedEdges = [...eds, ...traceEdges];
  return updatedEdges;
});
    setTimeout(() => {
      const endX = summaryNode.position.x + (summaryNode.style?.width || 200) / 2;
      const endY = summaryNode.position.y + (summaryNode.style?.height || 100) / 2;
      setCenter(endX, endY, { zoom: 1.0, duration: 500 });
    }, 100);
  };
  

  const TimelineRow = ({ index, style }) => {
    const step = timeline[index];
    const is1inchV5 = step.label?.includes('1inch V5');
    const isUsdt = step.label?.includes('USDT');
    const isUsdc = step.label?.includes('USDC');
    const isUniswap = step.label?.includes('uniswap');
    const isCoinbase = step.label?.includes('coinbase');
    const isKyberswap = step.label?.includes('kyberswap');
    const isMev = step.label?.includes('mev');
    return (
      <div
        style={{
          ...style,
          cursor: 'pointer',
          color: is1inchV5 ? '#9B59B6' : isUsdt ? '#26A17B': isUsdc ? '#FF69B4': isUniswap ? '#FF69B4': isCoinbase ? '#0052FF': isKyberswap ? '#31CB9E': isMev ? '#FF4500':
          step.isPyusd ? 'rgba(0, 102, 204)' : step.isKnown ? '#818499' : '#818499',
          margin: '5px 0',
          padding: step.isDot ? '0' : '5px',
          background: step.isPyusd && !step.isDot ? 'transparent' : 'transparent',
          borderRadius: '3px',
          fontSize: '15px',
          fontWeight: 300,
          fontFamily: "Josefin Sans, sans-serif",
          textAlign: 'left',
        }}
        onClick={() => {
          const node = nodes.find((n) => n.id === step.id);
          if (node) {
            setCenter(node.position.x + 100, node.position.y + 50, { zoom: 1.0, duration: 500 });
            setSelectedNode(node);
            setSelectedNodeId(node.id);
          }
        }}
      >
        {step.isDot ? '•' : step.label}
      </div>
    );
  };

  const decodeInput = (input) => {
    if (!input || input.length < 10) return 'Unknown';
    const signature = input.slice(0, 10).toLowerCase();
    const signatures = {
      '0xa9059cbb': 'Transfer',
      '0x23b872dd': 'TransferFrom',
      '0x095ea7b3': 'Approve',
      '0xdd62ed3e': 'Allowance',
      '0x5af547e6': 'Collect',
      '0x2e1a7d4d': 'Withdraw',
      '0xd0e30db0': 'Deposit',
      '0x38ed1739': 'Swap',
      '0x7ff36ab5': 'SwapExactETHForTokens',
      '0x049639fb': 'JoinStrategy',
      '0x70a08231': 'BalanceOf',
      '0x37e0ac02': 'ExecuteOperation',
      '0xa231a780': 'ExecuteOperation',
      '0xe449022e': 'uniswapV3Swap',
      '0x128acb08': 'Multicall'
    };
    return signatures[signature] || 'Custom Call';
  };

  const getCallDepth = (nodeId) => {
    let depth = 0;
    let currentId = nodeId;
    while (currentId) {
      const node = nodes.find((n) => n.id === currentId);
      if (!node || !node.data.parentId) break;
      depth++;
      currentId = node.data.parentId;
    }
    return depth;
  };

  const toggleSidePanel = () => setIsSidePanelOpen((prev) => !prev);

  return (
    <>
      {nodes.length === 0 && (
        <div className={styles.centerButton}>
          <button
            className={styles.plusButton}
            onClick={() => addInitialOptionsNode(100, 100)}
          >
            <i className="fa-sharp fa-light fa-plus"></i>
          </button>
        </div>
      )}
      <ReactFlow
        nodes={nodes.map(node => ({
          ...node,
          data: { ...node.data, loading, error, selected: node.id === selectedNodeId },
        }))}
        edges={edges}
        onNodesChange={(changes) => setNodes((nds) => applyNodeChanges(changes, nds) as CustomNode[])}
        onEdgesChange={(changes) => setEdges((eds) => applyEdgeChanges(changes, eds))}
        onConnect={(params) => setEdges((eds) => addEdge(params, eds))}
        style={{ width: '100%', height: '100%' }}
        nodeTypes={nodeTypes}
        onlyRenderVisibleElements={true}
      >
        <Controls />
        <Background variant="dots" gap={25} size={1.5} />
        <button className={styles.restartButton} onClick={clearFlow}>
          <i className="fa-duotone fa-thin fa-rotate-left"></i>
        </button>
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
        style={{ 
          zIndex: 10000
        }}
      />
      {timeline.length > 0 && (
        <>
          <button
            className={`${isSidePanelOpen ? styles.sidePanelArrowVisible : styles.sidePanelArrowHidden}`}
            style={{
              position: 'fixed',
              right: '10px',
              top: 'calc(90px + 40px)',
              width: '20px',
              height: '40px',
              background: '#01021464',
              color: '#ccc',
              border: 'none',
              borderRadius: '8px 0 0 8px',
              cursor: 'pointer',
              zIndex: 1001,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 5px rgba(0, 0, 0, 0.3)',
              transition: 'transform 0.5s ease-in-out',
            }}
            onClick={toggleSidePanel}
          >
            {isSidePanelOpen ? '▶' : '◀'}
          </button>
          <div
            className={`${isSidePanelOpen ? styles.sidePanelVisible : styles.sidePanelHidden}`}
            style={{
              position: 'fixed',
              right: '10px',
              top: 90,
              width: '250px',
              height: `${window.innerHeight * 0.55}px`,
              background: '#010214',
              padding: '10px',
              borderRadius: '8px 0 0 8px',
              boxShadow: '0 2px 5px rgba(0, 0, 0, 0.3)',
              zIndex: 1000,
              transition: 'transform 0.5s ease-in-out',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <button
                onClick={() => setActiveTab('timeline')}
                style={{
                  flex: 1,
                  background: activeTab === 'timeline' ? '#818499' : 'transparent',
                  border: 'none',
                  color: '#fff',
                  padding: '5px',
                  cursor: 'pointer',
                }}
              >
                Timeline
              </button>
              <button
                onClick={() => setActiveTab('nodeTickler')}
                style={{
                  flex: 1,
                  background: activeTab === 'nodeTickler' ? '#818499' : 'transparent',
                  border: 'none',
                  color: '#fff',
                  padding: '5px',
                  cursor: 'pointer',
                }}
              >
                Node Tickler
              </button>
              <button
                onClick={() => setActiveTab('digDeeper')}
                style={{
                  flex: 1,
                  background: activeTab === 'digDeeper' ? '#818499' : 'transparent',
                  border: 'none',
                  color: '#fff',
                  padding: '5px',
                  cursor: 'pointer',
                }}
              >
                Dig Deeper
              </button>
            </div>
            {activeTab === 'timeline' && (
              <FixedSizeList
                height={window.innerHeight * 0.5 - 50}
                width={230}
                itemCount={timeline.length}
                itemSize={35}
                style={{ overflowY: 'auto' }}
              >
                {TimelineRow}
              </FixedSizeList>
            )}
{activeTab === 'nodeTickler' && (
  <div style={{ color: '#fff', padding: '10px', borderRadius: '10px' }}>
    {selectedNode ? (
      <>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
          <div
            style={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              background: selectedNode.data.callDepthColor,
              marginRight: '10px',
            }}
          />
          <h3>{selectedNode.data.contractName || 'Unknown'}</h3>
        </div>
        <p>Role: {decodeInput(selectedNode.data.input)}</p>
        <p>Input: {selectedNode.data.input.slice(0, 20)}...</p>
        {selectedNode.data.error && <p style={{ color: '#FF0000' }}>Error: {selectedNode.data.error}</p>}
        <div>
          <strong>Relationships:</strong>
          <p>
            Caller:{' '}
            {selectedNode.data.parentId === null
              ? 'None' // Root node
              : nodes.some((n) => n.id === selectedNode.data.parentId && n.data.parentId === null)
              ? 'Root' // Parent is the root
              : (() => {
                  const parentNode = nodes.find((n) => n.id === selectedNode.data.parentId);
                  return parentNode
                    ? parentNode.data.contractName ||
                      (parentNode.data.to ? `${parentNode.data.to.slice(0, 6)}...` : 'Unknown')
                    : 'Unknown (Parent Not Found)';
                })()}
          </p>
          <p>
            Callees:{' '}
            {edges
              .filter((e) => e.source === selectedNode.id)
              .map((e) => {
                const targetNode = nodes.find((n) => n.id === e.target);
                return targetNode?.data.contractName || (targetNode?.data.to ? `${targetNode.data.to.slice(0, 6)}...` : 'Unknown');
              })
              .join(', ') || 'None'}
          </p>
        </div>
      </>
    ) : (
      <p>Select a node from the timeline or graph</p>
    )}
  </div>
)}
            {activeTab === 'digDeeper' && (
              <div style={{ color: '#fff', padding: '10px' }}>
                <button
                  onClick={() => {
                    const digDeeperNode = nodes.find((n) => n.type === 'digDeeper');
                    if (digDeeperNode) {
                      setCenter(
                        digDeeperNode.position.x + 100,
                        digDeeperNode.position.y + 50,
                        { zoom: 1.0, duration: 500 }
                      );
                    }
                  }}
                  style={{
                    // background: '#818499',
                    color: '#818499',
                    // border: '1px solid #818499',
                    borderRadius: '50%',
                    cursor: 'pointer',
                    marginBottom: '10px',
                  }}
                >
                <i className="fa-solid fa-hand"></i>
                  
                </button>
                {mevAnalysis.ran ? (
                  <>
                    <h3>Addresses</h3>
                    <ul>
                      {mevAnalysis.results.map((result, index) => (
                        <li key={index}>{result}</li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p>Go to DigDeeper node to Start Mocking!</p>
                )}
              </div>
            )}
          </div>
        </>
      )}
      </ReactFlow>
      <LatestTxScroller />

      <SimulationResultBox timeOfDay={timeOfDay} gasFeeData={gasFeeData} poolMetricsData={poolMetricsData} />
    </>
  );
};

export default Transactions;