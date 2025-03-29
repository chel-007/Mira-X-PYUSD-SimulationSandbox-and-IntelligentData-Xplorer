const { Firestore } = require("@google-cloud/firestore");
const { BigQuery } = require("@google-cloud/bigquery");
const functions = require("firebase-functions");

const firestore = new Firestore();
const bigquery = new BigQuery({ projectId: "mirax-beta" });

const BQ_DATASET = "pyusd_data";
const BQ_TABLE = "transfer_logs";

exports.syncToBigQuery = functions.https.onRequest(async (req, res) => {
  try {
    const snapshot = await firestore.collection("transfer_transactions").get();
    const unsyncedCount = snapshot.size;

    if (unsyncedCount < 1000) { // Assuming 10,000 is intentional
      console.log(`🚨 Only ${unsyncedCount} docs - Skipping sync`);
      res.status(200).send(`Only ${unsyncedCount} docs, waiting for 10,000.`);
      return;
    }

    console.log(`✅ ${unsyncedCount} docs found, syncing first 1000...`);

    const docs = await firestore.collection("transfer_transactions").limit(1000).get();
    const logs = docs.docs.map((doc) => {
        const data = doc.data();
        return {
          tx_hash: data.txHash,
          sender: data.sender,
          receiver: data.receiver,
          value: data.value, // Matches FLOAT64
          block_number: data.blockNumber,
          timestamp: new Date(data.timestamp).getTime() // Matches INTEGER
        };
      });

      console.log("Sample log:", logs[0]); // Debug

    const tableRef = bigquery.dataset(BQ_DATASET).table(BQ_TABLE);
    const insertResult = await tableRef.insert(logs); // Drop raw: true

    console.log(`✅ Synced ${logs.length} logs to BigQuery`, insertResult);

    const batch = firestore.batch();
    docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    console.log(`🗑️ Deleted ${logs.length} synced docs from Firestore`);
    res.status(200).send(`Synced and deleted ${logs.length} docs.`);

    await firestore.collection("sync_status").doc("latest").set({ lastSync: Date.now() });
    return null; // Success
  } catch (error) {
      console.error("❌ Error in Firestore to BigQuery sync:", error);
      if (error.errors) {
        console.error("Detailed errors:");
        error.errors.forEach((err, index) => {
          console.error(`Failed row ${index}:`, JSON.stringify(err.row, null, 2));
          console.error(`Error details:`, err.errors);
        });
      }
      throw error;
    }
});


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