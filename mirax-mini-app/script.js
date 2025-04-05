import getInsights from './mirax-pyusd-insights-sdk.js';

// Initialize Telegram WebApp
window.Telegram.WebApp.ready();

const REQUIRED_TOKEN = 'mirax_pyusd';
const BACKEND_URL = 'wss://mirax-connect-api-250354620143.us-central1.run.app';
const insightsClient = getInsights(REQUIRED_TOKEN, BACKEND_URL);

// Update UI with insights
const insightsDiv = document.getElementById('insights');
insightsClient.onUpdate((insights) => {
  if (insights.error) {
    insightsDiv.classList.add('error');
    insightsDiv.innerHTML = `<p>${insights.error}</p>`;
  } else {
    insightsDiv.classList.remove('error');
    insightsDiv.innerHTML = `
      <div class="insight-box time-insights">
        <h2>Time Insights</h2>
        <p>${insights.time_suggestion}</p>
        <p>Savings: ${insights.time_savings}</p>
        <p>Predictions: ${insights.time_prediction}</p>
      </div>
      <div class="insight-box gas-insights">
        <h2>Gas Insights</h2>
        <p>${insights.gas_trend}</p>
        <p>${insights.gas_historical}</p>
      </div>
      <div class="insight-box pool-insights">
        <h2>Pool Insights</h2>
        <p>Best Pool: ${insights.pool_best}</p>
      </div>
      <div class="insight-box tx-insights">
        <h2>Transaction Insights</h2>
        <p>Congestion: ${insights.tx_congestion}</p>
        <p>Volume: ${insights.tx_volume_prediction}</p>
      </div>
    `;
  }
});