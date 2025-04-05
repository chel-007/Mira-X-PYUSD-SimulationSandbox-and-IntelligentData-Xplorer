import { BigQuery } from '@google-cloud/bigquery';
import { NextRequest, NextResponse } from 'next/server';

const projectId = process.env.BIGQUERY_PROJECT_ID;
let credentials;

try {
  credentials = process.env.BIGQUERY_CREDENTIALS
    ? JSON.parse(process.env.BIGQUERY_CREDENTIALS)
    : undefined;
} catch (error) {
  console.error('Error parsing BIGQUERY_CREDENTIALS:', error);
  throw new Error('Invalid BIGQUERY_CREDENTIALS in environment variables');
}

if (!projectId) {
  throw new Error('BIGQUERY_PROJECT_ID is not set in environment variables');
}

const bigquery = new BigQuery({
  projectId: projectId,
  credentials: credentials,
  location: "US",
});


export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address');

  if (!address) {
    return NextResponse.json({ transactionData: [], gasData: [] }, { status: 400 });
  }

  const latestQueryTx = `
    SELECT MAX(timestamp) AS latest_timestamp
    FROM \`${projectId}.pyusd_data.transfer_logs_\`
  `;
  const latestQueryGas = `
    SELECT MAX(block_timestamp) AS latest_timestamp
    FROM \`${projectId}.pyusd_data.lp_activity_and_gas\`
  `;
  const [[txLatest], [gasLatest]] = await Promise.all([
    bigquery.query({ query: latestQueryTx }),
    bigquery.query({ query: latestQueryGas }),
  ]);
  const latestTxMs = txLatest[0]?.latest_timestamp || Date.now();
  const latestGasSec = gasLatest[0]?.latest_timestamp || Math.floor(Date.now() / 1000);
  const latestTimestampMs = Math.max(latestTxMs, latestGasSec * 1000); // Use latest from either table

  const endDate = new Date(latestTimestampMs);
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - 6); // 7-day range

  // Generate 7-day range
  const dates = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  const txCountByDay = dates.map(date => ({ date, transactions: 0 }));
  const gasByDay = dates.map(date => ({ date, gas: '0.000' }));

  // Transaction query (milliseconds)
  const txQuery = `
    SELECT 
      TIMESTAMP_MILLIS(CAST(timestamp AS INT64)) AS timestamp,
      sender,
      receiver
    FROM \`${projectId}.pyusd_data.transfer_logs_\`
    WHERE 
      (sender = LOWER(@address) OR receiver = LOWER(@address))
      AND timestamp >= @startTime
      AND timestamp <= @endTime
  `;
  const txOptions = {
    query: txQuery,
    params: {
      address: address.toLowerCase(),
      startTime: startDate.getTime(),
      endTime: endDate.getTime(),
    },
  };

  // Gas query (seconds)
  const gasQuery = `
  SELECT 
    DATE(TIMESTAMP_SECONDS(block_timestamp)) AS tx_date,
    SUM(gas_used * gas_price / 1e18) AS total_gas_eth
  FROM \`${projectId}.pyusd_data.lp_activity_and_gas\`
  WHERE 
    block_timestamp BETWEEN @startTime AND @endTime
    AND (
      from_address = LOWER(@address)
      OR to_address = LOWER(@address)
      OR TO_JSON_STRING(args) LIKE CONCAT('%', LOWER(@address), '%')
    )
  GROUP BY tx_date
`;
const gasOptions = {
  query: gasQuery,
  params: {
    address: address.toLowerCase(),
    startTime: Math.floor(startDate.getTime() / 1000),
    endTime: Math.floor(endDate.getTime() / 1000),
  },
};

  const [txRows, gasRows] = await Promise.all([
    bigquery.query(txOptions),
    bigquery.query(gasOptions),
  ]);

  // Process transaction rows
  for (const row of txRows[0]) {
    const txDate = new Date(row.timestamp.value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const dayIndex = dates.indexOf(txDate);
    if (dayIndex !== -1) {
      txCountByDay[dayIndex].transactions++;
    }
  }

  // Process gas rows
for (const row of gasRows[0]) {
    const txDate = new Date(row.tx_date.value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const dayIndex = dates.indexOf(txDate);
    if (dayIndex !== -1) {
      const gasEth = row.total_gas_eth || 0;
      gasByDay[dayIndex].gas = gasEth.toFixed(3); // 3 decimals for ETH precision
    }
  }

  // console.log('Start (ms):', startDate.getTime(), 'End (ms):', endDate.getTime());
  // console.log('Start (s):', Math.floor(startDate.getTime() / 1000), 'End (s):', Math.floor(endDate.getTime() / 1000));
  // console.log('Transaction Rows:', txRows[0]);
  // console.log('Gas Rows:', gasRows[0]);
  // console.log('Transaction Data:', txCountByDay);
  // console.log('Gas Data:', gasByDay);

  return NextResponse.json({ transactionData: txCountByDay, gasData: gasByDay });
}