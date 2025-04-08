    // Uniswap PYUSD/USDT
    const UNISWAP_POOL_ADDRESS = '0xDd2e0D86A45e4EF9bd490c2809E6405720cC357c'; // Corrected from your earlier code
    const PYUSD_ADDRESS = '0x6c3ea9036406852006290770bedfcaba0e23a0e8';
    const USDT_ADDRESS = '0xdac17f958d2ee523a2206206994597c13d831ec7';
    const FEE = 500;
  
    let totalStake = 0;
    let uniswapApy = 0;
    let uniswapTvl = 0;
  
    try {
      // Fetch slot0
      const slot0Data = {
        jsonrpc: '2.0',
        id: 4,
        method: 'eth_call',
        params: [{ to: UNISWAP_POOL_ADDRESS, data: '0x3850c7bd' }, 'latest'],
      };
      const slot0Response = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slot0Data),
      });
      const slot0Result = await slot0Response.json();
      const slot0Hex = slot0Result.result || '0x0';
      const sqrtPriceX96 = BigInt('0x' + slot0Hex.slice(2, 66));
      const tick = BigInt.asIntN(24, BigInt('0x' + slot0Hex.slice(66, 130)));
  
      // Fetch positions
      let positions = [];
      try {
        const response = await fetch('/api/stakingData', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            owner: effectiveAddress.toLowerCase(),
            pool: UNISWAP_POOL_ADDRESS.toLowerCase(),
          }),
        });
        if (!response.ok) throw new Error(`API returned ${response.status}`);
        const data = await response.json();
        positions = data.positions || [];
        console.log('Uniswap positions:', positions);
      } catch (error) {
        console.error('Error fetching Uniswap positions:', error);
      }
  
      // Calculate stake
      const token0 = new Token(1, PYUSD_ADDRESS, 6, 'PYUSD', 'PayPal USD');
      const token1 = new Token(1, USDT_ADDRESS, 6, 'USDT', 'Tether USD');
      const pool = new Pool(token0, token1, FEE, sqrtPriceX96.toString(), 0, Number(tick));
      for (const pos of positions) {
        const position = new Position({
          pool,
          liquidity: pos.liquidity,
          tickLower: pos.tickLower.tickIdx,
          tickUpper: pos.tickUpper.tickIdx,
        });
        const amount0 = parseFloat(position.amount0.toSignificant(6));
        const amount1 = parseFloat(position.amount1.toSignificant(6));
        totalStake += amount0 + amount1;
      }
    } catch (error) {
      console.error('Error calculating Uniswap stake:', error);
      totalStake = 0;
    }
  
    // Fetch APY and TVL from DefiLlama
    try {
      const defiLlamaResponse = await fetch('https://yields.llama.fi/pools');
      const defiLlamaData = await defiLlamaResponse.json();
      const uniswapPoolData = defiLlamaData.data.find(
        (pool) => pool.pool.toLowerCase() === UNISWAP_POOL_ADDRESS.toLowerCase() && pool.chain === 'Ethereum'
      );
      if (uniswapPoolData) {
        uniswapApy = uniswapPoolData.apy;
        uniswapTvl = uniswapPoolData.tvlUsd;
      } else {
        console.warn('Uniswap pool not found in DefiLlama API, using fallback values');
        uniswapApy = 0; // Fallback APY
        uniswapTvl = 0; // Fallback TVL
      }
    } catch (error) {
      console.error('Error fetching DefiLlama API:', error);
      uniswapApy = 0;
      uniswapTvl = 0;
    }
  
    // Always push Uniswap pool, even with zero stake
    newStakingData.push({
      pool: 'Uniswap PYUSD/USDT',
      stakeAmount: totalStake,
      apy: uniswapApy,
      tvl: uniswapTvl,
    });