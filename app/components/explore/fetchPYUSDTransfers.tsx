// utils/fetchPYUSDTransfers.ts

export const fetchPYUSDTransfers = async () => {
    try {
        const response = await fetch("https://blockchain.googleapis.com/v1/projects/pyusd-sandbox/locations/us-central1/endpoints/ethereum-mainnet/rpc?key=AIzaSyCJKmstvRGEAlZEAHmjmAZViMl9IqQFbDE", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "eth_getLogs",
                params: [{
                    fromBlock: "0x14f2daf",
                    toBlock: "0x14f2daf",
                    address: "0x6c3ea9036406852006290770bedfcaba0e23a0e8",  // Replace with actual PYUSD contract address
                    topics: [
                        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"  // Full Transfer event hash
                    ]
                }]
            })
        });

        if (!response.ok) throw new Error("Failed to fetch PYUSD transfer data.");

        const data = await response.json();
        console.log(data);
        return data.result; // Return the transaction logs
    } catch (error) {
        console.error("Error fetching PYUSD transfers:", error);
        return [];
    }
};


// 651d4645ec9841a28fbcef7fa441a2cd
// https://sepolia.infura.io/v3/651d4645ec9841a28fbcef7fa441a2cd


// curl -X POST "https://mainnet.infura.io/v3/651d4645ec9841a28fbcef7fa441a2cd" \
// -H "Content-Type: application/json" \
// -d '{
//      "jsonrpc": "2.0",
//      "id": 1,
//      "method": "eth_getLogs",
//      "params": [{
//          "fromBlock": "0x14f2daf",
//          "toBlock": "0x14f2daf",
//          "address": "0x6c3ea9036406852006290770bedfcaba0e23a0e8",
//          "topics": []
//      }]
//  }'
// curl -X POST "https://mainnet.infura.io/v3/651d4645ec9841a28fbcef7fa441a2cd" \
//      -H "Content-Type: application/json" \
//      -d '{
//         "jsonrpc": "2.0",
//         "id": 1,
//         "method": "eth_getLogs",
//         "params": [{
//            "fromBlock": "latest",
//            "toBlock": "latest",
//             "address": "0x6c3ea9036406852006290770bedfcaba0e23a0e8",
//             "topics": []
//         }]
//     }'
