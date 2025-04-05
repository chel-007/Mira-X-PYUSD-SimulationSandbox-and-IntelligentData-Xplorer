"use client";
import React, { useState } from 'react';
import styles from "./styles/Home.module.css";
import { useRouter } from "next/navigation";
import "./globals.css"
import TelegramButton from "./TelegramButton";

export default function Home() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  const handleTradeClick = () => router.push("/explore");
  const handleSandboxClick = () => router.push("/sandbox");
  console.log('GOOGLE_APPLICATION_CREDENTIALS:', process.env.GOOGLE_APPLICATION_CREDENTIALS);

  return (
    <div className={styles.container}>
      <div className={styles.appContainer}>
        <h1 className={styles.appName}>
          Mira <span>X</span>
        </h1>
        <div className={styles.betaBadge}>BETA</div>
      </div>

      <div className={styles.contentWrapper}>
        <div className={styles.tagline}>
          <span className={styles.highlight}>realtime edge</span> in{" "}
          <span className={styles.highlight}>pyusd</span> transactions
        </div>
        <div className={styles.box}>
          <div className={styles.feature}>
            <div className={styles.largeText}>Explore</div>
            <div className={styles.subtext}>analyze trends and data</div>
            <button
              onClick={handleTradeClick}
              className={`${styles.featureButton} ${styles.trade}`}
            >
              Intelligent Data Xplorer <i className="fas fa-search"></i>
            </button>
          </div>

          <div className={styles.feature}>
            <div className={styles.largeText}>Simulate</div>
            <div className={styles.subtext}>simulate transactions in realtime</div>
            <button
              onClick={handleSandboxClick}
              className={`${styles.featureButton} ${styles.xplore}`}
            >
              PYUSD Tx Sandbox <i className="fa-brands fa-android"></i>
            </button>
          </div>

          <div className={styles.feature}>
            <div className={styles.largeText}>Connect</div>
            <div className={styles.subtext}>block rpc api on gcp infrastructure</div>
            <button className={`${styles.featureButton} ${styles.battle}`}>
              For Builders <i className="fa-solid fa-bolt"></i>
            </button>
          </div>
        </div>
      </div>

      <footer className={styles.footer}>
        <div className={styles.poweredBy}>Powered by PYUSD/GCP</div>
        <div className={styles.copyright}>© 2025 _</div>
      </footer>
      <TelegramButton isOpen={isOpen} onClick={() => setIsOpen(!isOpen)} />
    </div>
  );
}
