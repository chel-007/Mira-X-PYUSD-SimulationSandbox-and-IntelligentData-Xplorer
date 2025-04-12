

## Mira X Documentation – realTime Edge in PYUSD Transactions

Mira X is an innovative, multidimensional analytics tool designed to deliver real-time insights for both users and developers. Its mission is to accelerate PYUSD stablecoin adoption by making its usage simpler, smarter, cheaper, and impactful across the DeFi and crypto ecosystem.

let's take a look at *ALL* of its features grounded in its interactive UI Hub:

### Features of MiraX
MiraX is built around three core features:

**Explore** — track and visualize PYUSD ***adoption trends*** in real-time.

**Simulate** — ***optimize your PYUSD transactions*** in a risk-free sandbox.

**Connect** — plug into MiraX’s self-hosted *Data Provider* to build smart, data-driven apps.

### Explore: 
the Explore feature delivers actionable insights into PYUSD adoption and performance within the DeFi ecosystem. key highlights include:
-   **Adoption Metrics**: tracks PYUSD usage trends and growth.
-   **Transaction Analysis**: breaks down gas costs for swaps and transfers, highlighting PYUSD’s contribution to Ethereum network congestion via hourly average gas consumption.
-   **Liquidity & Staking Pools**: analyzes PYUSD’s role in top pools on Curve Finance, comparing volume, swap rates, gas costs, and more.

The *Intelligent Data Explorer* combines historical & real-time **pyusd** data powered by a GCP Blockchain RPC Websocket. it works seamlessly with MiraX's BigQuery database and Cloud Run containers which schedule periodic syncs of this data to the cloud, while ensuring the frontend maintains its subscription to Firestore for continuous data updates.

<hr>

### Sandbox:
the *Sandbox* feature lets you simulate and analyze PYUSD transactions by interacting with ***smart contracts***, *transaction hashes*, and ***historical logs stored in BigQuery***. *3 major features* of Mira X sandbox includes:

**Exploring Trace Level** details of PYUSD transactions on Ethereum Mainnet and Sepolia. Powered by GCP Blockchain RPC, this feature ***replays transactions*** on an interactive, flow-like canvas, mapping out how each node (call) connects. Users can uncover:
- the role of each node (*was it a transfer?, balance check or contract withdrawal?*) .
- which contract consumed the most gas.
- how many calls were made.
- decoding the input data for deeper insights.

The highlight of the Sandbox (Add Tx) feature is transforming ***complex transaction data*** into a vibrant, color-coded canvas. With a single click, *each node reveals its purpose*, offering a clear, bird’s-eye view of how your transaction unfolded.

> analogy: you know how you never spend two minutes looking at a blockchain tx on etherscan, mirax sandbox tool is gonna **make u spend** *2 hours* just exploring a *PYUSD* transaction.

<hr>

**Gas-Optimized Transactions** feature helps users save on costs and make smarter trades. Powered by the MiraX Data Provider (behind the Explore feature) and integrated with Reown (formerly WalletConnect), it leverages GCP Blockchain RPC to deliver:

* *Gas Fee Estimation*: analyzes contract details to estimate gas prices and costs.
* *Balance Checks*: ensures sufficient funds for transfers.
	
 * *SimulationBox Insights*: computes metrics to optimize trades answering questions such as : **is now the best time to trade?**, **are gas costs reasonable for your transaction?**, ***should you wait for lower fees based on trends?***

the _Sandbox Mock Tx_ feature allows you to simulate transfers and swaps across MiraX supported pools, mirroring real transactions on Curve Finance. Get real-time insights on ***slippage, gas costs, and pool fees***—without risking your funds.

> analogy: while testing out the **Wallets** feature, I was stunned to see high-activity wallets racking up over $50 in daily fees. what ratio could those fees be cut down with by just utilizing the mirax sandbox tool?

<hr>

the **Wallets** feature in the Sandbox lets users monitor and measure their PYUSD transaction activity. Beyond personal tracking, it offers a ***Wallet Mocking*** option to analyze any address’s 7-day activity report, including *transactions*, ***gas consumed***, and ***staking details***.

the mocking feature can be initiated from the ***Transaction Trace Canvas*** or directly in the Wallets UI. For example, after examining a transaction hash, you can mock its address to dive deeper. While mocking, your connected wallet becomes secondary for as long as mocking lasts.

> analogy: the wallets UI is so sleek, fast and precise that it could double as a detective tool for tracking PYUSD activity, but to be clear, its highly accurate reports are built purely for educational purposes, and not for snooping purposes...

<hr>

### **Mirax Connect API**

> details on the Connect feature, also known as the MiraX Connect API

after seeing the performance of MiraX's Data Provider, I was inspired to extend it. The WebSocket streams thousands of ***pyusd*** transactions daily, keeping everything up to date. Building the components to pull this data into the web app was extensive, so to make it more efficient, I decided to host similar components in a GCP container.

I created a **WebSocket server** that *clients can connect to* using a ***required token***, allowing real-time, filtered, and analyzed PYUSD data to be passed to them for live insights
 
> **Purpose of the Connect Feature:**   the process starts with getting data, preprocessing, storing, analyzing, hosting, and finally distributing it. This can be time-consuming, but the **MiraX Connect API** simplifies it by letting you focus only on connecting to real-time data.

The API is designed for developers building smart payment solutions and DeFi PYUSD apps. To demonstrate the process, I’ve launched a mini Telegram app to illustrate how the connection works in practice.

<hr>

### Tech Stack Used for Mira X
-   Next.js & Typescript
- D3.js (interactive charts)
- Xyflow (sandbox canvas)
- GCP (BigQuery, Firestore, Blockchain RPC, Cloud Run)
- third party APIs (coingecko, curve finance)
- wallet connection (wagmi, ethers, reown)

<hr>

### Detailed Integration steps

