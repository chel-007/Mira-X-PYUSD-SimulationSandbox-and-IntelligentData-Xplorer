"use client";
import React, { useLayoutEffect, useRef, useEffect } from "react";
import * as d3 from "d3";
import { gsap } from "gsap";
import styles from "../../styles/Explore.module.css";

interface ActiveWalletsChartProps {
  activeWallets: number;
  dormantWallets: number;
  loading: boolean;
}

const ActiveWalletsChart: React.FC<ActiveWalletsChartProps> = ({ activeWallets, dormantWallets, loading }) => {
  const activeWalletsRef = useRef<SVGSVGElement | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const isFirstMount = useRef(true);
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const renderChart = () => {
    if (!activeWalletsRef.current || loading) return;

    const svg = d3.select(activeWalletsRef.current);
    const width = chartContainerRef.current?.clientWidth || 600;
    const height = chartContainerRef.current?.clientHeight || 600;
    const margin = { top: 1, bottom: 10 };
    const adjustedHeight = height - margin.top - margin.bottom;
    const radius = Math.min(width, adjustedHeight) / 2;

    const baseFontSize = radius * 0.13;
    const totalFontSize = radius * 0.14;

    const totalWallets = activeWallets + dormantWallets;
    const data = [
      { label: "Active", value: activeWallets, color: "#7BCFFF" },
      { label: "Dormant", value: dormantWallets, color: "rgba(255, 255, 255, 0.3)" },
    ];

    if (isFirstMount.current) {
      svg.selectAll("*").remove();
    }

    const g = svg.select("g").empty()
      ? svg.append("g").attr("transform", `translate(${width / 2},${height / 2})`)
      : svg.select("g").attr("transform", `translate(${width / 2},${height / 2})`);

    const pie = d3.pie<{ label: string; value: number }>()
      .value(d => d.value);

    const arc = d3.arc()
      .innerRadius(radius * 0.5)
      .outerRadius(radius * 1);

    if (isFirstMount.current) {
      // Initial render with animation
      const slices = g.selectAll(".arc")
        .data(pie(data))
        .enter()
        .append("path")
        .attr("class", "arc")
        .attr("d", arc)
        .attr("fill", d => d.data.color)
        .attr("opacity", 0);

      const labels = g.selectAll(".label")
        .data(pie(data))
        .enter()
        .append("text")
        .attr("class", "label")
        .attr("text-anchor", "middle")
        .attr("fill", "#fff")
        .attr("font-size", baseFontSize)
        .attr("transform", d => {
          const centroid = arc.centroid(d);
          if (d.data.label === "Active") {
            const offsetY = -baseFontSize * 0.5; // Shift up by half the font size
            return `translate(${centroid[0]}, ${centroid[1]})`;
          }
          return `translate(${centroid[0]}, ${centroid[1]})`;
        })
        .text(d => totalWallets ? `${((d.data.value / totalWallets) * 100).toFixed(1)}%` : "0%")
        .attr("opacity", 0);

      const totalText = g.append("text")
        .attr("class", "total-text")
        .attr("text-anchor", "middle")
        .attr("fill", "#fff")
        .attr("y", 5)
        .attr("font-size", totalFontSize)
        .text(`Total: ${totalWallets}`)
        .attr("opacity", 0);

      gsap.to(slices.nodes(), {
        opacity: 1,
        duration: 2,
        ease: "power2.out",
        stagger: 0.3,
      });
      gsap.to(labels.nodes(), {
        opacity: 1,
        duration: 2,
        delay: 0.6,
      });
      gsap.to(totalText.node(), {
        opacity: 0.6,
        duration: 2,
        delay: 0.6,
      });

      isFirstMount.current = false;
    } else {
      // Updates with smooth transitions
      const slices = g.selectAll(".arc").data(pie(data));
    
      const enteringSlices = slices.enter()
        .append("path")
        .attr("class", "arc")
        .attr("fill", d => d.data.color)
        .attr("opacity", 0)
        .attr("d", arc);
      if (enteringSlices.size()) {
        gsap.to(enteringSlices.nodes(), { opacity: 1, duration: 0.5 });
      }
    
      slices.transition().duration(500).attr("d", arc);
    
      const exitingSlices = slices.exit();
      if (exitingSlices.size()) {
        gsap.to(exitingSlices.nodes(), { opacity: 0, duration: 0.5, onComplete: () => exitingSlices.remove() });
      }
    
      const labels = g.selectAll(".label").data(pie(data));
    
      const enteringLabels = labels.enter()
        .append("text")
        .attr("class", "label")
        .attr("fill", "#fff")
        .attr("text-anchor", "middle")
        .attr("font-size", baseFontSize)
        .attr("transform", d => {
          const centroid = arc.centroid(d);
          if (d.data.label === "Active") {
            const offsetY = -baseFontSize * 0.5; // Consistent with initial render
            return `translate(${centroid[0]}, ${centroid[1] + offsetY})`;
          }
          return `translate(${centroid[0]}, ${centroid[1]})`;
        })
        .text(d => totalWallets ? `${((d.data.value / totalWallets) * 100).toFixed(1)}%` : "0%")
        .attr("opacity", 0);
      if (enteringLabels.size()) {
        gsap.to(enteringLabels.nodes(), { opacity: 1, duration: 0.5 });
      }
    
      labels.transition()
        .duration(500)
        .attr("font-size", baseFontSize)
        .attr("transform", d => {
          const centroid = arc.centroid(d);
          if (d.data.label === "Active") {
            const offsetY = -baseFontSize * 0.5; // Consistent with initial render
            return `translate(${centroid[0]}, ${centroid[1] + offsetY})`;
          }
          return `translate(${centroid[0]}, ${centroid[1]})`;
        })
        .text(d => totalWallets ? `${((d.data.value / totalWallets) * 100).toFixed(1)}%` : "0%");
    
      const exitingLabels = labels.exit();
      if (exitingLabels.size()) {
        gsap.to(exitingLabels.nodes(), { opacity: 0, duration: 0.5, onComplete: () => exitingLabels.remove() });
      }
    
      const totalText = g.select(".total-text");
      if (totalText.empty()) {
        const newTotalText = g.append("text")
          .attr("class", "total-text")
          .attr("text-anchor", "middle")
          .attr("fill", "#fff")
          .attr("y", 5)
          .attr("font-size", totalFontSize)
          .text(`Total: ${totalWallets}`)
          .attr("opacity", 0);
        gsap.to(newTotalText.node(), { opacity: 0.6, duration: 0.5 });
      } else {
        totalText
          .text(`Total: ${totalWallets}`)
          .attr("font-size", totalFontSize)
          .attr("y", 5);
        gsap.to(totalText.node(), { opacity: 0.6, duration: 0.5 });
      }
    }
  };

  useLayoutEffect(() => {
    const handleResize = () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      resizeTimeoutRef.current = setTimeout(() => {
        renderChart();
      }, 100);
    };

    console.log("ActiveWalletsChart rendering with:", { activeWallets, dormantWallets, loading });
    renderChart();

    const resizeObserver = new ResizeObserver(() => handleResize());
    if (chartContainerRef.current) resizeObserver.observe(chartContainerRef.current);

    return () => {
      if (chartContainerRef.current) resizeObserver.unobserve(chartContainerRef.current);
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
    };
  }, [activeWallets, dormantWallets, loading]);

  useEffect(() => {
    return () => {
      isFirstMount.current = true;
    };
  }, []);

  return (
    <div ref={chartContainerRef} style={{ width: "100%", height: "100%" }}>
      {loading ? (
        <div>...</div>
      ) : (
        <svg
          ref={activeWalletsRef}
          style={{
            width: "100%",
            height: "100%",
          }}
        ></svg>
      )}
    </div>
  );
};

export default ActiveWalletsChart;