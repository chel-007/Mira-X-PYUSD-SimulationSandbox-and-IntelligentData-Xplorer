   // Uniswap V3 PYUSD/USDT
    // const UNISWAP_POSITION_MANAGER = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';
    // const UNISWAP_PYUSD_USDT_POOL = '0xDd2e0D86A45e4EF9bd490c2809E6405720cC357c';
  
    // // Fetch pool state (sqrtPriceX96 and tick)
    // const slot0Data = {
    //   jsonrpc: '2.0',
    //   id: 6,
    //   method: 'eth_call',
    //   params: [
    //     {
    //       to: UNISWAP_PYUSD_USDT_POOL,
    //       data: '0x3850c7bd', // slot0 function
    //     },
    //     'latest',
    //   ],
    // };
    // const slot0Response = await fetch(RPC_URL, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(slot0Data),
    // });
    // const slot0Result = await slot0Response.json();
    // const sqrtPriceX96 = slot0Result.result ? BigInt(`0x${slot0Result.result.slice(2, 66)}`) : BigInt(0);
    // const tick = slot0Result.result ? parseInt(slot0Result.result.slice(66, 130), 16) : 0;
  
    // Fetch user's position count
    // const uniswapBalanceOf = {
    //   jsonrpc: '2.0',
    //   id: 7,
    //   method: 'eth_call',
    //   params: [
    //     {
    //       to: UNISWAP_POSITION_MANAGER,
    //       data: `0x70a08231${address.slice(2).padStart(64, '0')}`,
    //     },
    //     'latest',
    //   ],
    // };
    // const uniswapBalanceResponse = await fetch(RPC_URL, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(uniswapBalanceOf),
    // });
    // const uniswapBalanceResult = await uniswapBalanceResponse.json();
    // const positionCount = uniswapBalanceResult.result ? parseInt(uniswapBalanceResult.result, 16) : 0;
  
    // let uniswapStake = 0;
    // for (let i = 0; i < positionCount; i++) {
    //   const tokenIdData = {
    //     jsonrpc: '2.0',
    //     id: 8 + i,
    //     method: 'eth_call',
    //     params: [
    //       {
    //         to: UNISWAP_POSITION_MANAGER,
    //         data: `0x6352211e${address.slice(2).padStart(64, '0')}${i.toString(16).padStart(64, '0')}`,
    //       },
    //       'latest',
    //     ],
    //   };
    //   const tokenIdResponse = await fetch(RPC_URL, {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json' },
    //     body: JSON.stringify(tokenIdData),
    //   });
    //   const tokenIdResult = await tokenIdResponse.json();
    //   const tokenId = tokenIdResult.result ? parseInt(tokenIdResult.result, 16) : null;
  
    //   if (tokenId) {
    //     const positionData = {
    //       jsonrpc: '2.0',
    //       id: 100 + i,
    //       method: 'eth_call',
    //       params: [
    //         {
    //           to: UNISWAP_POSITION_MANAGER,
    //           data: `0x99fbab88${tokenId.toString(16).padStart(64, '0')}`,
    //         },
    //         'latest',
    //       ],
    //     };
    //     const positionResponse = await fetch(RPC_URL, {
    //       method: 'POST',
    //       headers: { 'Content-Type': 'application/json' },
    //       body: JSON.stringify(positionData),
    //     });
    //     const positionResult = await positionResponse.json();
    //     const position = positionResult.result;
    //     if (position) {
    //       const token0 = `0x${position.slice(26, 66)}`.toLowerCase();
    //       const token1 = `0x${position.slice(90, 130)}`.toLowerCase();
    //       const liquidity = BigInt(`0x${position.slice(258, 322)}`);
    //       const tickLower = parseInt(position.slice(322, 386), 16);
    //       const tickUpper = parseInt(position.slice(386, 450), 16);
  
    //       if (token0 === PYUSD_ADDRESS || token1 === PYUSD_ADDRESS) {
    //         // Simplified in-range calculation (assumes position is fully in-range)
    //         if (tickLower <= tick && tick <= tickUpper) {
    //           const sqrtPriceLower = BigInt(Math.sqrt(1.0001 ** tickLower) * 2 ** 96);
    //           const sqrtPriceUpper = BigInt(Math.sqrt(1.0001 ** tickUpper) * 2 ** 96);
    //           let amount0 = 0n;
    //           let amount1 = 0n;
  
    //           if (sqrtPriceX96 < sqrtPriceLower) {
    //             amount0 = liquidity * (sqrtPriceUpper - sqrtPriceLower) / (sqrtPriceLower * sqrtPriceUpper);
    //           } else if (sqrtPriceX96 > sqrtPriceUpper) {
    //             amount1 = liquidity * (sqrtPriceUpper - sqrtPriceLower);
    //           } else {
    //             amount0 = liquidity * (sqrtPriceUpper - sqrtPriceX96) / (sqrtPriceX96 * sqrtPriceUpper);
    //             amount1 = liquidity * (sqrtPriceX96 - sqrtPriceLower);
    //           }
  
    //           const pyusdAmount = token0 === PYUSD_ADDRESS ? amount0 : amount1;
    //           uniswapStake += Number(pyusdAmount) / 1e18; // Assuming 18 decimals for PYUSD
    //         }
    //       }
    //     }
    //   }
    // }
  
    // stakingData.push({
    //   pool: 'Uniswap',
    //   stakeAmount: uniswapStake,
    //   apy: 25, // Replace with actual API call if available
    //   tvl: 65199, // Replace with actual API call if available
    // });