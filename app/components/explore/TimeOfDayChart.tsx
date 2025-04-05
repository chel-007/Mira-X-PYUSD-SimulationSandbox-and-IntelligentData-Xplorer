"use client";
import React, { useEffect, useRef, useLayoutEffect } from "react";
import * as d3 from "d3";

interface TimeOfDayData {
  event_date: string;
  hour_of_day: number;
  avg_gas_fee_eth: number;
  avg_gas_fee_usd: number;
  transaction_count: number;
}

interface TimeOfDayDataWithCongestion extends TimeOfDayData {
  congestion: number;
}

interface TimeOfDayChartProps {
  timeOfDayData: TimeOfDayData[];
}

const TimeOfDayChart: React.FC<TimeOfDayChartProps> = ({ timeOfDayData }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isFirstMount = useRef(true);

  // Create tooltip once
  useEffect(() => {
    const tooltip = document.createElement("div");
    tooltip.className = "tooltip";
    tooltip.style.position = "absolute";
    tooltip.style.background = "rgba(0, 0, 0, 0.8)";
    tooltip.style.color = "#fff";
    tooltip.style.padding = "5px 10px";
    tooltip.style.borderRadius = "4px";
    tooltip.style.pointerEvents = "none";
    tooltip.style.fontSize = "14px";
    tooltip.style.fontFamily = "Josefin Sans, sans-serif";
    tooltip.style.fontWeight = '200';
    tooltip.style.opacity = "0";
    tooltip.style.zIndex = "1000";
    document.body.appendChild(tooltip);
    tooltipRef.current = tooltip;

    return () => {
      if (tooltipRef.current) {
        document.body.removeChild(tooltipRef.current);
        tooltipRef.current = null;
      }
    };
  }, []);

  const renderChart = () => {
    if (!svgRef.current || !containerRef.current || !timeOfDayData.length) return;

    const svg = d3.select(svgRef.current);
    const margin = { top: 20, right: 80, bottom: 40, left: 80 };
    const width = containerRef.current.clientWidth || 600;
    const height = containerRef.current.clientHeight || 400;
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Ensure inner dimensions are positive
    if (innerWidth <= 0 || innerHeight <= 0) {
      // console.warn("Invalid inner dimensions:", { innerWidth, innerHeight });
      return;
    }

    if (isFirstMount.current) {
      svg.selectAll("*").remove();
    }

    const dates = Array.from(new Set(timeOfDayData.map(d => d.event_date))).sort();
    const hours = Array.from({ length: 24 }, (_, i) => i); // 0-23
    const completeData: TimeOfDayData[] = [];
    dates.forEach(date => {
      hours.forEach(hour => {
        const entry = timeOfDayData.find(d => d.event_date === date && d.hour_of_day === hour);
        completeData.push({
          event_date: date,
          hour_of_day: hour,
          avg_gas_fee_eth: entry ? entry.avg_gas_fee_eth : 0,
          avg_gas_fee_usd: entry ? entry.avg_gas_fee_usd : 0,
          transaction_count: entry ? entry.transaction_count : 0,
        });
      });
    });

    // console.log("Complete data length:", completeData.length);
    // console.log("Sample data:", completeData.slice(0, 5));

    // Compute congestion metric
    const maxGasFee = d3.max(completeData, d => d.avg_gas_fee_usd) || 1;
    const minGasFee = Math.max(d3.min(completeData, d => d.avg_gas_fee_usd) || 0.00001, 0.00001);
    const maxTxCount = d3.max(completeData, d => d.transaction_count) || 1;
    const minTxCount = 0;

    const normalizedData: TimeOfDayDataWithCongestion[] = completeData.map(d => {
      const normGas = (d.avg_gas_fee_usd - minGasFee) / (maxGasFee - minGasFee);
      const normTx = (d.transaction_count - minTxCount) / (maxTxCount - minTxCount);
      const congestion = normGas * normTx;
      return { ...d, congestion };
    });

    // Find the cell with the highest congestion
    const maxCongestionEntry = normalizedData.reduce((max, d) =>
      d.congestion > (max?.congestion || 0) ? d : max, null as TimeOfDayDataWithCongestion | null
    );

    // Scales
    const x = d3.scaleBand()
      .domain(hours.map(String))
      .range([0, innerWidth])
      .padding(0.05);

    const y = d3.scaleBand()
      .domain(dates)
      .range([0, innerHeight])
      .padding(0.05);

    // Filter dates for y-axis ticks (every 3 days)
    const tickInterval = 3;
    const filteredDates = dates.filter((_, i) => i % tickInterval === 0);

    // Log bandwidths to debug
    // console.log("X bandwidth:", x.bandwidth());
    // console.log("Y bandwidth:", y.bandwidth());

    // Color scale (logarithmic) for congestion
    const maxCongestion = d3.max(normalizedData, d => d.congestion) || 1;
    const minCongestion = Math.max(d3.min(normalizedData, d => d.congestion) || 0.00001, 0.00001);
    const colorScale = d3.scaleLog()
      .domain([minCongestion, maxCongestion])
      .range(["#e0f7fa", "#b71c1c"])
      .base(10)
      .clamp(true);

    // Generate custom tick values for the color legend
    const logMin = Math.log10(minCongestion);
    const logMax = Math.log10(maxCongestion);
    const tickCount = 5;
    const tickStep = (logMax - logMin) / (tickCount - 1);
    const colorTickValues = Array.from({ length: tickCount }, (_, i) => {
      const logValue = logMin + i * tickStep;
      return Math.pow(10, logValue);
    }).filter(val => val >= minCongestion && val <= maxCongestion);

    // SVG setup
    const g = svg.select("g.chart-group").empty()
      ? svg.append("g").attr("class", "chart-group").attr("transform", `translate(${margin.left},${margin.top})`)
      : svg.select("g.chart-group").attr("transform", `translate(${margin.left},${margin.top})`);

    // Heatmap cells
    const cells = g.selectAll(".cell")
      .data(normalizedData, d => `${d.event_date}-${d.hour_of_day}`);

    const cellsEnter = cells.enter()
      .append("rect")
      .attr("class", "cell")
      .attr("x", d => x(String(d.hour_of_day))!)
      .attr("y", d => y(d.event_date)!)
      .attr("width", x.bandwidth())
      .attr("height", y.bandwidth())
      .attr("fill", d => colorScale(d.congestion))
      .attr("opacity", 0);

    if (isFirstMount.current) {
      cellsEnter.merge(cells)
        .transition()
        .duration(500)
        .delay((d, i) => i * 10)
        .attr("opacity", 1);
    } else {
      cellsEnter.merge(cells)
        .attr("x", d => x(String(d.hour_of_day))!)
        .attr("y", d => y(d.event_date)!)
        .attr("width", x.bandwidth())
        .attr("height", y.bandwidth())
        .attr("fill", d => colorScale(d.congestion))
        .attr("opacity", 1);
    }

    cellsEnter.merge(cells)
      .on("mouseover", (event, d) => {
        if (tooltipRef.current) {
          tooltipRef.current.style.opacity = "1";
          tooltipRef.current.innerHTML = `Date: ${d.event_date}<br>Hour: ${d.hour_of_day}:00<br>Gas Fee: $${d.avg_gas_fee_usd.toFixed(2)} USD<br>Tx Count: ${d.transaction_count}<br>Congestion: ${(d.congestion * 100).toFixed(2)}%`;
          tooltipRef.current.style.left = `${event.pageX + 10}px`;
          tooltipRef.current.style.top = `${event.pageY - 10}px`;
        }
      })
      .on("mousemove", event => {
        if (tooltipRef.current) {
          tooltipRef.current.style.left = `${event.pageX + 10}px`;
          tooltipRef.current.style.top = `${event.pageY - 10}px`;
        }
      })
      .on("mouseout", () => {
        if (tooltipRef.current) {
          tooltipRef.current.style.opacity = "0";
        }
      });

    cells.exit().remove();

    // Highlight the most congested cell
    const highlight = g.selectAll(".highlight")
      .data(maxCongestionEntry ? [maxCongestionEntry] : []);

    const highlightEnter = highlight.enter()
      .append("rect")
      .attr("class", "highlight")
      .attr("x", d => x(String(d.hour_of_day))!)
      .attr("y", d => y(d.event_date)!)
      .attr("width", x.bandwidth())
      .attr("height", y.bandwidth())
      .attr("fill", "none")
      .attr("stroke", "#ffd700")
      .attr("stroke-width", 2)
      .attr("opacity", 0);

    if (isFirstMount.current) {
      highlightEnter.merge(highlight)
        .transition()
        .duration(500)
        .delay(normalizedData.length * 10)
        .attr("opacity", 1)
        .on("end", () => {
          isFirstMount.current = false;
        });
    } else {
      highlightEnter.merge(highlight)
        .attr("x", d => x(String(d.hour_of_day))!)
        .attr("y", d => y(d.event_date)!)
        .attr("width", x.bandwidth())
        .attr("height", y.bandwidth())
        .attr("opacity", 1);
    }

    highlight.exit().remove();

    // Axes
    if (isFirstMount.current) {
      g.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(x).tickFormat(d => `${d}:00`))
        .selectAll("text")
        .attr("fill", "#fff")
        .style("text-anchor", "end")
        .attr("dx", "-.8em")
        .attr("dy", ".15em")
        .attr("transform", "rotate(-45)");

      g.append("g")
        .attr("class", "y-axis")
        .call(d3.axisLeft(y).tickValues(filteredDates).tickFormat(d => d.slice(5)))
        .selectAll("text")
        .attr("fill", "#fff");

      // X-axis label
      g.append("text")
        .attr("class", "x-axis-label")
        .attr("x", innerWidth / 2)
        .attr("y", innerHeight + margin.bottom - 5)
        .attr("text-anchor", "middle")
        .attr("fill", "#fff");

      // Y-axis label
      g.append("text")
        .attr("class", "y-axis-label")
        .attr("transform", "rotate(-90)")
        .attr("x", -innerHeight / 2)
        .attr("y", -margin.left + 25)
        .attr("text-anchor", "middle")
        .attr("font-size", "12px")
        .attr("fill", "#fff")
        .text("Date");
    } else {
      g.select(".x-axis")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(x).tickFormat(d => `${d}:00`))
        .selectAll("text")
        .attr("fill", "#fff")
        .style("text-anchor", "end")
        .attr("dx", "-.8em")
        .attr("dy", ".15em")
        .attr("transform", "rotate(-45)");

      g.select(".y-axis")
        .call(d3.axisLeft(y).tickValues(filteredDates).tickFormat(d => d.slice(5)))
        .selectAll("text")
        .attr("fill", "#fff");

      g.select(".x-axis-label")
        .attr("x", innerWidth / 2)
        .attr("y", innerHeight + margin.bottom - 5);

      g.select(".y-axis-label")
        .attr("x", -innerHeight / 2)
        .attr("y", -margin.left + 20);
    }

    // Color legend
    const legendHeight = innerHeight * 0.8;
    const legendWidth = 20;
    const legendX = innerWidth + 20;
    const legendY = (innerHeight - legendHeight) / 2;

    const legendScale = d3.scaleLog()
      .domain([minCongestion, maxCongestion])
      .range([legendHeight, 0])
      .base(10);

    const legendAxis = d3.axisRight(legendScale)
      .tickValues(colorTickValues)
      .tickFormat(d => `${(d * 100).toFixed(0)}%`);

    // Gradient for legend
    if (isFirstMount.current) {
      const defs = svg.select("defs").empty() ? svg.append("defs") : svg.select("defs");
      const gradient = defs.select("#color-gradient").empty()
        ? defs.append("linearGradient").attr("id", "color-gradient")
        : defs.select("#color-gradient");
      gradient.attr("x1", "0%")
        .attr("y1", "100%")
        .attr("x2", "0%")
        .attr("y2", "0%");
      gradient.selectAll("stop").remove();
      gradient.append("stop")
        .attr("offset", "0%")
        .attr("stop-color", "#e0f7fa");
      gradient.append("stop")
        .attr("offset", "100%")
        .attr("stop-color", "#b71c1c");

      g.append("rect")
        .attr("class", "legend-rect")
        .attr("x", legendX)
        .attr("y", legendY)
        .attr("width", legendWidth)
        .attr("height", legendHeight)
        .attr("fill", "url(#color-gradient)");

      g.append("g")
        .attr("class", "legend-axis")
        .attr("transform", `translate(${legendX + legendWidth}, ${legendY})`)
        .call(legendAxis)
        .selectAll("text")
        .attr("fill", "#fff");

      g.append("text")
        .attr("class", "legend-label")
        .attr("x", legendX + legendWidth / 2)
        .attr("y", legendY - 30)
        .attr("x", legendX + 20)
        .attr("text-anchor", "middle")
        .attr("font-size", "12px")
        .attr("fill", "#fff")
        .text("Congestion");
    } else {
      g.select(".legend-rect")
        .attr("x", legendX)
        .attr("y", legendY)
        .attr("width", legendWidth)
        .attr("height", legendHeight);

      g.select(".legend-axis")
        .attr("transform", `translate(${legendX + legendWidth}, ${legendY})`)
        .call(legendAxis)
        .selectAll("text")
        .attr("fill", "#fff");

      g.select(".legend-label")
        .attr("x", legendX + legendWidth / 2)
        .attr("y", legendY - 10);
    }
  };

  useLayoutEffect(() => {
    renderChart();

    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
      resizeTimeoutRef.current = setTimeout(() => {
        renderChart();
      }, 100);
    });

    if (containerRef.current) resizeObserver.observe(containerRef.current);

    return () => {
      if (containerRef.current) resizeObserver.unobserve(containerRef.current);
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
    };
  }, [timeOfDayData]);

  useEffect(() => {
    return () => {
      isFirstMount.current = true;
    };
  }, []);

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%" }}>
      <svg ref={svgRef} style={{ width: "100%", height: "100%" }}></svg>
    </div>
  );
};

export default TimeOfDayChart;