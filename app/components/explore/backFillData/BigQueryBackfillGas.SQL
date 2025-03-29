-- Define the UDF for hex-to-decimal conversion
CREATE TEMP FUNCTION hexToDecimal(hex STRING) RETURNS STRING LANGUAGE js AS """
  if (hex.startsWith('0x')) {
    hex = hex.slice(2);
  }
  if (hex === '' || hex === '0000000000000000000000000000000000000000000000000000000000000000') {
    return '0';
  }
  return BigInt('0x' + hex).toString();
""";

-- Create the table
CREATE TABLE `quick-wall-430008-u8.default.lp_activity_and_gas` AS
-- Part 1: PYUSD Transfers and Uniswap Swaps from decoded_events
SELECT
  e.block_number,
  UNIX_SECONDS(e.block_timestamp) AS block_timestamp,
  e.transaction_hash AS tx_hash,
  e.log_index,
  e.address,
  e.event_signature,
  e.topics,
  e.args,
  t.from_address,
  t.to_address,
  t.input,
  t.gas_price,
  r.gas_used,
  r.status,
  CASE
    WHEN e.address = '0x6c3ea9036406852006290770bedfcaba0e23a0e8'
         AND e.event_signature = 'Transfer(address,address,uint256)'
         AND SUBSTR(t.input, 0, 10) = '0xa9059cbb' THEN 'Transfer'
    WHEN e.address = '0xdd2e0d86a45e4ef9bd490c2809e6405720cc357c'
         AND e.event_signature = 'Swap(address,address,int256,int256,uint160,uint128,int24)' THEN 'Swap'
    ELSE 'Other'
  END AS event_type
FROM `bigquery-public-data.goog_blockchain_ethereum_mainnet_us.decoded_events` e
JOIN `bigquery-public-data.goog_blockchain_ethereum_mainnet_us.transactions` t
  ON e.transaction_hash = t.transaction_hash
JOIN `bigquery-public-data.goog_blockchain_ethereum_mainnet_us.receipts` r
  ON e.transaction_hash = r.transaction_hash
WHERE e.block_timestamp >= TIMESTAMP(DATE_SUB(DATE(CURRENT_TIMESTAMP()), INTERVAL 3 MONTH))
  AND t.block_timestamp >= TIMESTAMP(DATE_SUB(DATE(CURRENT_TIMESTAMP()), INTERVAL 3 MONTH))
  AND r.block_timestamp >= TIMESTAMP(DATE_SUB(DATE(CURRENT_TIMESTAMP()), INTERVAL 3 MONTH))
  AND (
    (e.address = '0x6c3ea9036406852006290770bedfcaba0e23a0e8'
     AND e.event_signature = 'Transfer(address,address,uint256)')
    OR
    (e.address = '0xdd2e0d86a45e4ef9bd490c2809e6405720cc357c'
     AND e.event_signature = 'Swap(address,address,int256,int256,uint160,uint128,int24)')
  )

UNION ALL

-- Part 2: Curve TokenExchange events from logs
SELECT
  l.block_number,
  UNIX_SECONDS(l.block_timestamp) AS block_timestamp,
  l.transaction_hash AS tx_hash,
  l.log_index,
  l.address,
  'TokenExchange(address,int128,uint256,int128,uint256)' AS event_signature,
  l.topics,
  -- Decode the TokenExchange event parameters
  JSON_OBJECT(
    'buyer', REGEXP_REPLACE(l.topics[SAFE_OFFSET(1)], '^0x0+', '0x'),
    'sold_id', CAST(CAST(CONCAT('0x', SUBSTR(l.data, 3, 64)) AS INT64) AS STRING),
    'tokens_sold', PARSE_BIGNUMERIC(hexToDecimal(SUBSTR(l.data, 67, 64))),
    'bought_id', CAST(CAST(CONCAT('0x', SUBSTR(l.data, 131, 64)) AS INT64) AS STRING),
    'tokens_bought', PARSE_BIGNUMERIC(hexToDecimal(SUBSTR(l.data, 195, 64)))
  ) AS args,
  t.from_address,
  t.to_address,
  t.input,
  t.gas_price,
  r.gas_used,
  r.status,
  'Swap' AS event_type
FROM `bigquery-public-data.goog_blockchain_ethereum_mainnet_us.logs` l
JOIN `bigquery-public-data.goog_blockchain_ethereum_mainnet_us.transactions` t
  ON l.transaction_hash = t.transaction_hash
JOIN `bigquery-public-data.goog_blockchain_ethereum_mainnet_us.receipts` r
  ON l.transaction_hash = r.transaction_hash
WHERE LOWER(l.address) IN (
  '0x383e6b4437b59fff47b619cba855ca29342a8559',
  '0x625e92624bc2d88619accc1788365a69767f6200'
)
AND l.block_timestamp >= TIMESTAMP(DATE_SUB(DATE(CURRENT_TIMESTAMP()), INTERVAL 3 MONTH))
AND t.block_timestamp >= TIMESTAMP(DATE_SUB(DATE(CURRENT_TIMESTAMP()), INTERVAL 3 MONTH))
AND r.block_timestamp >= TIMESTAMP(DATE_SUB(DATE(CURRENT_TIMESTAMP()), INTERVAL 3 MONTH))
AND topics[SAFE_OFFSET(0)] = '0x8b3e96f2b889fa771c53c981b40daf005f63f637f1869f707052d15a3dd97140'
AND LENGTH(l.data) >= 258  -- Ensure data field is long enough