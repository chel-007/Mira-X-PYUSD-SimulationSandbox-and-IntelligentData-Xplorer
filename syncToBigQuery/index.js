const { Firestore } = require("@google-cloud/firestore");
const { BigQuery } = require("@google-cloud/bigquery");
const functions = require("firebase-functions");

const firestore = new Firestore();
const bigquery = new BigQuery({ projectId: "mirax-beta" });

const BQ_DATASET = "pyusd_data";
const TRANSFER_TABLE = "transfer_logs_";
const LP_TABLE = "lp_activity_and_gas";

exports.syncToBigQuery = functions.https.onRequest(async (req, res) => {
  try {
    // Sync transfer_transactions
    await syncCollection("transfer_transactions", TRANSFER_TABLE, mapTransferLog);
    
    // Sync lp_and_transfers
    await syncCollection("lp_and_transfers", LP_TABLE, mapLpActivity);

    // Update sync status
    await firestore.collection("sync_status").doc("latest").set({ lastSync: Date.now() });
    res.status(200).send("Sync completed for both collections.");
    return null;
  } catch (error) {
    console.error("Error in Firestore to BigQuery sync:", error);
    if (error.errors) {
      console.error("Detailed errors:");
      error.errors.forEach((err, index) => {
        console.error(`Failed row ${index}:`, JSON.stringify(err.row, null, 2));
        console.error(`Error details:`, err.errors);
      });
    }
    res.status(500).send("Sync failed.");
    throw error;
  }
});

// Generic sync function for any collection
async function syncCollection(collectionName, tableName, mapFunction) {
  const snapshot = await firestore.collection(collectionName).get();
  const unsyncedCount = snapshot.size;

  if (unsyncedCount < 500) {
    console.log(`${collectionName}: Only ${unsyncedCount} docs - Skipping sync`);
    return;
  }

  console.log(`${collectionName}: ${unsyncedCount} docs found, syncing first 1000...`);

  const docs = await firestore.collection(collectionName).limit(1000).get();
  const logs = docs.docs.map((doc) => {
    const data = doc.data();
    return mapFunction(data);
  });

  console.log(`${collectionName} sample log:`, logs[0]);

  const tableRef = bigquery.dataset(BQ_DATASET).table(tableName);
  const insertResult = await tableRef.insert(logs);

  console.log(`${collectionName}: Synced ${logs.length} logs to BigQuery`, insertResult);

  const batch = firestore.batch();
  docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();

  console.log(`${collectionName}: Deleted ${logs.length} synced docs from Firestore`);
}

function mapTransferLog(data) {
  return {
    tx_hash: data.txHash,
    sender: data.sender,
    receiver: data.receiver,
    value: data.value,
    block_number: data.blockNumber,
    timestamp: new Date(data.timestamp).getTime()
  };
}

// Mapping function for lp_and_transfers
function mapLpActivity(data) {
let timestamp = data.block_timestamp || Date.now();
  if (typeof timestamp === 'number' && timestamp > 1e12) {
    timestamp = Math.floor(timestamp / 1000);
  }
  return {
    block_number: data.block_number || 0,
    block_timestamp: timestamp,
    tx_hash: data.tx_hash || "",
    log_index: data.log_index || 0,
    address: data.address || "",
    event_signature: data.event_signature || "",
    topics: data.topics || [],
    args: data.args ? JSON.stringify(data.args) : null,
    from_address: data.from_address || "",
    to_address: data.to_address || "",
    input: data.input || "",
    gas_price: data.gas_price || 0,
    gas_used: data.gas_used || 0,
    status: data.status || 0,
    event_type: data.event_type || ""
  };
}


// gcloud functions deploy syncToBigQuery --region us-central1 --runtime nodejs20 --trigger-http --entry-point syncToBigQuery --allow-unauthenticated


// gcloud functions deploy syncToBigQuery --region us-central1 --runtime nodejs20 --trigger-http --entry-point syncToBigQuery --allow-unauthenticated


// SELECT
//   transaction_hash AS tx_hash,
//   CONCAT('0x', RIGHT(topics[SAFE_OFFSET(1)], 40)) AS sender,
//   CONCAT('0x', RIGHT(topics[SAFE_OFFSET(2)], 40)) AS receiver,
//   FORMAT('%.6f', SAFE_CAST(CAST(CONCAT('0x', SUBSTR(data, 3)) AS INT64) AS FLOAT64) / 1000000) AS value,
//   block_number,
//   UNIX_MILLIS(block_timestamp) AS timestamp
// FROM
//   `bigquery-public-data.goog_blockchain_ethereum_mainnet_us.logs`
// WHERE
//   address = '0x6c3ea9036406852006290770bedfcaba0e23a0e8'
//   AND topics[SAFE_OFFSET(0)] = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
//   AND block_timestamp >= '2024-01-01 00:00:00 UTC'
//   AND block_timestamp < '2025-03-22 10:20:00 UTC'
// ORDER BY
//   block_number




// const { Firestore } = require("@google-cloud/firestore");
// const { BigQuery } = require("@google-cloud/bigquery");
// const functions = require("firebase-functions");

// const firestore = new Firestore();
// const bigquery = new BigQuery({ projectId: "mirax-beta" });

