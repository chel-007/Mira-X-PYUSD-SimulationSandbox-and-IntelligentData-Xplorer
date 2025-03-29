// components/sandbox/useTransactionTrace.tsx
import { useState } from 'react';
require('dotenv').config();

const gcpProjectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
const gcpApiKey = process.env.GOOGLE_CLOUD_KEY;

const RPC_URL = `https://blockchain.googleapis.com/v1/projects/${gcpProjectId}/locations/us-central1/endpoints/ethereum-mainnet/rpc?key=${gcpApiKey}`;
const PYUSD_ADDRESS = '0x6c3ea9036406852006290770bedfcaba0e23a0e8'.toLowerCase();

export const useTransactionTrace = () => {
  const [trace, setTrace] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchTraceAndReceipt = async (txHash: string) => {
    if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      setError(new Error('Invalid transaction hash'));
      return;
    }

    setLoading(true);
    try {
      // Fetch trace
      const traceResponse = await fetch(RPC_URL, {
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
      if (traceResult.error) {
        throw new Error(traceResult.error.message || 'Trace RPC Error');
      }
      setTrace(traceResult.result);

      // Fetch transaction receipt
      const receiptResponse = await fetch(RPC_URL, {
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
      if (receiptResult.error) {
        throw new Error(receiptResult.error.message || 'Receipt RPC Error');
      }
      setReceipt(receiptResult.result);

      setLoading(false);
    } catch (err) {
      setError(err);
      setLoading(false);
    }
  };

  return { trace, receipt, loading, error, fetchTrace: fetchTraceAndReceipt };
};