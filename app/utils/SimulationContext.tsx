// SimulationContext.tsx
"use client";
import React, { createContext, useContext, useState, ReactNode } from 'react';

// Define the shape of the context
interface SimulationContextType {
  simulationResult: { gasEstimate?: string; simulationResult?: string; error?: string } | null;
  setSimulationResult: (result: { gasEstimate?: string; simulationResult?: string; error?: string } | null) => void;
  
  clearSimulation: () => void; // New function
}

// Create context with default undefined value
const SimulationContext = createContext<SimulationContextType | undefined>(undefined);


export const SimulationProvider = ({ children }: { children: ReactNode }) => {
  const [simulationResult, setSimulationResult] = useState<SimulationContextType['simulationResult']>(null);
  const [amountOut, setAmountOut] = useState(null);

  const clearSimulation = () => {
    setSimulationResult(null);
    setAmountOut(null);
  }

  return (
    <SimulationContext.Provider value={{ simulationResult, setSimulationResult, clearSimulation, amountOut, setAmountOut }}>
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