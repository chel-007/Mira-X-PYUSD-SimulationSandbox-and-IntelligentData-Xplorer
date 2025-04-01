import requests
import time
from google.cloud import bigquery
from google.cloud.exceptions import NotFound
import os

# GCP RPC Endpoint (replace with your actual URL)
GCP_RPC_URL = ""

# PYUSD Contract Address
PYUSD_ADDRESS = "0x6c3ea9036406852006290770bedfcaba0e23a0e8"

# BigQuery Setup
PROJECT_ID = "mirax-beta"
DATASET_ID = ""
TABLE_ID = ""
client = bigquery.Client(project=PROJECT_ID)

# Define start & end blocks (PYUSD launch ~ Aug 2023 to now)
START_BLOCK = 22101538  # Approx launch block
END_BLOCK = 22130335    # Current block as of Mar 2025 (adjust)
MAX_BLOCK_RANGE = 5

# Schema for BigQuery table
schema = [
    bigquery.SchemaField("tx_hash", "STRING"),
    bigquery.SchemaField("sender", "STRING"),
    bigquery.SchemaField("receiver", "STRING"),
    bigquery.SchemaField("value", "STRING"),  # Keep as string for precision
    bigquery.SchemaField("block_number", "INTEGER"),
    bigquery.SchemaField("timestamp", "INTEGER"),  # Milliseconds
]

# Create dataset and table if not exists
dataset_ref = client.dataset(DATASET_ID)
try:
    client.get_dataset(dataset_ref)
except NotFound:
    dataset = bigquery.Dataset(dataset_ref)
    client.create_dataset(dataset)
table_ref = dataset_ref.table(TABLE_ID)
try:
    client.get_table(table_ref)
except NotFound:
    table = bigquery.Table(table_ref, schema=schema)
    client.create_table(table)

# Fetch and store logs
all_logs = []
current_block = START_BLOCK

# ... imports and setup ...

