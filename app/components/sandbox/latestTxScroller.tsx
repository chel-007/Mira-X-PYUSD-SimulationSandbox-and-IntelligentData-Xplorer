// components/sandbox/LatestTxScroller.tsx
import { useState, useEffect } from "react";
import { useData } from "../../utils/DataProvider";
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const LatestTxScroller = () => {
  const [latestTxs, setLatestTxs] = useState<string[]>([]);
  const { transfers } = useData();

  const handleCopy = async (textToCopy: string) => {
    try {
      await navigator.clipboard.writeText(textToCopy);
      toast.info(`Copied to clipboard`, {
        position: 'top-right',
        autoClose: 3000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
    } catch (err) {
      toast.error('Failed to copy to clipboard');
      console.error('Clipboard error:', err);
    }
  };

  useEffect(() => {
    if (transfers && transfers.length > 0) {
      // Sort by timestamp descending and take the latest 10
      const sortedTxs = [...transfers]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 10)
        .map((tx) => tx.txHash);
      setLatestTxs(sortedTxs);
    }
  }, [transfers]); // Re-run when transfers updates

  // Render the transaction list
  const renderTxList = () =>
    latestTxs.map((tx, index) => (
      
      <span
        key={`${tx}-${index}`}
        style={{ display: "inline-block", margin: "0 20px", position: "relative" }}
      >
        
        {index === 0 && (
          <span
            style={{
              position: "absolute",
              top: "-10px",
              left: "-10px",
              background: "green",
              color: "white",
              padding: "2px 4px",
              borderRadius: "50%",
              fontSize: "9px",
            }}
          >
            new
          </span>
        )}
        <span style={{ color: "rgba(255, 255, 255, 0.65)" }}>
          {tx.slice(0, 10)}...{tx.slice(-4)}
        </span>
        <button
          onClick={() => handleCopy(tx)}
          style={{
            marginLeft: "5px",
            background: "none",
            border: "none",
            color: "#7bcfff9d",
            cursor: "pointer",
          }}
        >
          <i className="fa-thin fa-copy"></i>
        </button>
        {index < latestTxs.length - 1 && (
          <span style={{ margin: "0 10px", color: "#555" }}>|</span>
        )}
      </span>
      
    ));

  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        background: "rgba(129, 132, 153, 0.08)",
        padding: "10px",
        overflow: "hidden",
        height: "40px",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          display: "inline-block",
          whiteSpace: "nowrap",
          animation: latestTxs.length > 0 ? "scroll 140s linear infinite" : "none",
        }}
      >
        {renderTxList()}
        {latestTxs.length > 0 && (
          <span style={{ display: "block", width: "10px", background: "red" }} />
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