// const BQ_DATASET = "pyusd_data";
// const TRANSFER_TABLE = "transfer_logs_";
// const LP_TABLE = "lp_activity_and_gas_";

// exports.syncToBigQuery = functions.https.onRequest(async (req, res) => {
//   try {
//     await syncCollection("transfer_transactions", TRANSFER_TABLE, mapTransferLog, false);
//     await syncCollection("lp_and_transfers", LP_TABLE, mapLpActivity, true);

//     await firestore.collection("sync_status").doc("latest").set({ lastSync: Date.now() });
//     res.status(200).send("Sync completed for both collections.");
//     return null;
//   } catch (error) {
//     console.error("Error in Firestore to BigQuery sync:", error);
//     if (error.errors) {
//       console.error("Detailed errors:");
//       error.errors.forEach((err, index) => {
//         console.error(`Failed row ${index}:`, JSON.stringify(err.row, null, 2));
//         console.error(`Error details:`, err.errors);
//       });
//     }
//     res.status(500).send("Sync failed.");
//     throw error;
//   }
// });

// async function syncCollection(collectionName, tableName, mapFunction, checkTwoDays = false) {
//   const snapshot = await firestore.collection(collectionName).get();
//   const unsyncedCount = snapshot.size;

//   if (unsyncedCount < 300) {
//     console.log(`${collectionName}: Only ${unsyncedCount} docs - Skipping sync`);
//     return;
//   }

//   console.log(`${collectionName}: ${unsyncedCount} docs found, syncing first 300...`);
//   const docs = await firestore.collection(collectionName).limit(500).get();
//   const logs = docs.docs.map(doc => mapFunction(doc.data()));

//   const tableRef = bigquery.dataset(BQ_DATASET).table(tableName);
//   let newLogs = logs;
//   let existingTxHashes;

//   if (checkTwoDays) {
//     // Calculate timestamp for 2 days ago
//     const now = Math.floor(Date.now() / 1000); // Current time in seconds
//     const twoDaysAgo = now - (2 * 24 * 60 * 60); // 48 hours ago in seconds

//     // Fetch existing tx_hash values from BigQuery for the last 2 days
//     const [existingRows] = await tableRef.query({
//       query: `
//         SELECT tx_hash 
//         FROM \`${BQ_DATASET}.${tableName}\`
//         WHERE CAST(block_timestamp AS INT64) >= ${twoDaysAgo}
//       `,
//     });
//     existingTxHashes = new Set(existingRows.map(row => row.tx_hash));
//     console.log(`Fetched ${existingTxHashes.size} tx_hash values from BigQuery for the last 2 days`);

//     // Filter out logs already in BigQuery
//     newLogs = logs.filter(log => !existingTxHashes.has(log.tx_hash));
//     if (newLogs.length === 0) {
//       console.log(`${collectionName}: No new tx_hash to sync`);
//     }
//   }

//   // Sync new logs if there are any
//   if (newLogs.length > 0) {
//     console.log(`${collectionName} sample log:`, newLogs[0]);
//     console.log(`${collectionName}: Syncing ${newLogs.length} new logs`);
//     const insertResult = await tableRef.insert(newLogs);
//     console.log(`${collectionName}: Synced ${newLogs.length} logs to BigQuery`, insertResult);
//   }

//   // Delete synced and duplicate docs from Firestore
//   const batch = firestore.batch();
//   let deletedCount = 0;

//   docs.forEach(doc => {
//     const docTxHash = doc.data().tx_hash;
//     if (!checkTwoDays || existingTxHashes?.has(docTxHash)) {
//       // Delete all synced for transfer_logs_, or duplicates for lp_activity_and_gas
//       batch.delete(doc.ref);
//       deletedCount++;
//     } else if (newLogs.some(log => log.tx_hash === docTxHash)) {
//       // Delete newly synced docs for lp_activity_and_gas
//       batch.delete(doc.ref);
//       deletedCount++;
//     }
//   });

//   await batch.commit();
//   console.log(`${collectionName}: Deleted ${deletedCount} docs from Firestore (synced + duplicates)`);
// }

// // Mapping functions remain unchanged
// function mapTransferLog(data) {
//   return {
//     tx_hash: data.txHash,
//     sender: data.sender,
//     receiver: data.receiver,
//     value: data.value,
//     block_number: data.blockNumber,
//     timestamp: new Date(data.timestamp).getTime()
//   };
// }

// function mapLpActivity(data) {
//   let timestamp = data.block_timestamp || Date.now();
//   if (typeof timestamp === 'number' && timestamp > 1e12) {
//     timestamp = Math.floor(timestamp / 1000);
//   }
//   return {
//     block_number: data.block_number || 0,
//     block_timestamp: timestamp,
//     tx_hash: data.tx_hash || "",
//     log_index: data.log_index || 0,
//     address: data.address || "",
//     event_signature: data.event_signature || "",
//     topics: data.topics || [],
//     args: data.args ? JSON.stringify(data.args) : null,
//     from_address: data.from_address || "",
//     to_address: data.to_address || "",
//     input: data.input || "",
//     gas_price: data.gas_price || 0,
//     gas_used: data.gas_used || 0,
//     status: data.status || 0,
//     event_type: data.event_type || ""
//   };
// }