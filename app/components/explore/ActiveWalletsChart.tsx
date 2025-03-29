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
    const margin = { top: 1, bottom: 10 }; // Define margins for top and bottom
    const adjustedHeight = height - margin.top - margin.bottom; // Adjust height for margins
    const radius = Math.min(width, adjustedHeight) / 2;

    // Calculate font sizes based on chart size
    const baseFontSize = radius * 0.12; // 12% of radius for percentage labels
    const totalFontSize = radius * 0.13; // 10% of radius for total text

    const totalWallets = activeWallets + dormantWallets;
    const data = [
      { label: "Active", value: activeWallets, color: "#7BCFFF" },
      { label: "Dormant", value: dormantWallets, color: "rgba(255, 255, 255, 0.3)" },
    ];

    if (isFirstMount.current) {
      svg.selectAll("*").remove();
    }

    // Center the chart, accounting for top margin
    const g = svg.select("g").empty()
      ? svg.append("g").attr("transform", `translate(${width / 2},${height / 2})`)
      : svg.select("g").attr("transform", `translate(${width / 2},${height / 2})`);

    const pie = d3.pie<{ label: string; value: number }>()
      .value(d => d.value);

    const arc = d3.arc()
      .innerRadius(radius * 0.5)
      .outerRadius(radius * 1);

    if (isFirstMount.current) {
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
          // Adjust "Active" label position (assumed to be the first slice)
          if (d.data.label === "Active") {
            const offsetY = -radius * 0.01; // Move up by 20% of radius
            return `translate(${centroid[0]}, ${centroid[1] + offsetY})`;
          }
          return `translate(${centroid[0]}, ${centroid[1]})`;
        })
        .text(d => totalWallets ? `${((d.data.value / totalWallets) * 100).toFixed(1)}%` : "0%")
        .attr("opacity", 0);

      const totalText = g.append("text")
        .attr("text-anchor", "middle")
        .attr("fill", "#fff")
        .attr("y", 5) // Center vertically
        .attr("font-size", totalFontSize)
        .text(`Total: ${totalWallets}`)
        .attr("opacity", 0);

      gsap.to(slices.nodes(), {
        opacity: 1,
        scale: 1,
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
      const slices = g.selectAll(".arc")
        .data(pie(data));

      slices.enter()
        .append("path")
        .attr("class", "arc")
        .attr("fill", d => d.data.color)
        .attr("opacity", 0)
        .attr("d", arc)
        .transition()
        .duration(500)
        .attr("opacity", 1);

      slices.transition()
        .duration(500)
        .attr("d", arc);

      slices.exit().remove();

      const labels = g.selectAll(".label")
        .data(pie(data));

      labels.enter()
        .append("text")
        .attr("class", "label")
        .attr("fill", "#fff")
        .attr("text-anchor", "middle")
        .attr("opacity", 0)
        .attr("font-size", baseFontSize)
        .attr("transform", d => {
          const centroid = arc.centroid(d);
          if (d.data.label === "Active") {
            const offsetY = -radius * 0.2; // Move up by 20% of radius
            return `translate(${centroid[0]}, ${centroid[1] + offsetY})`;
          }
          return `translate(${centroid[0]}, ${centroid[1]})`;
        })
        .text(d => totalWallets ? `${((d.data.value / totalWallets) * 100).toFixed(1)}%` : "0%")
        .transition()
        .duration(500)
        .attr("opacity", 1);

      labels.transition()
        .duration(500)
        .attr("font-size", baseFontSize)
        .attr("transform", d => {
          const centroid = arc.centroid(d);
          if (d.data.label === "Active") {
            const offsetY = -radius * 0.2; // Move up by 20% of radius
            return `translate(${centroid[0]}, ${centroid[1] + offsetY})`;
          }
          return `translate(${centroid[0]}, ${centroid[1]})`;
        })
        .text(d => totalWallets ? `${((d.data.value / totalWallets) * 100).toFixed(1)}%` : "0%");

      labels.exit().remove();

      g.select("text")
        .text(`Total: ${totalWallets}`)
        .attr("y", 5) // Ensure it stays centered
        .attr("font-size", totalFontSize) // Update font size on resize
        .transition()
        .duration(500)
        .attr("opacity", 0.6);
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