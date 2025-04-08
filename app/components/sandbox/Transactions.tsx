"use client";

import React, { useState, useEffect, useRef } from 'react';
import styles from "../../styles/Transaction.module.css";
import { useReactFlow, ReactFlow, Background, Controls, Handle, Position, Node, Edge, applyNodeChanges, applyEdgeChanges, addEdge } from '@xyflow/react';
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
  const gasPriceWei = BigInt(gasPriceGwei) * BigInt(10 ** 9); // Gwei to wei
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
      console.log(`Submitting TX: ${hash}`);
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

const CallNode = ({ data }) => {
  const colors = {
    pyusd: { bg: 'rgba(0, 102, 204)', border: '#818499' }, // Gold for PYUSD
    usdc: {bg: '#00A3D6', border: '#007BA7'},
    uniswap: { bg: '#FF69B4', border: '#FF1493' }, // Pink for Uniswap
    coinbase: { bg: '#0052FF', border: '#0033CC' }, // Blue for Coinbase
    kyberswap: { bg: '#31CB9E', border: '#1A8C6B' }, // Green for KyberSwap
    usdt: { bg: '#26A17B', border: '#1A7559' }, // Teal for USDT
    mev: { bg: '#FF4500', border: '#CC3700' }, // Red for MEV
    unknown: { bg: '#333', border: '#fff' }, // Gray for unknowns
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
    if (name.includes('mev')) return colors.mev;
    return colors.unknown; // Fallback
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
        border: data.isError ? '2px dashed #FF0000' : `1px solid ${border}`,
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: '#fff' }} />
      <strong>{data.type || 'Call'}</strong><br />
      To: {data.to}<br />
      Gas Used: {weiToEth(data.gasUsed)} ETH<br />
      {data.isKnown && data.contractName &&<span style={{ fontSize: '12px' }}> ({data.contractName})</span>}
      {data.isError && <span style={{ fontSize: '12px', color: '#FF0000' }}> (Failed)</span>}
      <Handle type="source" position={Position.Bottom} style={{ background: '#fff' }} />
    </div>
  );
};


// const CallNode = ({ data }) => (
//   <div style={{ background: '#7BCFFF', padding: '10px', borderRadius: '5px', color: '#fff', position: 'relative' }}>
//     <Handle type="target" position={Position.Top} style={{ background: '#fff' }} />
//     <strong>Call</strong><br />
//     To: {data.to}<br />
//     Gas Used: {weiToEth(data.gasUsed)} ETH<br />
//     {data.contractName && <span style={{ fontSize: '12px' }}> ({data.contractName})</span>}
//     <Handle type="source" position={Position.Bottom} style={{ background: '#fff' }} />
//   </div>
// );

// const ErrorNode = ({ data }) => (
//   <div style={{ background: '#FF6347', padding: '10px', borderRadius: '5px', color: '#fff', position: 'relative' }}>
//     <Handle type="target" position={Position.Top} style={{ background: '#fff' }} />
//     <strong>Error</strong><br />
//     To: {data.to}<br />
//     {data.error}<br />
//     {data.contractName && <span style={{ fontSize: '12px' }}> ({data.contractName})</span>}
//     <Handle type="source" position={Position.Bottom} style={{ background: '#fff' }} />
//   </div>
// );

const ErrorNode = ({ data }) => {
  const colors = {
    pyusd: { bg: 'rgba(0, 102, 204)', border: '#FFA500' }, // Gold for PYUSD
    uniswap: { bg: '#FF69B4', border: '#FF1493' }, // Pink for Uniswap
    coinbase: { bg: '#0052FF', border: '#0033CC' }, // Blue for Coinbase
    kyberswap: { bg: '#31CB9E', border: '#1A8C6B' }, // Green for KyberSwap
    usdt: { bg: '#26A17B', border: '#1A7559' }, // Teal for USDT
    mev: { bg: '#FF4500', border: '#CC3700' }, // Red for MEV
    unknown: { bg: '#FF6347', border: '#fff' }, // Tomato red for unknown errors (your original)
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
    return colors.unknown; // Fallback to your red for unknown errors
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
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'USDC',
    '0xdac17f958d2ee523a2206206994597c13d831ec7': 'USDT',
    '0x264bd8291fae1d75db2c5f573b07faa6715997b5': 'Paxos 4',
    '0x6c3ea9036406852006290770bedfcaba0e23a0e8': 'PYUSD',
    '0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43': 'Coinbase 10',
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
      const inputToken = data.options[0].split(' to ')[0]; // "USDT"
      data.onSelect(data.options[0]); // Trigger onSelect with first option
    }
  }, []); // Run once on mount

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


