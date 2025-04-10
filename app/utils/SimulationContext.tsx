// SimulationContext.tsx
"use client";
import React, { createContext, useContext, useState, ReactNode } from 'react';

// Define the shape of the simulation result
export interface BaseSimulationResult {
  gasEstimate?: string;
  gasPrice?: string;
  amount?: string;
  simulationResult?: string;
  error?: string;
  status?: string;
  txHash?: string;
  amountIn?: string;
  amountOut?: string;
  slippage?: string;
  tokenIn?: string;
  fee?: string;
  feePercentage?: string;
  poolAddress?: string;
}

export interface ApprovalSimulationResult {
  needsApproval: true;
  message: string;
  tokenIn: string;
  amountIn: string;
  amountInWei: string;
  poolAddress: string;
  tokenAddress: string;
  handleApprove: () => Promise<void>;
}

export type SimulationResult = BaseSimulationResult | ApprovalSimulationResult;

// Define the full context type
interface SimulationContextType {
  simulationResult: SimulationResult | null;
  setSimulationResult: (result: SimulationResult | null) => void;
  clearSimulation: () => void;
  amountOut: string | null;
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

export const useSimulation = () => {
  const context = useContext(SimulationContext);
  if (context === undefined) {
    throw new Error('useSimulation must be used within a SimulationProvider');
  }
  return context;
};