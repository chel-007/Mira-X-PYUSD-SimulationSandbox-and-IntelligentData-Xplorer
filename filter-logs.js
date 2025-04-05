const fs = require('fs');
const readline = require('readline');

// Define the block number thresholds
const BLOCK_NUMBER_THRESHOLD = 22136798; 
const UPPER_BLOCK_THRESHOLD = 22183016;

const inputFile = 'latest-lp-activity-and-gas.jsonl';
const outputFile = 'filtered_lp_activity_and_gas.jsonl';
const readStream = fs.createReadStream(inputFile);
const writeStream = fs.createWriteStream(outputFile);

let filteredCount = 0;

// Process line-by-line
const rl = readline.createInterface({
  input: readStream,
  crlfDelay: Infinity,
});

rl.on('line', (line) => {
  try {
    const row = JSON.parse(line);
    const blockNumber = parseInt(row.block_number, 10);

    if (blockNumber > BLOCK_NUMBER_THRESHOLD && blockNumber < UPPER_BLOCK_THRESHOLD) {
      writeStream.write(line + '\n'); // Write the original line to output
      filteredCount++;
    }
  } catch (err) {
    console.error(`Error parsing line: ${line}`, err);
  }
});

rl.on('close', () => {
  writeStream.end();
  console.log(`Filtered ${filteredCount} rows with block_number between ${BLOCK_NUMBER_THRESHOLD} and ${UPPER_BLOCK_THRESHOLD}`);
  console.log(`Output saved to ${outputFile}`);
});

rl.on('error', (err) => {
  console.error('Error reading input file:', err);
});