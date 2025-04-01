"use client";

import React, { useState, useEffect, useRef } from 'react';
import styles from "../../styles/Transaction.module.css";
import { useReactFlow, ReactFlow, Background, Controls, Handle, Position, Node, Edge, applyNodeChanges, applyEdgeChanges, addEdge } from '@xyflow/react';
import { useTransactionTrace } from './useTransactionTrace';
import LatestTxScroller from './latestTxScroller';
import { useChainId, useAccount } from 'wagmi';
import { useTransactionSimulation } from './useTransactionSimulation';
import MiraAISuggestions from './miraAISuggestions';
import { useSimulation } from '../../utils/SimulationContext';
import SimulationResultBox from './SimulationResultBox';
import { useData } from '../../utils/DataProvider';
import { ToastContainer, toast } from 'react-toastify';
import { SimulationProvider } from "../utils/SimulationContext";
import 'react-toastify/dist/ReactToastify.css'; // Import default styles

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
      alert('Please enter a valid transaction hash (0x + 64 hex characters)');
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


const CallNode = ({ data }) => (
  <div style={{ background: '#7BCFFF', padding: '10px', borderRadius: '5px', color: '#fff', position: 'relative' }}>
    <Handle type="target" position={Position.Top} style={{ background: '#fff' }} />
    <strong>Call</strong><br />
    To: {data.to}<br />
    Gas Used: {weiToEth(data.gasUsed)} ETH<br />
    {data.contractName && <span style={{ fontSize: '12px' }}> ({data.contractName})</span>}
    <Handle type="source" position={Position.Bottom} style={{ background: '#fff' }} />
  </div>
);

const ErrorNode = ({ data }) => (
  <div style={{ background: '#FF6347', padding: '10px', borderRadius: '5px', color: '#fff', position: 'relative' }}>
    <Handle type="target" position={Position.Top} style={{ background: '#fff' }} />
    <strong>Error</strong><br />
    To: {data.to}<br />
    {data.error}<br />
    {data.contractName && <span style={{ fontSize: '12px' }}> ({data.contractName})</span>}
    <Handle type="source" position={Position.Bottom} style={{ background: '#fff' }} />
  </div>
);

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

// const InspectNode = ({ data }) => {
//   const icons = {
//     'Balances Of': 'fa-wallet',
//     'Last Transacts': 'fa-list',
//     'Cross Examine': 'fa-search',
//   };
//   const iconClass = data.loading ? 'fa-spinner fa-spin' : icons[data.option];

//   return (
//     <div style={{ 
//       background: '#333', 
//       padding: '10px', 
//       borderRadius: '5px', 
//       color: '#fff',
//       display: 'flex',
//       alignItems: 'center',
//       gap: '8px',
//     }}>
//       <i className={`fa-solid ${iconClass}`} />
//       <span>{data.option}</span>
//       <Handle type="source" position={Position.Right} style={{ background: '#00ffcc' }} />
//     </div>
//   );
// };

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
    { label: 'From', xOffset: 150, yOffset: 200 },
    { label: 'To', xOffset: 250, yOffset: 200 },
    { label: 'AmountIn', xOffset: 200, yOffset: 300 },
    { label: 'AmountOut', xOffset: 200, yOffset: 400 },
  ],
};



