from google.cloud import bigquery

client = bigquery.Client(project="pyusd-sandbox")
query = """
SELECT
  transaction_hash AS tx_hash,
  '0x' || SUBSTR(topics[SAFE_OFFSET(1)], -40) AS sender,
  '0x' || SUBSTR(topics[SAFE_OFFSET(2)], -40) AS receiver,
  FORMAT('%.6f', SAFE_CAST(CAST('0x' || SUBSTR(data, 3) AS INT64) AS FLOAT64) / 1e6) AS value,
  block_number,
  UNIX_MILLIS(block_timestamp) AS timestamp  -- Integer milliseconds
FROM `bigquery-public-data.goog_blockchain_ethereum_mainnet_us.logs`
WHERE
  address = '0x6c3ea9036406852006290770bedfcaba0e23a0e8'
  AND topics[SAFE_OFFSET(0)] = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
  AND block_number BETWEEN 18920525 AND 22001511  -- Update to your cutoff
ORDER BY block_number
"""
job = client.query(query)
df = job.to_dataframe()

table_ref = client.dataset("pyusd_data").table("transfer_logs")
job_config = bigquery.LoadJobConfig(
    write_disposition="WRITE_TRUNCATE",  # Overwrites existing rows
    schema=[
        bigquery.SchemaField("tx_hash", "STRING"),
        bigquery.SchemaField("sender", "STRING"),
        bigquery.SchemaField("receiver", "STRING"),
        bigquery.SchemaField("value", "STRING"),
        bigquery.SchemaField("block_number", "INTEGER"),
        bigquery.SchemaField("timestamp", "INTEGER"),
    ]
)
job = client.load_table_from_dataframe(df, table_ref, job_config=job_config)
job.result()
print(f"Backfilled {job.output_rows} rows to transfer_logs")