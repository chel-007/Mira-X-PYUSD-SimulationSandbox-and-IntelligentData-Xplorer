require('dotenv').config();
const express = require('express');
const WebSocket = require('ws');
const { BigQuery } = require('@google-cloud/bigquery');
const admin = require('firebase-admin');

const app = express();
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

// Initialize BigQuery and Firestore
const projectId = process.env.PROJECT_ID;
const bigquery = new BigQuery({
  projectId,
  // keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});
// admin.initializeApp({
//   credential: admin.credential.cert(process.env.GOOGLE_APPLICATION_CREDENTIALS),
// });
// const db = admin.firestore();
let db;
try {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
  db = admin.firestore();
  console.log('Firebase Admin initialized successfully');
} catch (error) {
  console.error('Failed to initialize Firebase Admin:', error);
  process.exit(1);
}
const collectionName = process.env.FIRESTORE_COLLECTION;
const REQUIRED_TOKEN = process.env.REQUIRED_TOKEN;

// console.log('Initializing server with projectId:', projectId);
// console.log('Firestore collection:', collectionName);
// console.log('Required token:', REQUIRED_TOKEN);

// Cache for BigQuery data
let cachedData = {
  timeOfDay: [],
  gasFeeData: [],
  poolMetricsData: [],
  txPerHour: 0,
};

// WebSocket clients
const clients = new Set();

const gasComparisonQuery = `
    SELECT
      DATE(TIMESTAMP_SECONDS(CAST(block_timestamp AS INT64))) AS event_date,
      EXTRACT(HOUR FROM TIMESTAMP_SECONDS(CAST(block_timestamp AS INT64))) AS hour_of_day,
      event_type,
      AVG(CAST(gas_used AS INT64) * CAST(gas_price AS BIGNUMERIC) / 1e18) AS avg_gas_fee_eth,
      COUNT(DISTINCT tx_hash) AS transaction_count,
      ARRAY_AGG(tx_hash) AS tx_hashes
    FROM \`${projectId}.pyusd_data.lp_activity_and_gas_latest\`
    WHERE event_type IN ('Transfer', 'Swap')
      AND DATE(TIMESTAMP_SECONDS(CAST(block_timestamp AS INT64))) >= DATE_SUB(CURRENT_DATE(), INTERVAL 60 DAY)
      AND DATE(TIMESTAMP_SECONDS(CAST(block_timestamp AS INT64))) <= CURRENT_DATE()
    GROUP BY event_date, hour_of_day, event_type
    ORDER BY event_date, hour_of_day, event_type
`;
const timeOfDayQuery = `
    SELECT
      DATE(TIMESTAMP_SECONDS(CAST(block_timestamp AS INT64))) AS event_date,
      EXTRACT(HOUR FROM TIMESTAMP_SECONDS(CAST(block_timestamp AS INT64))) AS hour_of_day,
      AVG(CAST(gas_used AS INT64) * CAST(gas_price AS BIGNUMERIC) / 1e18) AS avg_gas_fee_eth,
      COUNT(*) AS transaction_count
    FROM \`${projectId}.pyusd_data.lp_activity_and_gas_latest\`
    WHERE DATE(TIMESTAMP_SECONDS(CAST(block_timestamp AS INT64))) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
    GROUP BY event_date, hour_of_day
    ORDER BY event_date, hour_of_day;
`;
const poolMetricsQuery = `
      SELECT
        address AS pool_address,
        AVG(CAST(gas_used AS INT64) * CAST(gas_price AS BIGNUMERIC) / 1e18) AS avg_gas_fee_eth,
        APPROX_QUANTILES(CAST(gas_used AS INT64) * CAST(gas_price AS BIGNUMERIC) / 1e18, 100)[OFFSET(50)] AS median_gas_fee_eth,
        COUNT(*) AS swap_count,
        SUM(
          CASE
            WHEN address = '0x625e92624bc2d88619accc1788365a69767f6200' THEN
              CASE
                WHEN CAST(JSON_EXTRACT_SCALAR(args, '$.sold') AS INT64) = 0 THEN
                  CAST(JSON_EXTRACT_SCALAR(args, '$.tokens_sold') AS BIGNUMERIC) / 1e6
                ELSE
                  CAST(JSON_EXTRACT_SCALAR(args, '$.tokens_sold') AS BIGNUMERIC) / 1e18
              END
            WHEN address = '0x383e6b4437b59fff47b619cba855ca29342a8559' THEN
              CAST(JSON_EXTRACT_SCALAR(args, '$.tokens_sold') AS BIGNUMERIC) / 1e6
            ELSE 0
          END
        ) AS total_volume_usd
      FROM \`${projectId}.pyusd_data.lp_activity_and_gas_latest\`
      WHERE event_type = 'Swap'
        AND DATE(TIMESTAMP_SECONDS(CAST(block_timestamp AS INT64))) >= DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)
      GROUP BY pool_address
`;

async function fetchBigQueryData() {
  try {
    console.log('Fetching BigQuery data...');
    const [timeOfDayRows] = await bigquery.query(timeOfDayQuery);
    const [gasFeeRows] = await bigquery.query(gasComparisonQuery);
    const [poolMetricsRows] = await bigquery.query(poolMetricsQuery);

    cachedData.timeOfDay = timeOfDayRows.map(row => ({
      event_date: row.event_date.value,
      hour_of_day: row.hour_of_day,
      avg_gas_fee_eth: parseFloat(row.avg_gas_fee_eth.toString()),
      transaction_count: row.transaction_count
    }));
    cachedData.gasFeeData = gasFeeRows;
    cachedData.poolMetricsData = poolMetricsRows;

    console.log('BigQuery data fetched successfully:', {
      timeOfDayRows: cachedData.timeOfDay.length,
      gasFeeRows: cachedData.gasFeeData.length,
      poolMetricsRows: cachedData.poolMetricsData.length,
    });
    console.log('Sample parsed timeOfDay:', cachedData.timeOfDay.slice(0, 5));
  } catch (error) {
    console.error('Error fetching BigQuery data:', error);
  }
}

// Initial fetch only
fetchBigQueryData();

// Subscribe to Firestore
const today = new Date().toISOString().split('T')[0];
const startOfDay = Math.floor(new Date(today).getTime() / 1000);
console.log('Connecting to Firestore for real-time updates from', today, 'at timestamp', startOfDay);
db.collection(collectionName)
  .where('block_timestamp', '>=', startOfDay)
  .onSnapshot((snapshot) => {
    console.log('Firestore connected and listening for updates');
    const realTimeData = snapshot.docs.map((doc) => doc.data());
    console.log('New Firestore data received:', realTimeData.length, 'documents');
    updateInsights(realTimeData);
  }, (error) => {
    console.error('Firestore connection error:', error);
  });

function updateInsights(realTimeData) {
  console.log('Calculating insights with real-time data...');
  
  // Fetch BigQuery data if Firestore is empty
  if (realTimeData.length === 0) {
    console.log('Firestore collection is empty, fetching fresh BigQuery data...');
    fetchBigQueryData();
  }

  const now = new Date();
  const oneHourAgo = Math.floor((Date.now() - 60 * 60 * 1000) / 1000);
  const currentDate = now.toISOString().split('T')[0];
  const currentHour = now.getUTCHours();
  
  const recentBigQueryTx = cachedData.gasFeeData
  .filter((d) => {
    const rowDate = d.event_date;
    const rowHour = d.hour_of_day;
    return rowDate === currentDate && rowHour === currentHour;
  })
  .reduce((sum, d) => sum + d.transaction_count, 0);

  const recentFirestoreTx = realTimeData.filter((d) => d.block_timestamp >= oneHourAgo).length;
  cachedData.txPerHour = recentBigQueryTx + recentFirestoreTx;

  const insights = generateInsights(cachedData, realTimeData);
  console.log('Insights calculated:', insights);
  broadcastInsights(insights);
}

function generateInsights(cachedData, realTimeData) {
  console.log('Starting generateInsights with cachedData:', {
    timeOfDayLength: cachedData.timeOfDay.length,
    gasFeeDataLength: cachedData.gasFeeData.length,
    poolMetricsDataLength: cachedData.poolMetricsData.length,
  });
  console.log('realTimeData length:', realTimeData.length);

  // --- Time-of-Day Suggestions ---
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const sevenDaysAgo = new Date((nowInSeconds - 7 * 24 * 60 * 60) * 1000);
  sevenDaysAgo.setUTCHours(0, 0, 0, 0);

  // Convert Firestore realTimeData to match timeOfDay schema
  const firestoreTimeOfDay = realTimeData.map(doc => ({
    event_date: new Date(doc.block_timestamp * 1000).toISOString().split('T')[0],
    hour_of_day: new Date(doc.block_timestamp * 1000).getUTCHours(),
    avg_gas_fee_eth: doc.gas_used * doc.gas_price / 1e18, // Per-transaction fee
    transaction_count: 1
  }));

  // Combine BigQuery and Firestore data, filter to 7 days
  const combinedTimeOfDay = [...cachedData.timeOfDay, ...firestoreTimeOfDay]
    .filter(d => new Date(d.event_date + 'T00:00:00Z') >= sevenDaysAgo);

  const sevenDayWindow = combinedTimeOfDay.reduce((acc, d) => {
    const hour = d.hour_of_day;
    acc[hour] = acc[hour] || { total: 0, count: 0 };
    acc[hour].total += d.avg_gas_fee_eth * d.transaction_count;
    acc[hour].count += d.transaction_count;
    acc.total += d.avg_gas_fee_eth * d.transaction_count;
    acc.count += d.transaction_count;
    return acc;
  }, { total: 0, count: 0 });

  const overallAvg = sevenDayWindow.count > 0 ? sevenDayWindow.total / sevenDayWindow.count : 0.005;
  const sevenDayAvg = {};
  for (let hour = 0; hour < 24; hour++) {
    sevenDayAvg[hour] = sevenDayWindow[hour] && sevenDayWindow[hour].count > 0
      ? sevenDayWindow[hour].total / sevenDayWindow[hour].count
      : overallAvg;
  }
  // console.log('7-day avg gas fees per hour (blended):', sevenDayAvg);

  const currentHour = new Date().getUTCHours();
  const currentFee = sevenDayAvg[currentHour] || overallAvg;
  const predictions = {};
  for (let i = 1; i <= 3; i++) {
    const hour = (currentHour + i) % 24;
    predictions[hour] = sevenDayAvg[hour];
  }

  const nextBest = Object.entries(predictions).reduce((best, [hour, fee]) =>
    fee < best.fee ? { hour: parseInt(hour), fee } : best,
    { hour: currentHour + 1, fee: predictions[currentHour + 1] }
  );
  const savings = currentFee - nextBest.fee > 0.00002 ? (currentFee - nextBest.fee).toFixed(5) : 0;
  const timeSuggestion = savings > 0
    ? `Wait until ${nextBest.hour}:00 UTC for lower fees (predicted: ${nextBest.fee.toFixed(5)} ETH)`
    : 'Good time to send now!';
  const timeSavings = savings > 0 ? `Waiting could save ~${savings} ETH` : 'No savings by waiting';
  const timePrediction = `Next 3 hours: ${Object.entries(predictions)
    .map(([h, f]) => `${h}:00=${f.toFixed(5)} ETH`)
    .join(', ')}`;

// --- Gas Fee Trends ---
const oneHourAgo = nowInSeconds - 60 * 60;
const thirtyMinsAgo = nowInSeconds - 30 * 60;
const lastHourFees = realTimeData
  .filter((d) => d.block_timestamp >= oneHourAgo && d.gas_used > 0 && d.gas_price > 0)
  .map((d) => ({
    fee: d.gas_used * d.gas_price / 1e18,
    timestamp: d.block_timestamp
  }))
  .sort((a, b) => a.timestamp - b.timestamp)
  .map((d) => d.fee);
// console.log('lastHourFees (sorted, non-zero):', lastHourFees);

const avgLastHour = lastHourFees.length > 0 
  ? lastHourFees.reduce((sum, fee) => sum + fee, 0) / lastHourFees.length 
  : 0.005;

const earlyHourFees = realTimeData
  .filter((d) => d.block_timestamp >= oneHourAgo && d.block_timestamp < thirtyMinsAgo && d.gas_used > 0 && d.gas_price > 0)
  .map((d) => d.gas_used * d.gas_price / 1e18);
// console.log('earlyHourFees:', earlyHourFees);
const earliestLastHour = earlyHourFees.length > 0 
  ? earlyHourFees.reduce((sum, fee) => sum + fee, 0) / earlyHourFees.length 
  : avgLastHour;

const percentChange = earliestLastHour > 0 
  ? Math.min(((avgLastHour - earliestLastHour) / earliestLastHour * 100).toFixed(1), 1000)
  : 0;
const gasTrendDirection = percentChange < 0 ? 'dropped' : percentChange > 0 ? 'risen' : 'stable';
const gasTrend = lastHourFees.length > 0
  ? `Gas fees have ${gasTrendDirection} ${Math.abs(percentChange)}% in the last hour`
  : 'Insufficient data for gas trend';

  // --- Gas Historical Context ---
  const historicalHourAvg = sevenDayAvg[currentHour] || 0.005;
  const historicalComparison = avgLastHour > 0
    ? ((avgLastHour - historicalHourAvg) / historicalHourAvg * 100).toFixed(1)
    : 0;
  const gasHistorical = avgLastHour > 0
    ? `Current fees are ${historicalComparison > 0 ? `${historicalComparison}% above` : `${Math.abs(historicalComparison)}% below`} the 7-day average for ${currentHour}:00 UTC`
    : 'Not enough data for historical comparison';

  // --- Best Pool Selection ---
// Pool address to name mapping
const poolNames = {
  '0x625e92624bc2d88619accc1788365a69767f6200': 'Curve py/crv Pool',
  '0x383e6b4437b59fff47b619cba855ca29342a8559': 'Curve PayPool'
};

const truncateAddress = (address) => {
  if (!address || address === 'N/A') return 'N/A';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

// Calculate today's best pool
const todayPoolFees = realTimeData
  .filter((d) => d.event_type === 'Swap' && d.block_timestamp >= oneHourAgo)
  .reduce((acc, d) => {
    const pool = d.address || 'unknown';
    acc[pool] = acc[pool] || { totalFee: 0, count: 0 };
    acc[pool].totalFee += d.gas_used * d.gas_price / 1e18;
    acc[pool].count += 1;
    return acc;
  }, {});

// Default to a known pool if no swaps today
const defaultPool = '0x383e6b4437b59fff47b619cba855ca29342a8559'; // Uniswap as fallback
const todayBestPool = Object.entries(todayPoolFees)
  .reduce((best, [pool, data]) => {
    const avgFee = data.totalFee / data.count;
    return avgFee < best.fee ? { pool, fee: avgFee } : best;
  }, { pool: defaultPool, fee: Infinity });

// Format pool_best with only today's best
const todayTruncated = truncateAddress(todayBestPool.pool);
const todayName = poolNames[todayBestPool.pool] || 'Unknown Pool';
const poolBest = `${todayTruncated} (${todayName})`;

 // --- Network Congestion ---
 const txPerHour = cachedData.txPerHour;
 const congestionThreshold = 250;
 const txCongestion = txPerHour > congestionThreshold 
   ? `Network is congested (${txPerHour} tx/hr); consider delaying` 
   : `Network is stable (${txPerHour} tx/hr)`;

  // --- Volume Predictions ---
  const busiestHours = combinedTimeOfDay
    .reduce((acc, d) => {
      acc[d.hour_of_day] = (acc[d.hour_of_day] || 0) + d.transaction_count;
      return acc;
    }, {});
  const topBusyHours = Object.entries(busiestHours)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 2)
    .map(([hour]) => parseInt(hour));
  const volumePrediction = topBusyHours.length >= 2
    ? `Expect high volume from ${topBusyHours[0]}:00-${(topBusyHours[1] + 1) % 24}:00 UTC`
    : 'Not enough data to predict busy times';

  return {
    time_suggestion: timeSuggestion,
    time_savings: timeSavings,
    time_prediction: timePrediction,
    gas_trend: gasTrend,
    gas_historical: gasHistorical,
    pool_best: poolBest,
    tx_congestion: txCongestion,
    tx_volume_prediction: volumePrediction,
  };
}
function broadcastInsights(insights) {
  console.log('Broadcasting insights to', clients.size, 'clients');
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(insights));
    }
  });
}

// WebSocket connection with token authentication
wss.on('connection', (ws, req) => {
  const urlParams = new URLSearchParams(req.url.split('?')[1]);
  const token = urlParams.get('token');
  if (token !== REQUIRED_TOKEN) {
    console.log('Client connection rejected: Invalid token', token);
    ws.send(JSON.stringify({ error: 'Invalid token' }));
    ws.close();
    return;
  }
  console.log('New client connected with token:', token);
  clients.add(ws);
  ws.on('close', () => {
    console.log('Client disconnected. Remaining clients:', clients.size);
    clients.delete(ws);
  });
});

server.listen(8080, () => console.log('Server running on port 8080'));
