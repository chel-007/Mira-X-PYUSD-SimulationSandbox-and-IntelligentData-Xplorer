// app/api/bigQueryTransactions/route.ts
import { BigQuery } from "@google-cloud/bigquery";
import { NextResponse } from "next/server";

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

export async function GET() {
  try {
    const dailyQuery = `
      #standardSQL
      SELECT DATE(TIMESTAMP_MILLIS(timestamp)) AS date, SUM(CAST(value AS FLOAT64)) AS value
      FROM \`${projectId}.pyusd_data.transfer_logs_\`
      WHERE TIMESTAMP_MILLIS(timestamp) >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
      GROUP BY date
      ORDER BY date
    `;
    const monthlyQuery = `
      #standardSQL
      SELECT FORMAT_TIMESTAMP('%Y-%m', TIMESTAMP_MILLIS(timestamp)) AS date, SUM(CAST(value AS FLOAT64)) AS value
      FROM \`${projectId}.pyusd_data.transfer_logs_\`
      GROUP BY date
      ORDER BY date
    `;

    const dailyWalletGrowthQuery = `
    SELECT 
      DATE(TIMESTAMP_MILLIS(first_tx)) AS date,
      COUNT(DISTINCT new_wallet) AS new_wallets,
      ARRAY_AGG(DISTINCT new_wallet) AS wallets
    FROM (
      SELECT MIN(timestamp) AS first_tx, wallet AS new_wallet
      FROM (
        SELECT timestamp, sender AS wallet FROM \`${projectId}.pyusd_data.transfer_logs_\`
        UNION ALL
        SELECT timestamp, receiver AS wallet FROM \`${projectId}.pyusd_data.transfer_logs_\`
      )
      GROUP BY wallet
    )
    GROUP BY date
    ORDER BY date
  `;

    const hourlyVelocityQuery = `
      SELECT 
      tx_hash,
      timestamp
    FROM \`${projectId}.pyusd_data.transfer_logs_\`
    WHERE timestamp >= UNIX_MILLIS(TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR))
    ORDER BY timestamp DESC
    `;

    const activeWalletsQuery = `
      SELECT ARRAY_AGG(DISTINCT wallet) AS active_wallets
      FROM (
        SELECT sender AS wallet FROM \`${projectId}.pyusd_data.transfer_logs_\`
        WHERE TIMESTAMP_MILLIS(timestamp) >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
        UNION ALL
        SELECT receiver AS wallet FROM \`${projectId}.pyusd_data.transfer_logs_\`
        WHERE TIMESTAMP_MILLIS(timestamp) >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
      )
    `;
    const totalWalletsQuery = `
      SELECT COUNT(DISTINCT wallet) AS total_wallets
      FROM (
        SELECT sender AS wallet FROM \`${projectId}.pyusd_data.transfer_logs_\`
        UNION ALL
        SELECT receiver AS wallet FROM \`${projectId}.pyusd_data.transfer_logs_\`
      )
    `;
    
    // New LP queries
    const swapVolumeQuery = `
      SELECT
        address AS pool_address,
        DATE(TIMESTAMP_SECONDS(CAST(block_timestamp AS INT64))) AS date,
        SUM(
          CASE
            WHEN address = '0x625e92624bc2d88619accc1788365a69767f6200' THEN
              CASE
                WHEN CAST(JSON_EXTRACT_SCALAR(args, '$.sold_id') AS INT64) = 0 THEN
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
        AND DATE(TIMESTAMP_SECONDS(CAST(block_timestamp AS INT64))) >= DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH)
      GROUP BY pool_address, date
      ORDER BY date, pool_address
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

    const gasComparisonQuery = `
    SELECT
      DATE(TIMESTAMP_SECONDS(CAST(block_timestamp AS INT64))) AS event_date,
      event_type,
      AVG(CAST(gas_used AS INT64) * CAST(gas_price AS BIGNUMERIC) / 1e18) AS avg_gas_fee_eth,
      COUNT(tx_hash) AS transaction_count,
      ARRAY_AGG(tx_hash) AS tx_hash
    FROM \`${projectId}.pyusd_data.lp_activity_and_gas_latest\`
    WHERE event_type IN ('Transfer', 'Swap')
      AND DATE(TIMESTAMP_SECONDS(CAST(block_timestamp AS INT64))) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)

    GROUP BY event_date, event_type
    ORDER BY event_date, event_type
  `;

  // AND DATE(TIMESTAMP_SECONDS(CAST(block_timestamp AS INT64))) < CURRENT_DATE()

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
    `

    // AND DATE(TIMESTAMP_SECONDS(CAST(block_timestamp AS INT64))) < CURRENT_DATE()
    // const gasFeeVolatilityQuery = `
    // SELECT
    //   DATE(TIMESTAMP_SECONDS(CAST(block_timestamp AS INT64))) AS event_date,
    //   event_type,
    //   STDDEV(CAST(gas_used AS INT64) * CAST(gas_price AS BIGNUMERIC) / 1e18) AS gas_fee_volatility_eth,
    //   COUNT(*) AS transaction_count
    // FROM \`${bigquery.projectId}.pyusd_data.lp_activity_and_gas\`
    // WHERE event_type IN ('Transfer', 'Swap')
    //   AND DATE(TIMESTAMP_SECONDS(CAST(block_timestamp AS INT64))) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
    // GROUP BY event_date, event_type
    // ORDER BY event_date, event_type
    // `

    const [
      [dailyRows], // Extract the first element (rows) of the tuple
      [monthlyRows],
      [dailyWalletGrowthRows],
      [hourlyVelocityRows],
      [activeRows],
      [totalRows],
      [swapVolumeRows],
      [poolMetricsRows],
      [gasComparisonRows],
      [timeOfDayRows],
      // [gasFeeVolatilityRows]
    ] = await Promise.all([
      bigquery.query({ query: dailyQuery }),
      bigquery.query({ query: monthlyQuery }),
      bigquery.query({ query: dailyWalletGrowthQuery }),
      bigquery.query({ query: hourlyVelocityQuery }),
      bigquery.query({ query: activeWalletsQuery }),
      bigquery.query({ query: totalWalletsQuery }),
      bigquery.query({ query: swapVolumeQuery }),
      bigquery.query({ query: poolMetricsQuery }),
      bigquery.query({ query: gasComparisonQuery }),
      bigquery.query({ query: timeOfDayQuery }),
      // bigquery.query({ query: gasFeeVolatilityQuery}),
    ]);

    const dailyData = dailyRows.map(row => ({
      date: row.date.value, // Extract string from BigQueryDate
      value: Number(row.value.toFixed(2)),
    }));
    const monthlyData = monthlyRows.map(row => ({
      date: row.date,
      value: Number(row.value.toFixed(2)),
    }));
    const dailyWalletGrowth = dailyWalletGrowthRows.map(row => ({
      date: row.date.value,
      newWallets: row.new_wallets,
      wallets: row.wallets,
    }));
    // const hourlyVelocity = hourlyVelocityRows.map(row => ({
    //   hour: row.hour.value,
    //   txPerHour: row.tx_count,
    // }));

    const hourlyVelocity = hourlyVelocityRows.map(row => ({
    txHash: row.tx_hash,
    timestamp: row.timestamp
    }));

    const activeWallets = activeRows[0].active_wallets;
    const totalWallets = totalRows[0].total_wallets;
    // const dormantWallets = totalWallets - activeWallets;

    // Process LP data
    const swapVolumeData = swapVolumeRows.map(row => ({
      pool_address: row.pool_address,
      date: row.date.value,
      total_volume_usd: Number(Number(row.total_volume_usd).toFixed(2)),
    }));

    const poolMetricsData = poolMetricsRows.map(row => ({
      pool_address: row.pool_address,
      avg_gas_fee_eth: Number(row.avg_gas_fee_eth.toFixed(6)),
      median_gas_fee_eth: Number(row.median_gas_fee_eth.toFixed(6)),
      swap_count: Number(row.swap_count),
      total_volume_usd: Number(row.total_volume_usd.toFixed(2)),
    }));

    const gasComparisonData = gasComparisonRows.map(row => ({
      event_date: row.event_date.value,
      event_type: row.event_type,
      avg_gas_fee_eth: parseFloat(row.avg_gas_fee_eth),
      transaction_count: parseInt(row.transaction_count),
      tx_hash: row.tx_hash,
    }));

    const timeOfDayData = timeOfDayRows.map(row => ({
      event_date: row.event_date.value,
      hour_of_day: parseInt(row.hour_of_day),
      avg_gas_fee_eth: parseFloat(row.avg_gas_fee_eth),
      transaction_count: parseInt(row.transaction_count),
    }));

    // const gasFeeVolatilityData = gasFeeVolatilityRows.map(row => ({
    //   event_date: row.event_date.value,
    //   event_type: row.event_type,
    //   gas_fee_volatility_eth: parseFloat(row.gas_fee_volatility_eth),
    //   transaction_count: parseInt(row.transaction_count),
    // }));

    console.log(swapVolumeData)
    console.log(hourlyVelocity)
    // console.log("gas", gasComparisonData)
    console.log(poolMetricsData)

    return NextResponse.json({
      dailyData,
      monthlyData,
      dailyWalletGrowth,
      activeWallets,
      totalWallets,
      hourlyVelocity,
      swapVolumeData,
      poolMetricsData,
      gasComparisonData,
      timeOfDayData,
      // gasFeeVolatilityData
    });

    
  } catch (error) {
    console.error("BigQuery error:", error);
    return NextResponse.json({ error: "Failed to fetch BigQuery data" }, { status: 500 });
  }
}