// Parse trace data
const parseTrace = (trace, parentId, position, contractNames = {}) => {
  // console.log('Parsing Trace:', trace);
  if (!trace || typeof trace !== 'object') {
    // console.error('Invalid trace data:', trace);
    return { nodes: [], edges: [], callCount: 0, errorCount: 0 };
  }

  const nodes = [];
  const edges = [];
  const nodeId = `${parentId}-${trace.type || 'call'}-${Math.random().toString(36).substr(2, 5)}`;

  const isError = trace.error || trace.revertReason;
  nodes.push({
    id: nodeId,
    type: isError ? 'errorNode' : 'callNode',
    data: {
      to: trace.to || 'Unknown',
      gasUsed: trace.gasUsed || '0',
      error: isError ? (trace.error || trace.revertReason) : null,
      contractName: contractNames[trace.to] || null,
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

  // console.log('Generated Nodes:', nodes);
  return { nodes, edges, callCount: nodes.length, errorCount: nodes.filter(n => n.type === 'errorNode').length };
};


const InputNode = ({ data, id }) => {
  const [value, setValue] = useState(data.value || '');
  const [lastAlertTime, setLastAlertTime] = useState(0);
  const inputRef = useRef(null);

  // Sync local value with data.value whenever it changes
  useEffect(() => {
    setValue(data.value || '');
  }, [data.value]);

  const handleChange = (e) => {
    if (!data.isWalletConnected) {
      const now = Date.now();
      if (now - lastAlertTime > 1000) {
        // console.log("Toast triggered: Please connect your wallet first!");
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
    if (!data.isWalletConnected) {
      const now = Date.now();
      if (now - lastAlertTime > 1000) {
        // console.log("Toast triggered: Please connect your wallet first!");
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
        className={!data.isWalletConnected ? styles.disabledInput : ''}
        title={!data.isWalletConnected ? "Please connect your wallet first" : ""}
      />
      <Handle type="source" position={Position.Bottom} style={{ background: '#00ffcc' }} />
    </div>
  );
};

const MockButtonNode = ({ data, id }) => {
  const [loading, setLoading] = useState(false);
  const { simulateTransfer } = useTransactionSimulation(data.rpcUrl);
  const { setSimulationResult, clearSimulation } = useSimulation();

  const handleMock = async () => {
    setLoading(true);
    clearSimulation();
    const { From, To, Amount } = data.inputs || {};
    if (!From || !To || !Amount) {
      setSimulationResult({ error: 'Missing required fields' });
      setLoading(false);
      return;
    }
    try {
      const result = await simulateTransfer(From, To, String(Amount), data.isMainnet);
      console.log('Simulation Result:', result);
      setSimulationResult(result); // Set to context, not local state
    } catch (error) {
      setSimulationResult({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.mockButtonNode}>
      <Handle type="target" position={Position.Top} style={{ background: '#00ffcc' }} />
      <button onClick={handleMock} disabled={loading} style={{ background: 'green' }}>
        {loading ? <i className="fa-spin fa-spinner" /> : 'Simulate'}
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
};

const Transactions = ({ setNodes, setEdges, nodes, edges }: { setNodes: any, setEdges: any, nodes: CustomNode[], edges: Edge[] }) => {
  const { trace, receipt, loading, error, resetTrace, fetchTrace } = useTransactionTrace();
  const { setSimulationResult, clearSimulation } = useSimulation();
  // console.log('useTransactionTrace output:', { trace, receipt, loading, error, resetTrace, fetchTrace });
  const [fetchingNodeId, setFetchingNodeId] = useState(null);
  const { setCenter } = useReactFlow();
  const chainId = useChainId();
  const { address } = useAccount();
  const { timeOfDay, gasFeeData, poolMetricsData } = useData();
  const [mockInputs, setMockInputs] = useState({});
  const [amountNodeId, setAmountNodeId] = useState(null); // Track Amount node ID

  const isMainnet = chainId === 1;
  const isSepolia = chainId === 11155111;
  const rpcUrl = isMainnet ? MAINNET_RPC_URL : SEPOLIA_RPC_URL;
  const isWalletConnected = !!address; // True if address is defined, false if undefined

  // useEffect(() => {
  //   console.log(`Wallet connected to ${isMainnet ? 'Mainnet' : isSepolia ? 'Sepolia' : 'Unknown'}, RPC: ${rpcUrl}`);
  //   console.log("address", address)
  // }, [chainId]);

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
      if (label === 'Amount') {
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
    const amountNode = amountNodeId ? nodes.find((n) => n.id === amountNodeId) : null;
    const hasAllFields = !!(mockInputs.From && mockInputs.To && mockInputs.Amount);
    const isValidInputs = hasAllFields &&
      isValidEthAddress(mockInputs.From) &&
      isValidEthAddress(mockInputs.To) &&
      mockInputs.From !== mockInputs.To &&
      parseFloat(mockInputs.Amount) > 0;

    // console.log('useEffect - mockInputs:', mockInputs);
    // console.log('useEffect - hasAllFields:', hasAllFields);
    // console.log('useEffect - isValidInputs:', isValidInputs);

    if (!isWalletConnected) {
      // console.log('Wallet not connected, skipping MockButtonNode logic');
      if (existingMockNode) {
        setNodes((nds) => nds.filter((n) => n.id !== existingMockNode.id));
        setEdges((eds) => eds.filter((e) => e.target !== existingMockNode.id));
      }
      return;
    }

    if (existingMockNode && !isValidInputs) {
      // console.log('Removing MockButtonNode due to invalid inputs');
      setNodes((nds) => nds.filter((n) => n.id !== existingMockNode.id));
      setEdges((eds) => eds.filter((e) => e.target !== existingMockNode.id));
      return;
    }

    if (isValidInputs && amountNode) {
      const mockId = existingMockNode ? existingMockNode.id : `${Date.now()}-mock`;
      const mockPosition = {
        x: amountNode.position.x,
        y: amountNode.position.y + MOCK_BUTTON_Y_OFFSET,
      };

      // console.log('Adding/updating MockButtonNode with inputs:', mockInputs);
      setNodes((nds) => {
        const updatedNodes = existingMockNode
          ? nds.map((n) =>
              n.id === mockId
                ? { ...n, data: { ...n.data, inputs: mockInputs }, position: mockPosition }
                : n
            )
          : [
              ...nds,
              {
                id: mockId,
                type: 'mockButton',
                data: {
                  inputs: mockInputs,
                  isMainnet,
                  rpcUrl,
                  useData: () => ({ timeOfDay, swapVolumeData }),
                },
                position: mockPosition,
              },
            ];
        return updatedNodes;
      });

      setEdges((eds) => {
        const edgeId = `e${amountNode.id}-${mockId}`;
        const existingEdge = eds.find((e) => e.id === edgeId);
        if (!existingEdge) {
          return [...eds.filter((e) => e.target !== mockId), { id: edgeId, source: amountNode.id, target: mockId, animated: true }];
        }
        return eds;
      });
    }
  }, [mockInputs, amountNodeId, setNodes, setEdges, isMainnet, rpcUrl, timeOfDay, isWalletConnected]);

  const addInitialOptionsNode = (x, y) => {
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
                              resetTrace(); // Clear trace/receipt
                              fetchTrace(hash);
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
                                    const inputId = `${Date.now()}-${input.label.toLowerCase()}`;
                                    return {
                                      id: inputId,
                                      type: 'input',
                                      data: {
                                        label: input.label,
                                        onChange: (label, value, id) => handleInputChange(label, value, id),
                                        onFocus: () => handleFocus(input.label, inputId),
                                        isWalletConnected, // Pass wallet connection status
                                      },
                                      position: { x: mockNode.position.x + input.xOffset, y: mockNode.position.y + input.yOffset },
                                    };
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

                                  newEdges = [
                                    { id: `e${parentId}-${optionId}`, source: parentId, target: optionId, animated: true },
                                    ...inputNodes.map((node) => ({
                                      id: `e${optionId}-${node.id}`,
                                      source: optionId,
                                      target: node.id,
                                      animated: true,
                                    })),
                                  ];
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

  const isPyusdTransaction = (trace: any): boolean => {
    if (!trace) return false;
    if (trace.to?.toLowerCase() === PYUSD_ADDRESS) return true;
    if (trace.calls) {
      for (const call of trace.calls) {
        if (isPyusdTransaction(call)) return true;
      }
    }
    return false;
  };

  const handleDataFetched = (nodeId: string, trace: any, receipt: any) => {
    if (!isPyusdTransaction(trace)) {
      alert('Only PYUSD transactions are supported.');
      return;
    }
    // console.log('Handle Data Fetched:', { trace, receipt });
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
    };
  
    const startPosition = { x: parentNode.position.x + 500, y: parentNode.position.y - 150 };
    const { nodes: traceNodes, edges: traceEdges, callCount, errorCount } = parseTrace(trace, nodeId, startPosition, contractNames);
  
    if (traceNodes.length === 0) {
      console.error('No trace nodes generated');
      return;
    }
  
    // Parse receipt logs for PYUSD Transfer event
    const transferLog = receipt.logs.find((log: any) => 
      log.address.toLowerCase() === PYUSD_ADDRESS &&
      log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
    );
    let from = 'Unknown';
    let to = 'Unknown';
    let pyusdValue = '0';
    if (transferLog) {
      from = `0x${transferLog.topics[1].slice(-40)}`; // Extract 'from' from topic[1]
      to = `0x${transferLog.topics[2].slice(-40)}`;   // Extract 'to' from topic[2]
      pyusdValue = (parseInt(transferLog.data, 16) / 1e6).toFixed(2); // Convert from wei (6 decimals for PYUSD)
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
  
    const lastNode = traceNodes[traceNodes.length - 1] || parentNode;
    const summaryNode = {
      id: `${Date.now()}-summary`,
      type: 'summaryNode',
      data: summaryData,
      position: { x: lastNode.position.x + 50, y: lastNode.position.y + 150 },
    };
  
    const containerLeft = startPosition.x - 20;
    const rightmostX = Math.max(lastNode.position.x + 50, summaryNode.position.x + 300);
    const containerWidth = rightmostX - containerLeft + 50;
    
    const containerTop = startPosition.y - 40;
    const summaryBottom = summaryNode.position.y + 150;
    const containerHeight = summaryBottom - containerTop + 60;
  
    const containerNode = {
      id: `${nodeId}-container`,
      type: 'traceContainer',
      data: { label: '' },
      position: { x: startPosition.x - 20, y: startPosition.y - 50 },
      style: { width: containerWidth, height: containerHeight },
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
      // console.log('Updated Nodes:', updatedNodes);
      return updatedNodes;
    });
    setEdges((eds) => {
      const updatedEdges = [...eds, ...traceEdges];
      // console.log('Updated Edges:', updatedEdges);
      return updatedEdges;
    });
  };

  useEffect(() => {
    if (trace && receipt && fetchingNodeId) {
      console.log('Trace and Receipt Data Received:', { trace, receipt });
      handleDataFetched(fetchingNodeId, trace, receipt);
      setFetchingNodeId(null);
    }
  }, [trace, receipt, fetchingNodeId]);

  const clearFlow = () => {
    setNodes([]);
    setEdges([]);
    setMockInputs({}); // Clear mockInputs
    setAmountNodeId(null); // Clear amountNodeId
    setFetchingNodeId(null);
    if (typeof resetTrace === 'function' || typeof clearSimulation === 'function') {
      resetTrace();
      clearSimulation();
    } else {
      console.error('resetTrace is not a function:', resetTrace);
    }
  };

  return (
    <>
      {nodes.length === 0 && (
        <div className={styles.centerButton}>
          <button
            className={styles.plusButton}
            onClick={() => addInitialOptionsNode(400, 300)}
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
        position="top-right" // Adjust position as needed
        autoClose={5000} // Closes after 5 seconds
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        style={{ zIndex: 10000 }} // Inline z-index increase
      />
        <LatestTxScroller />
      </ReactFlow>
      <SimulationResultBox timeOfDay={timeOfDay} gasFeeData={gasFeeData} poolMetricsData={poolMetricsData} />
    </>
  );
};

export default Transactions;