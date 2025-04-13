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