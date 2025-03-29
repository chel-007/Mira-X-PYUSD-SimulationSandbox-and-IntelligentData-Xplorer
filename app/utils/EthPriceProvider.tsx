"use client"
import React, { createContext, useContext, useEffect, useState } from "react";

interface EthPriceContextType {
  ethPrice: number | null;
  loading: boolean;
  error: string | null;
}

const EthPriceContext = createContext<EthPriceContextType>({
  ethPrice: null,
  loading: true,
  error: null,
});

export const useEthPrice = () => useContext(EthPriceContext);

export const EthPriceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ethPrice, setEthPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchEthPrice = async () => {
      try {
        setLoading(true);
        // Using CoinGecko API to fetch ETH price in USD
        const response = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
        );
        const data = await response.json();
        if (data.ethereum && data.ethereum.usd) {
          setEthPrice(data.ethereum.usd);
        } else {
          throw new Error("Failed to fetch ETH price");
        }
      } catch (err) {
        console.error("Error fetching ETH price:", err);
        setError("Failed to fetch ETH price");
        // Fallback to a reasonable default if the fetch fails
        setEthPrice(2000); // Default ETH price in USD (adjust as needed)
      } finally {
        setLoading(false);
      }
    };

    fetchEthPrice();
  }, []);

  return (
    <EthPriceContext.Provider value={{ ethPrice, loading, error }}>
      {children}
    </EthPriceContext.Provider>
  );
};