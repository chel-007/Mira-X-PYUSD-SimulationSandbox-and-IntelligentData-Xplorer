'use client';

import { useState } from 'react';
import styles from '../../styles/Toggle.module.css';

interface ToggleSwitchProps {
  onToggle: (view: 'daily' | 'monthly') => void;
}

export default function ToggleSwitch({ onToggle }: ToggleSwitchProps) {
  const [activeView, setActiveView] = useState<'daily' | 'monthly'>('daily');

  const toggleView = (view: 'daily' | 'monthly') => {
    setActiveView(view);
    onToggle(view); // Notify parent component
  };

  return (
    <div className={styles.toggleContainer}>
      <div className={styles.toggleBackground}>
        <div 
          className={styles.toggleSlider} 
          style={{ transform: activeView === 'daily' ? 'translateX(0%)' : 'translateX(100%)' }}
        />
        <button 
          className={`${styles.toggleButton} ${activeView === 'daily' ? styles.active : ''}`} 
          onClick={() => toggleView('daily')}
        >
          Daily
        </button>
        <button 
          className={`${styles.toggleButton} ${activeView === 'monthly' ? styles.active : ''}`} 
          onClick={() => toggleView('monthly')}
        >
          Monthly
        </button>
      </div>
    </div>
  );
}
