// SimulationContext.tsx
"use client";
import React, { createContext, useContext, useState, ReactNode } from 'react';

// Define the shape of the simulation result
interface SimulationResult {
  gasEstimate?: string;
  gasPrice?: string; // Added for SimulationResultBox
  simulationResult?: string;
  error?: string;
  status?: string; // Added for "Sending now" and "Sent"
  txHash?: string; // Added for transaction hash
}

// Define the full context type
interface SimulationContextType {
  simulationResult: SimulationResult | null;
  setSimulationResult: (result: SimulationResult | null) => void;
  clearSimulation: () => void;
  amountOut: string | null; // Already in your state
  setAmountOut: (value: string | null) => void;
  from?: string;
  setFrom: (value: string | undefined) => void;
  to?: string;
  setTo: (value: string | undefined) => void;
  amount?: string;
  setAmount: (value: string | undefined) => void;
  isMainnet?: boolean;
  setIsMainnet: (value: boolean | undefined) => void;
}

// Create context with default undefined value
const SimulationContext = createContext<SimulationContextType | undefined>(undefined);

export const SimulationProvider = ({ children }: { children: ReactNode }) => {
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [amountOut, setAmountOut] = useState<string | null>(null);
  const [from, setFrom] = useState<string | undefined>(undefined);
  const [to, setTo] = useState<string | undefined>(undefined);
  const [amount, setAmount] = useState<string | undefined>(undefined);
  const [isMainnet, setIsMainnet] = useState<boolean | undefined>(undefined);

  const clearSimulation = () => {
    setSimulationResult(null);
    setAmountOut(null);
    setFrom(undefined);
    setTo(undefined);
    setAmount(undefined);
    setIsMainnet(undefined);
  };

  return (
    <SimulationContext.Provider
      value={{
        simulationResult,
        setSimulationResult,
        clearSimulation,
        amountOut,
        setAmountOut,
        from,
        setFrom,
        to,
        setTo,
        amount,
        setAmount,
        isMainnet,
        setIsMainnet,
      }}
    >
      {children}
    </SimulationContext.Provider>
  );
};

// Type-safe hook
export const useSimulation = () => {
  const context = useContext(SimulationContext);
  if (context === undefined) {
    throw new Error('useSimulation must be used within a SimulationProvider');
  }
  return context;
};