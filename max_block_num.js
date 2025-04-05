const fs = require('fs');
const readline = require('readline');

// Input file
const inputFile = 'filtered_lp_activity_and_gas.jsonl';

// Track max block number
let maxBlockNumber = -Infinity;

// Process line-by-line
const readStream = fs.createReadStream(inputFile);
const rl = readline.createInterface({
  input: readStream,
  crlfDelay: Infinity,
});

rl.on('line', (line) => {
  try {
    const row = JSON.parse(line); // Parse each line as a JSON object
    const blockNumber = parseInt(row.block_number, 10); // Convert block_number to integer

    if (!isNaN(blockNumber) && blockNumber > maxBlockNumber) {
      maxBlockNumber = blockNumber;
    }
  } catch (err) {
    console.error(`Error parsing line: ${line}`, err);
  }
});

rl.on('close', () => {
  if (maxBlockNumber === -Infinity) {
    console.log('No valid block_number found in the file');
  } else {
    console.log(`Maximum block_number: ${maxBlockNumber}`);
  }
});

rl.on('error', (err) => {
  console.error('Error reading input file:', err);
});


// max of lp_and_gas: 22188516

// max of prevlp: 22136798