while current_block <= END_BLOCK:
    batch_end_block = min(current_block + MAX_BLOCK_RANGE - 1, END_BLOCK)
    print(f"Fetching logs from block {current_block} to {batch_end_block}...")

    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "eth_getLogs",
        "params": [{"fromBlock": hex(current_block), "toBlock": hex(batch_end_block), "address": PYUSD_ADDRESS, "topics": ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"]}]
    }

    try:
        response = requests.post(GCP_RPC_URL, json=payload)
        data_size = len(response.content) / 1024  # KB
        print(f"📡 eth_getLogs response size: {data_size:.2f} KB")
        data = response.json()

        if "result" in data:
            logs = data["result"]
            print(f"✅ Fetched {len(logs)} logs")

            rows_to_insert = []
            for log in logs:
                block_number = int(log["blockNumber"], 16)
                block_payload = {"jsonrpc": "2.0", "id": 2, "method": "eth_getBlockByNumber", "params": [hex(block_number), False]}
                block_response = requests.post(GCP_RPC_URL, json=block_payload)
                block_size = len(block_response.content) / 1024  # KB
                print(f"📡 eth_getBlockByNumber size: {block_size:.2f} KB")
                timestamp = int(block_response.json()["result"]["timestamp"], 16) * 1000

                raw_value = int(log["data"], 16)
                adjusted_value = raw_value / 10**6
                value_str = f"{adjusted_value:.6f}"

                row = {"tx_hash": log["transactionHash"], "sender": "0x" + log["topics"][1][-40:], "receiver": "0x" + log["topics"][2][-40:], "value": value_str, "block_number": block_number, "timestamp": timestamp}
                rows_to_insert.append(row)

            if rows_to_insert:
                errors = client.insert_rows_json(table_ref, rows_to_insert)
                insert_size = len(str(rows_to_insert).encode('utf-8')) / 1024  # KB
                print(f"📡 BigQuery insert size: {insert_size:.2f} KB")
                if not errors:
                    print(f"✅ Inserted {len(rows_to_insert)} rows into BigQuery")
                else:
                    print(f"⚠️ Insert errors: {errors}")
            all_logs.extend(rows_to_insert)
        else:
            print(f"⚠️ Error fetching logs: {data}")

    except Exception as e:
        print(f"❌ Request failed: {e}")

    current_block = batch_end_block + 1
    time.sleep(0.03)

total_data = sum(len(str(log).encode('utf-8')) for log in all_logs) / (1024 * 1024)  # MB
print(f"\n🔥 Total logs fetched: {len(all_logs)} | Total data: {total_data:.2f} MB")


# SELECT
#   e.block_number,
#   UNIX_SECONDS(e.block_timestamp) AS block_timestamp,
#   e.transaction_hash AS tx_hash,
#   e.log_index,
#   e.address,
#   e.event_signature,
#   e.topics,
#   e.args,
#   t.from_address,
#   t.to_address,
#   t.input,
#   t.gas_price,
#   r.gas_used,
#   r.status,
#   CASE
#     WHEN e.address = '0x6c3ea9036406852006290770bedfcaba0e23a0e8'
#          AND e.event_signature = 'Transfer(address,address,uint256)'
#          AND SUBSTR(t.input, 0, 10) = '0xa9059cbb' THEN 'Transfer'
#     WHEN e.address IN (
#            '0xDd2e0D86A45e4EF9bd490c2809E6405720cC357c',
#            '0x383E6b4437b59fff47B619CBA855CA29342A8559',
#            '0x625E92624Bc2D88619ACCc1788365A69767f6200'
#          )
#          AND e.event_signature IN (
#              'Swap(address,address,int256,int256,uint160,uint128,int24)',
#              'TokenExchange(address,int128,uint256,int128,uint256)'
#          ) THEN 'Swap'
#     ELSE 'Other'
#   END AS event_type
# FROM `bigquery-public-data.goog_blockchain_ethereum_mainnet_us.decoded_events` e
# JOIN `bigquery-public-data.goog_blockchain_ethereum_mainnet_us.transactions` t
#   ON e.transaction_hash = t.transaction_hash
# JOIN `bigquery-public-data.goog_blockchain_ethereum_mainnet_us.receipts` r
#   ON e.transaction_hash = r.transaction_hash
# WHERE e.block_timestamp >= TIMESTAMP(DATE_SUB(DATE(CURRENT_TIMESTAMP()), INTERVAL 3 MONTH))
#   AND t.block_timestamp >= TIMESTAMP(DATE_SUB(DATE(CURRENT_TIMESTAMP()), INTERVAL 3 MONTH))
#   AND r.block_timestamp >= TIMESTAMP(DATE_SUB(DATE(CURRENT_TIMESTAMP()), INTERVAL 3 MONTH))
#   AND (
#     (e.address = '0x6c3ea9036406852006290770bedfcaba0e23a0e8'
#      AND e.event_signature = 'Transfer(address,address,uint256)')
#     OR
#     (e.address IN (
#        '0xDd2e0D86A45e4EF9bd490c2809E6405720cC357c',
#        '0x383E6b4437b59fff47B619CBA855CA29342A8559',
#        '0x625E92624Bc2D88619ACCc1788365A69767f6200'
#      )
#      AND e.event_signature IN (
#          'Swap(address,address,int256,int256,uint160,uint128,int24)',
#          'TokenExchange(address,int128,uint256,int128,uint256)'
#      ))
#   )


# [{
#   "event_signature": "Approval(address,address,uint256)"
# }, {
#   "event_signature": "Transfer(address,address,uint256)"
# }, {
#   "event_signature": "Mint(address,address,int24,int24,uint128,uint256,uint256)"
# }, {
#   "event_signature": "Burn(address,int24,int24,uint128,uint256,uint256)"
# }, {
#   "event_signature": "Collect(address,address,int24,int24,uint128,uint128)"
# }, {
#   "event_signature": "Swap(address,address,int256,int256,uint160,uint128,int24)"
# }]


# [{
#   "event_signature": "Approval(address,address,uint256)"
# }, {
#   "event_signature": "Transfer(address,address,uint256)"
# }]

# SELECT DISTINCT topics
# FROM `bigquery-public-data.goog_blockchain_ethereum_mainnet_us.decoded_events`
# WHERE LOWER(address) IN (
#   '0x383e6b4437b59fff47b619cba855ca29342a8559',
#   '0x625e92624bc2d88619accc1788365a69767f6200'
# )
# AND block_timestamp >= TIMESTAMP(DATE_SUB(DATE(CURRENT_TIMESTAMP()), INTERVAL 3 MONTH))
# LIMIT 100