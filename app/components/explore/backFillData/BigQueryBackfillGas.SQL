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

SELECT
  l.block_number,
  UNIX_SECONDS(l.block_timestamp) AS block_timestamp,
  l.transaction_hash AS tx_hash,
  l.log_index,
  l.address,
  CASE
    WHEN l.address = '0x6c3ea9036406852006290770bedfcaba0e23a0e8'
         AND l.topics[SAFE_OFFSET(0)] = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
         THEN 'Transfer(address,address,uint256)'
    WHEN l.address IN ('0x383e6b4437b59fff47b619cba855ca29342a8559', '0x625e92624bc2d88619accc1788365a69767f6200')
         AND l.topics[SAFE_OFFSET(0)] = '0x8b3e96f2b889fa771c53c981b40daf005f63f637f1869f707052d15a3dd97140'
         THEN 'TokenExchange(address,int128,uint256,int128,uint256)'
  END AS event_signature,
  l.topics,
  CASE
    WHEN l.address = '0x6c3ea9036406852006290770bedfcaba0e23a0e8'
         AND l.topics[SAFE_OFFSET(0)] = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
         THEN JSON_OBJECT(
           'from', REGEXP_REPLACE(l.topics[SAFE_OFFSET(1)], '^0x0+', '0x'),
           'to', REGEXP_REPLACE(l.topics[SAFE_OFFSET(2)], '^0x0+', '0x'),
           'value', PARSE_BIGNUMERIC(hexToDecimal(l.data))
         )
    WHEN l.address IN ('0x383e6b4437b59fff47b619cba855ca29342a8559', '0x625e92624bc2d88619accc1788365a69767f6200')
         AND l.topics[SAFE_OFFSET(0)] = '0x8b3e96f2b889fa771c53c981b40daf005f63f637f1869f707052d15a3dd97140'
         THEN JSON_OBJECT(
           'buyer', REGEXP_REPLACE(l.topics[SAFE_OFFSET(1)], '^0x0+', '0x'),
           'sold_id', CAST(CAST(CONCAT('0x', SUBSTR(l.data, 3, 64)) AS INT64) AS STRING),
           'tokens_sold', PARSE_BIGNUMERIC(hexToDecimal(SUBSTR(l.data, 67, 64))),
           'bought_id', CAST(CAST(CONCAT('0x', SUBSTR(l.data, 131, 64)) AS INT64) AS STRING),
           'tokens_bought', PARSE_BIGNUMERIC(hexToDecimal(SUBSTR(l.data, 195, 64)))
         )
  END AS args,
  t.from_address,
  t.to_address,
  t.input,
  t.gas_price,
  r.gas_used,
  r.status,
  CASE
    WHEN l.address = '0x6c3ea9036406852006290770bedfcaba0e23a0e8'
         AND l.topics[SAFE_OFFSET(0)] = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
         THEN 'Transfer'
    WHEN l.address IN ('0x383e6b4437b59fff47b619cba855ca29342a8559', '0x625e92624bc2d88619accc1788365a69767f6200')
         AND l.topics[SAFE_OFFSET(0)] = '0x8b3e96f2b889fa771c53c981b40daf005f63f637f1869f707052d15a3dd97140'
         THEN 'Swap'
  END AS event_type
FROM `bigquery-public-data.goog_blockchain_ethereum_mainnet_us.logs` l
JOIN `bigquery-public-data.goog_blockchain_ethereum_mainnet_us.transactions` t
  ON l.transaction_hash = t.transaction_hash
JOIN `bigquery-public-data.goog_blockchain_ethereum_mainnet_us.receipts` r
  ON l.transaction_hash = r.transaction_hash
WHERE LOWER(l.address) IN (
  '0x383e6b4437b59fff47b619cba855ca29342a8559', -- Curve Pool 1
  '0x625e92624bc2d88619accc1788365a69767f6200', -- Curve Pool 2
  '0x6c3ea9036406852006290770bedfcaba0e23a0e8'  -- PYUSD
)
AND l.block_timestamp >= TIMESTAMP(DATE_SUB(DATE(CURRENT_TIMESTAMP()), INTERVAL 1 MONTH))
AND t.block_timestamp >= TIMESTAMP(DATE_SUB(DATE(CURRENT_TIMESTAMP()), INTERVAL 1 MONTH))
AND r.block_timestamp >= TIMESTAMP(DATE_SUB(DATE(CURRENT_TIMESTAMP()), INTERVAL 1 MONTH))
AND (
  (l.topics[SAFE_OFFSET(0)] = '0x8b3e96f2b889fa771c53c981b40daf005f63f637f1869f707052d15a3dd97140' -- TokenExchange
   AND l.address IN ('0x383e6b4437b59fff47b619cba855ca29342a8559', '0x625e92624bc2d88619accc1788365a69767f6200')
   AND LENGTH(l.data) >= 258) -- Ensure data field is long enough for Curve decoding
  OR
  (l.topics[SAFE_OFFSET(0)] = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' -- Transfer
   AND l.address = '0x6c3ea9036406852006290770bedfcaba0e23a0e8'
   AND SUBSTR(t.input, 0, 10) = '0xa9059cbb') -- Filter for direct transfer method
);