import React from 'react';
import styles from './styles/TelegramButton.module.css'; // Import CSS module

const TelegramButton = ({ isOpen, onClick }) => {
  const handleClick = () => {
    // Toggle isOpen as before
    onClick();

    // Launch Telegram bot only when opening (or when already open, depending on your intent)
    if (isOpen) {
      window.open('https://t.me/MiraXInsightsBot', '_blank');
    }
  };

  return (
    <div
      className={`${styles.telegramButton} ${isOpen ? styles.open : styles.closed}`}
      onClick={handleClick}
    >
      {isOpen ? (
        <>
          Launch Telegram Bot
          <i className={`fa-brands fa-telegram ${styles.icon}`}></i>
          <span className={styles.closeBtn}>X</span>
        </>
      ) : (
        <>
          _
          <i className={`fas fa-arrow-left ${styles.arrow}`}></i>
        </>
      )}
    </div>
  );
};

export default TelegramButton;