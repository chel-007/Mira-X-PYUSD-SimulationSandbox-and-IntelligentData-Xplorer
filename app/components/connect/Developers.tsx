// components/Developers.tsx
import React, { useState } from 'react';
import styles from '../../styles/Developers.module.css';

const Developers = () => {
  const [activeDoc, setActiveDoc] = useState('Installation Guide'); // Default to Installation Guide

  // Define the content for each doc section
  const docContent: { [key: string]: { description: string; code: string } } = {
    'Installation Guide': {
      description: 'Set up the MiraX Connect SDK in your project to integrate with the API.',
      code: `class InsightsClient {
  constructor(token, url = 'wss://mirax-connect-api-250354620143.us-central1.run.app') {
    this.ws = new WebSocket(\`\${url}?token=\${token}\`);
    this.callbacks = [];
    this.ws.onmessage = (event) => {
      const insights = JSON.parse(event.data);
      this.callbacks.forEach((cb) => cb(insights));
    };
    this.ws.onerror = (error) => console.error('WebSocket error:', error);
  }
  onUpdate(callback) {
    this.callbacks.push(callback);
  }
}

export default function getInsights(token, url) {
  return new InsightsClient(token, url);
}`,
    },
    'Authentication Setup': {
      description: 'Authenticate your application using the required token.',
      code: `// Use the provided token for authentication
const REQUIRED_TOKEN = 'mirax_pyusd';

// Example usage with the SDK
const insightsClient = getInsights(REQUIRED_TOKEN);`,
    },
    'API Endpoints': {
      description: 'Connect to the MiraX Connect API WebSocket endpoint to receive real-time PYUSD transaction insights.',
      code: `// WebSocket endpoint for real-time insights
const BACKEND_URL = 'wss://mirax-connect-api-250354620143.us-central1.run.app';

// Use this URL when initializing the InsightsClient
const insightsClient = getInsights(REQUIRED_TOKEN, BACKEND_URL);`,
    },
    'Code Examples': {
      description: 'A practical example of integrating the MiraX Connect API into a Telegram Mini App.',
      code: `// Initialize the Telegram Web App and InsightsClient
window.Telegram.WebApp.ready();

const REQUIRED_TOKEN = 'mirax_pyusd';
const BACKEND_URL = 'wss://mirax-connect-api-250354620143.us-central1.run.app';
const insightsClient = getInsights(REQUIRED_TOKEN, BACKEND_URL);

// Update UI with insights
const insightsDiv = document.getElementById('insights');
insightsClient.onUpdate((insights) => {
  if (insights.error) {
    insightsDiv.innerHTML = \`<p class="error">\${insights.error}</p>\`;
  } else {
    insightsDiv.innerHTML = \`
      <div class="insight-box">
        <h2>Transaction Insights</h2>
        <p>Congestion: \${insights.tx_congestion}</p>
        <p>Volume Prediction: \${insights.tx_volume_prediction}</p>
      </div>
      <div class="insight-box">
        <h2>Pool Insights</h2>
        <p>Best Pool: \${insights.pool_best}</p>
      </div>
    \`;
  }
});

// Example CSS for styling
const styles = \`
  .insight-box { background: #1a1a2e; padding: 10px; border-radius: 5px; margin: 10px 0; }
  .insight-box h2 { font-size: 1.2rem; color: #7BCFFF; }
  .error { color: #ff5555; }
\`;
`,
    },
  };

  return (
    <div className={styles.container}>
      {/* Full-width top section for API introduction */}
      <div className={styles.apiIntro}>
        <h2 className={styles.sectionTitle}>MiraX Connect API</h2>
        <p className={styles.sectionDescription}>
          Integrate with the MiraX Connect API to access real-time PYUSD transaction data and
          gas analysis tools. Hosted on robust GCP infrastructure, the API 
          empowers developers to build intelligent applications with ease.
        </p>
      </div>

      {/* Docs Section */}
      <div className={styles.bottomSections}>
        <div className={styles.section}>
          <h3 className={styles.subSectionTitle}>Docs - Plug SDK</h3>
          <p className={styles.sectionDescription}>
            The MiraX SDK provides a seamless way to integrate our API into your 
            applications. Check out the steps below to get started.
          </p>
          <div className={styles.docsContainer}>
            {/* Left: List of clickable items */}
            <ul className={styles.list}>
              {Object.keys(docContent).map((doc) => (
                <li
                  key={doc}
                  className={`${styles.listItem} ${activeDoc === doc ? styles.active : ''}`}
                  onClick={() => setActiveDoc(doc)}
                >
                  {doc}
                  <span className={styles.arrow}>→</span>
                </li>
              ))}
            </ul>

            {/* Right: Content area */}
            <div className={styles.contentArea}>
              <h4 className={styles.contentTitle}>{activeDoc}</h4>
              <p className={styles.contentDescription}>{docContent[activeDoc].description}</p>
              <pre className={styles.codeBlock}>
                <code>{docContent[activeDoc].code}</code>
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Developers;