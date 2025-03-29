import { BigQuery } from '@google-cloud/bigquery';
import { NextRequest, NextResponse } from 'next/server';

const bigquery = new BigQuery({
  projectId: 'mirax-beta',
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address');

  if (!address) {
    return NextResponse.json({ transactionData: [], gasData: [] }, { status: 400 });
  }

  // Get the latest timestamp
  const latestQuery = `
    SELECT MAX(timestamp) AS latest_timestamp
    FROM \`mirax-beta.pyusd_data.transfer_logs\`
  `;
  const [latestRows] = await bigquery.query({ query: latestQuery });
  const latestTimestamp = latestRows[0]?.latest_timestamp || Date.now();
  const endDate = new Date(latestTimestamp);
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - 7); // 6 days back + endDate = 7 days

  // Generate 7-day range including endDate
  const dates = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  const txCountByDay = dates.map(date => ({ date, transactions: 0 }));
  const gasByDay = dates.map(date => ({ date, gas: '0.000' }));

  // Query transactions
  const query = `
    SELECT 
      TIMESTAMP_MILLIS(CAST(timestamp AS INT64)) AS timestamp,
      sender,
      receiver
    FROM \`mirax-beta.pyusd_data.transfer_logs\`
    WHERE 
      (sender = LOWER(@address) OR receiver = LOWER(@address))
      AND timestamp >= @startTime
      AND timestamp <= @endTime
  `;
  const options = {
    query,
    params: {
      address: address.toLowerCase(),
      startTime: startDate.getTime(),
      endTime: endDate.getTime(),
    },
  };

  const [rows] = await bigquery.query(options);

//   console.log('Dates:', dates);
//   console.log('Rows:', rows);

  for (const row of rows) {
    const txDate = new Date(row.timestamp.value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const dayIndex = dates.indexOf(txDate);
    console.log(`Row date: ${txDate}, Index: ${dayIndex}`);
    if (dayIndex !== -1) {
      txCountByDay[dayIndex].transactions++;
    }
  }

//   console.log('Transaction Data:', txCountByDay);
  return NextResponse.json({ transactionData: txCountByDay, gasData: gasByDay });
}