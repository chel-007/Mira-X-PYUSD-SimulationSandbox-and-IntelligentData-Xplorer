// components/sandbox/LatestTxScroller.tsx
import { useState, useEffect } from 'react';
import { db } from "../../lib/clientFirestore";
import { collection, query, orderBy, limit, onSnapshot, getDocs } from 'firebase/firestore';

const LatestTxScroller = () => {
  const [latestTxs, setLatestTxs] = useState<string[]>([]);

  useEffect(() => {
    // Initial fetch for the last 10 transactions
    const q = query(
      collection(db, 'transfer_transactions'),
      orderBy('timestamp', 'desc'),
      limit(10)
    );

    // Preload data with getDocs
    getDocs(q).then((snapshot) => {
      const txs = snapshot.docs.map(doc => doc.data().txHash);
      console.log('Initial TXs:', txs)
      setLatestTxs(txs); // Set initial data immediately
    }).catch((error) => {
      console.error('Initial Fetch Error:', error);
    });

    // Set up real-time listener
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const txs = snapshot.docs.map(doc => doc.data().txHash);
      setLatestTxs(txs); // Update with real-time changes
    }, (error) => {
      console.error('Firestore Error:', error);
    });

    return () => unsubscribe();
  }, []);

  // Render the transaction list
  const renderTxList = () => (
    latestTxs.map((tx, index) => (
      <span key={`${tx}-${index}`} style={{ display: 'inline-block', margin: '0 20px', position: 'relative' }}>
        {index === 0 && (
          <span style={{
            position: 'absolute',
            top: '-10px',
            left: '-10px',
            background: 'green',
            color: 'white',
            padding: '2px 4px',
            borderRadius: '50%',
            fontSize: '9px',
          }}>
            new
          </span>
        )}
        <span style={{ color: 'rgba(255, 255, 255, 0.65)' }}>{tx.slice(0, 10)}...{tx.slice(-4)}</span>
        <button
          onClick={() => navigator.clipboard.writeText(tx)}
          style={{ marginLeft: '5px', background: 'none', border: 'none', color: '#7bcfff9d', cursor: 'pointer' }}
        >
          <i className="fa-thin fa-copy"></i>
        </button>
        {index < latestTxs.length - 1 && <span style={{ margin: '0 10px', color: '#555' }}>|</span>}
      </span>
    ))
  );

  return (
    <div style={{
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      background: 'rgba(129, 132, 153, 0.08)',
      padding: '10px',
      overflow: 'hidden',
      height: '40px',
      zIndex: 1000,
    }}>
      <div style={{
        display: 'inline-block',
        whiteSpace: 'nowrap',
        animation: latestTxs.length > 0 ? 'scroll 80s linear infinite' : 'none',
      }}>
        {renderTxList()}
        {latestTxs.length > 0 && (
          <span style={{ display: 'block', width: '10px', background: 'red' }} /> // Controlled gap
        )}
      </div>
      <style jsx>{`
        @keyframes scroll {
          0% { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
    </div>
  );
};

export default LatestTxScroller;