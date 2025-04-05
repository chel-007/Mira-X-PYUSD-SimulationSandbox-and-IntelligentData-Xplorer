import React from 'react';
import styles from '../../styles/Explore.module.css';

interface ChartWrapperProps {
  title: string;
  children: React.ReactNode;
  loading: boolean;
  extraControls?: React.ReactNode;
  showExtraControls?: boolean;
  showChartControls?: boolean;
  onZoom?: () => void;
  onPan?: () => void;
  onDownload?: () => void;
}

const ChartWrapper: React.FC<ChartWrapperProps> = ({
  title,
  children,
  loading,
  extraControls,
  showExtraControls = true,
  showChartControls = true,
  onZoom,
  onPan,
  onDownload,
}) => {
  const headerClass = `${styles.chartHeader} ${showExtraControls || showChartControls ? styles.hasControls : ''}`;

  return (
    <div className={styles.chartWrapper}>
      <div className={headerClass}>
        {showExtraControls && <div className={styles.chartExtra}>{extraControls || null}</div>}
        <h4 className={styles.chartTitle}>{title}</h4>
        {showChartControls && (
          <div className={styles.chartControls}>
            {onZoom && <button onClick={onZoom}>Zoom</button>}
            {onPan && <button onClick={onPan}>Pan</button>}
            {onDownload && <button onClick={onDownload}>Download</button>}
          </div>
        )}
      </div>
      <div className={styles.chartContent}>
        {loading ? (
          <div>Loading...</div>
        ) : (
          <div className={styles.chartInner}>{children}</div>
        )}
      </div>
    </div>
  );
};

export default ChartWrapper;