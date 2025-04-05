import requests
import time
from google.cloud import bigquery
from google.cloud.exceptions import NotFound
import os

GCP_RPC_URL = ""

PYUSD_ADDRESS = "0x6c3ea9036406852006290770bedfcaba0e23a0e8"

PROJECT_ID = "mirax-beta"
DATASET_ID = ""
TABLE_ID = ""
client = bigquery.Client(project=PROJECT_ID)

START_BLOCK = 22101538
END_BLOCK = 22130335
MAX_BLOCK_RANGE = 5

# Schema for BigQuery table
schema = [
    bigquery.SchemaField("tx_hash", "STRING"),
    bigquery.SchemaField("sender", "STRING"),
    bigquery.SchemaField("receiver", "STRING"),
    bigquery.SchemaField("value", "STRING"),
    bigquery.SchemaField("block_number", "INTEGER"),
    bigquery.SchemaField("timestamp", "INTEGER"),
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
            print(f"Fetched {len(logs)} logs")

            rows_to_insert = []
            for log in logs:
                block_number = int(log["blockNumber"], 16)
                block_payload = {"jsonrpc": "2.0", "id": 2, "method": "eth_getBlockByNumber", "params": [hex(block_number), False]}
                block_response = requests.post(GCP_RPC_URL, json=block_payload)
                block_size = len(block_response.content) / 1024  # KB
                print(f"eth_getBlockByNumber size: {block_size:.2f} KB")
                timestamp = int(block_response.json()["result"]["timestamp"], 16) * 1000

                raw_value = int(log["data"], 16)
                adjusted_value = raw_value / 10**6
                value_str = f"{adjusted_value:.6f}"

                row = {"tx_hash": log["transactionHash"], "sender": "0x" + log["topics"][1][-40:], "receiver": "0x" + log["topics"][2][-40:], "value": value_str, "block_number": block_number, "timestamp": timestamp}
                rows_to_insert.append(row)

            if rows_to_insert:
                errors = client.insert_rows_json(table_ref, rows_to_insert)
                insert_size = len(str(rows_to_insert).encode('utf-8')) / 1024
                print(f"📡 BigQuery insert size: {insert_size:.2f} KB")
                if not errors:
                    print(f"Inserted {len(rows_to_insert)} rows into BigQuery")
                else:
                    print(f"Insert errors: {errors}")
            all_logs.extend(rows_to_insert)
        else:
            print(f"Error fetching logs: {data}")

    except Exception as e:
        print(f"Request failed: {e}")

    current_block = batch_end_block + 1
    time.sleep(0.03)

total_data = sum(len(str(log).encode('utf-8')) for log in all_logs) / (1024 * 1024)
print(f"\nTotal logs fetched: {len(all_logs)} | Total data: {total_data:.2f} MB")