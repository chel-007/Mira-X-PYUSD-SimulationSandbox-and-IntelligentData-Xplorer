"use client"
import { useState } from 'react';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const gcpProjectId = process.env.NEXT_PUBLIC_GOOGLE_CLOUD_PROJECT_ID;
const gcpApiKey = process.env.NEXT_PUBLIC_GOOGLE_CLOUD_KEY;

const MAINNET_RPC_URL = `https://blockchain.googleapis.com/v1/projects/${gcpProjectId}/locations/us-central1/endpoints/ethereum-mainnet/rpc?key=${gcpApiKey}`;
const SEPOLIA_RPC_URL = `https://blockchain.googleapis.com/v1/projects/${gcpProjectId}/locations/us-central1/endpoints/ethereum-sepolia/rpc?key=${gcpApiKey}`;
const MAINNET_PYUSD_ADDRESS = '0x6c3ea9036406852006290770bedfcaba0e23a0e8'.toLowerCase();
const SEPOLIA_PYUSD_ADDRESS = '0xCaC524BcA292aaB298996aAd1179F7a59847426b'.toLowerCase();

export const useTransactionTrace = () => {
  const [trace, setTrace] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // const [block, setBlock] = useState(null)

  const fetchTraceAndReceipt = async (txHash: string, rpcUrl: string) => { // Change to rpcUrl (string)
    console.log("fetchTrace RPC_URL:", rpcUrl); // Log the URL directly

    if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      setError(new Error('Invalid transaction hash'));
      toast.error("Invalid transaction hash!");
      return;
    }

    setLoading(true);
    try {
      const traceResponse = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'debug_traceTransaction',
          params: [txHash, { tracer: 'callTracer' }],
        }),
      });
      const traceResult = await traceResponse.json();
      console.log("Trace Result:", traceResult);
      if (traceResult.error) throw new Error(traceResult.error.message || 'Trace RPC Error');
      setTrace(traceResult.result);

      const receiptResponse = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'eth_getTransactionReceipt',
          params: [txHash],
        }),
      });
      const receiptResult = await receiptResponse.json();
      console.log("Receipt Result:", receiptResult);
      if (receiptResult.error) throw new Error(receiptResult.error.message || 'Receipt RPC Error');
      setReceipt(receiptResult.result);

      // New: Fetch block data
    // const blockResponse = await fetch(rpcUrl, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({
    //     jsonrpc: '2.0',
    //     id: 3,
    //     method: 'eth_getBlockByNumber',
    //     params: [receiptResult.result.blockNumber, true], // true for full TX objects
    //   }),
    // });
    // const blockResult = await blockResponse.json();
    // if (blockResult.error) throw new Error(blockResult.error.message || 'Block RPC Error');
    // setBlock(blockResult.result);

      setLoading(false);
    } catch (err) {
      setError(err);
      setLoading(false);
      toast.error(`Failed to fetch trace: ${err.message}`);
    }
  };

  const resetTrace = () => {
    setTrace(null);
    setReceipt(null);
    setLoading(false);
    setError(null);
  };

  return { trace, receipt, loading, error, resetTrace, fetchTrace: fetchTraceAndReceipt };
};