const parseTrace = (trace, parentId, position, contractNames = {}) => {
  if (!trace || typeof trace !== 'object') {
    console.error('Invalid trace data:', trace);
    return { nodes: [], edges: [], callCount: 0, errorCount: 0 };
  }

  const nodes = [];
  const edges = [];
  const nodeId = `${parentId}-${trace.type || 'call'}-${Math.random().toString(36).substr(2, 5)}`;

  const toLower = trace.to?.toLowerCase();
  const isPyusd = toLower === PYUSD_MAINNET_ADDRESS
  const isError = trace.error || trace.revertReason;
  const contractName = contractNames[toLower] || null;

  nodes.push({
    id: nodeId,
    type: isError ? 'errorNode' : 'callNode',
    data: {
      to: trace.to || 'Unknown',
      gasUsed: trace.gasUsed || '0',
      value: trace.value || '0', // Include for tooltips (ETH or token amounts)
      input: trace.input || '', // For decoding swaps, approvals, etc.
      error: isError ? (trace.error || trace.revertReason) : null,
      contractName,
      isPyusd,
      isKnown: !!contractNames[toLower], // True if in contractNames
      type: trace.type || 'call', // Keep call type (call, staticcall, etc.)
    },
    position: { x: position.x, y: position.y },
  });

  if (trace.calls && Array.isArray(trace.calls) && trace.calls.length > 0) {
    trace.calls.forEach((subcall, index) => {
      const subPosition = { x: position.x + 200, y: position.y + 180 * (index + 1) };
      const { nodes: subNodes, edges: subEdges } = parseTrace(subcall, nodeId, subPosition, contractNames);
      nodes.push(...subNodes);
      edges.push(...subEdges);
      edges.push({
        id: `e${nodeId}-${subNodes[0].id}`,
        source: nodeId,
        target: subNodes[0].id,
        animated: true,
      });
    });
  }

  return {
    nodes,
    edges,
    callCount: nodes.length,
    errorCount: nodes.filter((n) => n.type === 'errorNode').length,
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
    // Set value from data.value initially or simulationResult.amountOut if applicable
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
      // On "Restart" click, clear the flow (passed from Transactions.tsx)
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
          console.log('Transfer Simulation Result:', result);
          setSimulationResult(result);
          setIsSimulated(true); // Switch to Send mode
        } else {
          // Send
          setSimulationResult({ status: 'Sending now' }); // Temp state for SimulationResultBox
          const { txHash } = await sendTransfer(To, String(Amount), data.isMainnet);
          setSimulationResult({ txHash, status: 'Sent' }); // Update with txHash
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
  selector: SelectorNode, // Add this
};

const Transactions = ({ setNodes, setEdges, nodes, edges }: { setNodes: any, setEdges: any, nodes: CustomNode[], edges: Edge[] }) => {
  const chainId = useChainId();
  const isMainnet = chainId === 1; // Single source of truth
  const isSepolia = chainId === 11155111;
  const rpcUrlRef = useRef(isMainnet ? MAINNET_RPC_URL : SEPOLIA_RPC_URL); // Ref for RPC
  const { address } = useAccount();
  const isWalletConnected = !!address;
  const { trace, receipt, loading, error, resetTrace, fetchTrace } = useTransactionTrace();
  const { setSimulationResult, clearSimulation } = useSimulation(); // Keep other context funcs
  const [fetchingNodeId, setFetchingNodeId] = useState(null);
  const { setCenter } = useReactFlow();
  const { timeOfDay, gasFeeData, poolMetricsData } = useData();
  const { ethPrice, loading: ethPriceLoading } = useEthPrice();
  const [mockInputs, setMockInputs] = useState({});
  const [amountNodeId, setAmountNodeId] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [isTimelineOpen, setIsTimelineOpen] = useState(true);

  // Single useEffect for network updates
  useEffect(() => {
    console.log("chainId changed to:", chainId);
    const newIsMainnet = chainId === 1;
    rpcUrlRef.current = newIsMainnet ? MAINNET_RPC_URL : SEPOLIA_RPC_URL;
    console.log("Transactions isMainnet:", newIsMainnet, "RPC:", rpcUrlRef.current);

    // Toast notification for network change
    toast.info(`Connected network changed! ${newIsMainnet ? 'Mainnet' : isSepolia ? 'Sepolia' : 'Unknown'}`, {
      position: "top-right",
      autoClose: 5000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
    });
  }, [chainId, isSepolia]); // Depend only on chainId

  const clearFlow = () => {
    setNodes([]);
    setEdges([]);
    setMockInputs({});
    setTimeline([]);
    setAmountNodeId(null); // Clear amountNodeId
    setFetchingNodeId(null);
    if (typeof resetTrace === 'function' || typeof clearSimulation === 'function') {
      resetTrace();
      clearSimulation();
    } else {
      console.error('resetTrace is not a function:', resetTrace);
    }
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
    console.log("inside add", isMainnet)
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
                              console.log("Submitting hash:", hash, "with RPC:", rpcUrlRef.current);
                              setFetchingNodeId(newId);
                              // Clear previous result nodes and edges
                              setNodes((nds) => {
                                const resultNodeTypes = [
                                  'traceContainer',
                                  'callNode',
                                  'summaryNode',
                                  'digDeeper',
                                  'options', // If spawned by digDeeper
                                  'inspect',
                                  'table',
                                  'textInput' // Nested textInput from Cross Examine
                                ];
                                const nodesToKeep = nds.filter((n) => 
                                  !resultNodeTypes.includes(n.type) || n.id === newId // Keep the current input node
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
                              console.log("fetchTrace called");
                              resetTrace(); // Clear trace/receipt
                              fetchTrace(hash, rpcUrlRef.current);
                              if (receipt && trace) {
                                if (isPyusdTransaction(receipt, trace, isMainnet)) {
                                  console.log("Valid PYUSD transaction");
                                } else {
                                  toast.error("This transaction does not involve PYUSD. Please enter a PYUSD-related TX.");
                                  resetTrace();
                                  setFetchingNodeId(null);
                                }
                              } 
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
                                            const inputToken = value.split(' to ')[0]; // e.g., "USDT"
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

  const PYUSD_ADDRESS = '0x6c3ea9036406852006290770bedfcaba0e23a0e8'.toLowerCase();

  useEffect(() => {
    if (trace && receipt && fetchingNodeId) {
      console.log("Processing trace/receipt for node:", fetchingNodeId);
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
      return; // Exit early, no nodes added
    }
    // console.log("Valid PYUSD transaction");

    setTimeline([]);

    const parentNode = nodes.find((n) => edges.some((e) => e.target === nodeId && e.source === n.id));
    if (!parentNode) {
      // console.error('Parent node not found for ID:', nodeId);
      return;
    }
  
    const contractNames = {
      '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'USDC',
      '0xdac17f958d2ee523a2206206994597c13d831ec7': 'USDT',
      '0x264bd8291fae1d75db2c5f573b07faa6715997b5': 'Paxos 4',
      '0x6c3ea9036406852006290770bedfcaba0e23a0e8': 'PYUSD',
      '0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43': 'Coinbase 10',
      // Expanded known contracts
      '0x7a250d5630b4cf539739df2c5dacb4c659f2488d': 'Uniswap V2 Router',
      '0x1111111254eeb25477b68fb85ed929f73a960582': '1inch V5',
      '0xe592427a0aece92de3edee1f18e0157c05861564': 'Uniswap V3 Router',
      '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45': 'Uniswap Universal Router',
      '0xdef1c0ded9bec7f1a1670819833240f027b25eff': '0x Exchange Proxy',
      '0x9008d19f58aabd9ed0d60971565aa8510560ab41': 'KyberSwap',
      '0x00000000000000adc04c56bf30ac9d3c0aaf14dc': 'Seaport (OpenSea)', // Example marketplace
      '0x0000000000a39bb272e79075ade125fd351887ac': 'Blur Pool', // NFT-related
      // MEV Bots (example addresses - adjust based on known patterns)
      '0x000000000000000000000000000000000000dead': 'MEV Bot (Burner)',
      '0x0000000000007f150bd6f54c40a34d7c3d5e9f56': 'MEV Bot (Common)',
    };

  const startPosition = { x: parentNode.position.x + 500, y: parentNode.position.y - 150 };
  const { nodes: traceNodes, edges: traceEdges, callCount, errorCount } = parseTrace(trace, nodeId, startPosition, contractNames);

  if (traceNodes.length === 0) {
    console.error('No trace nodes generated');
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
      console.log("address", address)
      const label = contractName || (to && typeof to === 'string' ? `${to.slice(0, 6)}...${to.slice(-4)}` : 'Unknown');
      console.log("label", label)
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
    setTimeline(timelineData);

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

// Calculate container bounds including all nodes
const allNodes = [...traceNodes, summaryNode];
const containerLeft = Math.min(...allNodes.map((n) => n.position.x)) - 20;
const containerRight = Math.max(...allNodes.map((n) => n.position.x + (n.style?.width || 200))) + 150;
const containerTop = Math.min(...allNodes.map((n) => n.position.y)) - 50;
const containerBottom = Math.max(...allNodes.map((n) => n.position.y + (n.style?.height || 100))) + 100;
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
          // Find existing InspectNode connected from DigDeeperNode
          const existingInspectNode = nodes.find((n) => 
            n.type === 'inspect' && edges.some((e) => e.source === digDeeperId && e.target === n.id)
          );
    
          if (existingInspectNode) {
            // Collect all nodes to remove: InspectNode and its descendants
            const nodesToRemove = [existingInspectNode.id];
            const collectChildren = (parentId) => {
              const children = nodes.filter((n) => 
                edges.some((e) => e.source === parentId && e.target === n.id)
              );
              children.forEach((child) => {
                nodesToRemove.push(child.id);
                collectChildren(child.id); // Recursively collect nested children
              });
            };
            collectChildren(existingInspectNode.id);
    
            // Remove all related nodes and edges
            setNodes((nds) => nds.filter((n) => !nodesToRemove.includes(n.id)));
            setEdges((eds) => eds.filter((e) => 
              !nodesToRemove.includes(e.source) && !nodesToRemove.includes(e.target)
            ));
          }
    
          // Check for existing OptionsNode
          const existingOptionsNode = nodes.find((n) => 
            n.type === 'options' && edges.some((e) => e.source === digDeeperId && e.target === n.id)
          );
          if (existingOptionsNode) return; // Do nothing if OptionsNode already exists
    
          // Add fresh OptionsNode
          const optionsNodeId = `${digDeeperId}-options`;
          const optionsPosition = { x: digDeeperNode.position.x + 150, y: digDeeperNode.position.y - 20 };
          const optionsNode = {
            id: optionsNodeId,
            type: 'options',
            data: {
              options: ['Balances Of', 'Last Transacts', 'Cross Examine'],
              onSelect: (optId: string, selectedOption: string) => {
                const inspectNodeId = `${Date.now()}-inspect`;
                const inspectNode = {
                  id: inspectNodeId,
                  type: 'inspect',
                  data: { option: selectedOption, loading: selectedOption !== 'Cross Examine' },
                  position: optionsPosition, // Replace OptionsNode position
                };
    
                // Replace OptionsNode with InspectNode
                setNodes((nds) => [
                  ...nds.filter((n) => n.id !== optId),
                  inspectNode,
                ]);
                setEdges((eds) => [
                  ...eds.filter((e) => e.target !== optId),
                  { id: `e${digDeeperId}-${inspectNodeId}`, source: digDeeperId, target: inspectNodeId, animated: true },
                ]);
    
                if (selectedOption === 'Cross Examine') {
                  const textInputNodeId = `${Date.now()}-cross-input`;
                  const textInputNode = {
                    id: textInputNodeId,
                    type: 'textInput',
                    data: {
                      label: 'Enter Address to Cross Examine',
                      onSubmit: (address: string) => {
                        setNodes((nds) => nds.map((n) => 
                          n.id === inspectNodeId ? { ...n, data: { ...n.data, loading: true } } : n
                        ));
                        setTimeout(() => {
                          const resultNodeId = `${Date.now()}-result`;
                          const resultNode = {
                            id: resultNodeId,
                            type: 'table',
                            data: {
                              title: 'Cross Examine Results',
                              content: [`Address 1 interacted with ${address.slice(0, 8)}... 2 times: TX1, TX2`],
                            },
                            position: { x: inspectNode.position.x + 150, y: inspectNode.position.y },
                          };
                          setNodes((nds) => [
                            ...nds.filter((n) => n.id !== textInputNodeId),
                            resultNode,
                          ].map((n) => 
                            n.id === inspectNodeId ? { ...n, data: { ...n.data, loading: false } } : n
                          ));
                          setEdges((eds) => [
                            ...eds.filter((e) => e.target !== textInputNodeId),
                            { id: `e${inspectNodeId}-${resultNodeId}`, source: inspectNodeId, target: resultNodeId, animated: true },
                          ]);
                        }, 2000); // Simulate fetch
                      },
                    },
                    position: { x: inspectNode.position.x + 150, y: inspectNode.position.y },
                  };
                  setNodes((nds) => [...nds, textInputNode]);
                  setEdges((eds) => [
                    ...eds,
                    { id: `e${inspectNodeId}-${textInputNodeId}`, source: inspectNodeId, target: textInputNodeId, animated: true },
                  ]);
                } else {
                  setTimeout(() => {
                    const resultNodeId = `${Date.now()}-result`;
                    const resultNode = {
                      id: resultNodeId,
                      type: 'table',
                      data: {
                        title: `${selectedOption} Results`,
                        content: selectedOption === 'Balances Of' 
                          ? ['Address 1: 1000 PYUSD', 'Address 2: 500 PYUSD']
                          : ['Address 1: TX1, TX2, TX3', 'Address 2: TX4, TX5'],
                      },
                      position: { x: inspectNode.position.x + 150, y: inspectNode.position.y },
                    };
                    setNodes((nds) => [
                      ...nds.map((n) => 
                        n.id === inspectNodeId ? { ...n, data: { ...n.data, loading: false } } : n
                      ),
                      resultNode,
                    ]);
                    setEdges((eds) => [
                      ...eds,
                      { id: `e${inspectNodeId}-${resultNodeId}`, source: inspectNodeId, target: resultNodeId, animated: true },
                    ]);
                  }, 2000); // Simulate fetch
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
  
    setNodes((nds) => {
      const updatedNodes = [...nds, containerNode, ...traceNodes, summaryNode, digDeeperNode];

      setTimeout(() => {
        const endX = summaryNode.position.x + (summaryNode.style?.width || 200) / 2;
        const endY = summaryNode.position.y + (summaryNode.style?.height || 100) / 2;
        setCenter(endX, endY, { zoom: 1.0, duration: 500 }); // Direct pan, 500ms
      }, 100);

      return updatedNodes;
      });
    setEdges((eds) => {
      const updatedEdges = [...eds, ...traceEdges];
      // console.log('Updated Edges:', updatedEdges);
      return updatedEdges;
    });
  };

  // useEffect(() => {
  //   if (trace && receipt && fetchingNodeId) {
  //     console.log('Trace and Receipt Data Received:', { trace, receipt });
  //     handleDataFetched(fetchingNodeId, trace, receipt);
  //     setFetchingNodeId(null);
  //   }
  // }, [trace, receipt, fetchingNodeId]);

  const toggleTimeline = () => {
    setIsTimelineOpen((prev) => !prev); // Toggle state
    console.log('Timeline toggled, isOpen:', !isTimelineOpen); // Debug state change
  };

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
          data: { ...node.data, loading, error } // Pass loading/error to nodes
        }))}
        edges={edges}
        onNodesChange={(changes) => setNodes((nds) => applyNodeChanges(changes, nds) as CustomNode[])}
        onEdgesChange={(changes) => setEdges((eds) => applyEdgeChanges(changes, eds))}
        onConnect={(params) => setEdges((eds) => addEdge(params, eds))}
        style={{ width: '100%', height: '100%' }}
        nodeTypes={nodeTypes}
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
            className={`${isTimelineOpen ? styles.timelineArrowVisible : styles.timelineArrowHidden}`}
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
            onClick={toggleTimeline}
          >
             {isTimelineOpen ? '▶' : '◀'}
          </button>
          <div
            className={`${isTimelineOpen ? styles.timelineVisible : styles.timelineHidden}`}
            style={{
              position: 'fixed',
              right: '10px',
              top: 90,
              width: '220px',
              maxHeight: '50vh',
              overflowY: 'auto',
              background: '#01021464',
              padding: '10px',
              borderRadius: '8px',
              boxShadow: '0 2px 5px rgba(0, 0, 0, 0.3)',
              zIndex: 1000,
              transition: 'transform 0.5s ease-in-out',
            }}
          >
            {timeline.map((step, idx) => (
              <div
                key={step.id}
                style={{
                  cursor: 'pointer',
                  color: step.isPyusd ? 'rgba(0, 102, 204)' : step.isKnown ? '#818499' : '#818499',
                  margin: '5px 0',
                  padding: step.isDot ? '0' : '5px',
                  background: step.isPyusd && !step.isDot ? 'transparent' : 'transparent',
                  borderRadius: '3px',
                  fontSize: step.isDot ? '13px' : '12px',
                  fontWeight: 300,
                  fontFamily: "Josefin Sans, sans-serif",
                  textAlign: step.isDot ? 'left' : 'left',
                }}
                onClick={() => {
                  const node = nodes.find((n) => n.id === step.id);
                  if (node) setCenter(node.position.x + 100, node.position.y + 50, { zoom: 1.0, duration: 500 });
                }}
              >
                {step.isDot ? '•' : step.label}
              </div>
            ))}
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