// SELECT 
// DATE(TIMESTAMP_MILLIS(first_tx)) AS date,
// COUNT(DISTINCT new_wallet) AS new_wallets
// FROM (
// SELECT MIN(timestamp) AS first_tx, sender AS new_wallet
// FROM \`${bigquery.projectId}.pyusd_data.transfer_logs\`
// GROUP BY sender
// UNION ALL
// SELECT MIN(timestamp) AS first_tx, receiver AS new_wallet
// FROM \`${bigquery.projectId}.pyusd_data.transfer_logs\`
// GROUP BY receiver
// )
// GROUP BY date
// ORDER BY date


// const failedTxQuery = `
// SELECT
//   DATE(TIMESTAMP_SECONDS(CAST(block_timestamp AS INT64))) AS event_date,
//   event_type,
//   COUNT(*) AS failed_count,
//   SUM(CAST(gas_used AS INT64) * CAST(gas_price AS BIGNUMERIC) / 1e18) AS total_gas_fee_eth,
//   ARRAY_AGG(tx_hash LIMIT 10) AS sample_tx_hashes
// FROM \`${bigquery.projectId}.pyusd_data.lp_activity_and_gas\`
// WHERE status = 0
//   AND event_type IN ('Transfer', 'Swap')
//   AND DATE(TIMESTAMP_SECONDS(CAST(block_timestamp AS INT64))) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
// GROUP BY event_date, event_type
// ORDER BY event_date, event_type
// `;