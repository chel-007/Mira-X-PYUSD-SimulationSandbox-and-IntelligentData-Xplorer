import React from 'react';
import styles from '../../styles/Transaction.module.css';

const MiraAISuggestions = ({ insights }) => (
  <div className={styles.miraAiPopup}>
    <h3>Mira AI Insights</h3>
    <p>
      <i className="fa-spin fa-circle-notch" /> Gas Estimate: {insights.gasEstimateEth} ETH (Avg: {insights.avgGasFeeEth} ETH)
    </p>
    <p>
      <i className="fa-spin fa-circle-notch" /> Network Congestion: {insights.isGoodTime ? 'Low - Good time!' : 'High'}
    </p>
    {!insights.isGoodTime && <p>Next best time: {insights.nextBestHour}:00</p>}
    <p>
      <i className="fa-spin fa-circle-notch" /> Transfer Velocity: {insights.isHighVelocity ? 'High activity' : 'Normal'}
    </p>
  </div>
);

export default MiraAISuggestions;