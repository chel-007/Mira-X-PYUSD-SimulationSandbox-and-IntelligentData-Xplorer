const { Firestore } = require('@google-cloud/firestore');
const WebSocket = require('ws');
require('dotenv').config();


const firestore = new Firestore();
const txCollection = firestore.collection(''); 

const gcpProjectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
const gcpApiKey = process.env.GOOGLE_CLOUD_KEY;

const ws = new WebSocket(`wss://blockchain.googleapis.com/v1/projects/${gcpProjectId}/locations/us-central1/endpoints/ethereum-mainnet/rpc?key=${gcpApiKey}`);

async function getBlockTimestamp(blockNumberHex) {
    const response = await fetch(`https://blockchain.googleapis.com/v1/projects/${gcpProjectId}/locations/us-central1/endpoints/ethereum-mainnet/rpc?key=${gcpApiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "eth_getBlockByNumber",
        params: [blockNumberHex, false],
      }),
    });
    const result = await response.json();
    return parseInt(result.result.timestamp, 16) * 1000; // Convert hex to milliseconds
  }
  
  ws.on("open", () => {
    console.log("✅ Connected to GCP WebSocket");
    ws.send(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_subscribe",
        params: [
          "logs",
          {
            address: "0x6c3ea9036406852006290770bedfcaba0e23a0e8", // PYUSD contract
            topics: [], // Transfer event topic
          },
        ],
      })
    );
  });
  
  ws.on("message", async (data) => {
    try {
      const log = JSON.parse(data);
      const logData = log.params?.result;
  
      if (!logData || !logData.topics || logData.topics.length < 3) {
        console.log("Invalid log format or missing topics:", logData);
        return;
      }

      const rawValue = BigInt(logData.data);
      const adjustedValue = Number(rawValue) / 1_000_000;
  
      const txHash = logData.transactionHash;
      const sender = "0x" + logData.topics[1].slice(26);
      const receiver = "0x" + logData.topics[2].slice(26);
      const value = adjustedValue.toFixed(6)
      const blockNumberHex = logData.blockNumber;
      const blockNumber = parseInt(blockNumberHex, 16);
  
      // Fetch the block timestamp
      const timestampMs = await getBlockTimestamp(blockNumberHex);
      const timestamp = new Date(timestampMs).toISOString();
  
      const txData = {
        txHash,
        sender,
        receiver,
        value,
        timestamp, // Accurate block timestamp
        blockNumber,
      };
  
      // Upload to Firestore
      await txCollection.doc(txHash).set(txData);
        console.log(`Uploaded TX: ${txHash} | ${sender} → ${receiver} | Amount: ${value}`);
        // console.log(logData)
    
    } catch (error) {
        console.error("Error processing WebSocket message:", error);
    }
});
