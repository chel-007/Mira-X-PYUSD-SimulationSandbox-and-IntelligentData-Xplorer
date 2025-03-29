"use client";
import React, { useEffect, useRef } from "react";
import * as d3 from "d3";
import styles from "../../styles/Explore.module.css";

interface PoolMetricsData {
  pool_address: string;
  median_gas_fee_eth: number;
  swap_count: number;
  total_volume_usd: number;
  tvl_usd?: number;
  apr?: number;
}

interface PoolMetricsChartProps {
  data: PoolMetricsData[];
}

const PoolMetricsChart: React.FC<PoolMetricsChartProps> = ({ data }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const isFirstMount = useRef(true);
  const isAnimating = useRef(false);

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

  const renderChart = (width: number, height: number) => {
    if (!svgRef.current || !containerRef.current || !data.length) {
      console.log("Chart not rendering due to missing SVG, container, or data:", {
        svg: !!svgRef.current,
        container: !!containerRef.current,
        dataLength: data.length,
      });
      return;
    }

    const svg = d3.select(svgRef.current);
    const margin = { top: 20, right: 30, bottom: 40, left: 50 };
    const legendWidth = 150;
    const innerWidth = width - margin.left - margin.right - legendWidth;
    const innerHeight = height - margin.top - margin.bottom;

    // Only clear the SVG on the first render
    if (isFirstMount.current) {
      svg.selectAll("*").remove();
    }

    // Define metrics and colors
    const metrics = ["median_gas_fee_eth", "total_volume_usd", "tvl_usd", "apr"];
    const color = d3.scaleOrdinal()
      .domain(metrics)
      .range(["#FF9F1C", "#2AB7CA", "#FED766", "#E71D36"]);

    // Normalize median_gas_fee_eth and apr to [0, 1] using logarithmic scale
    const normalizedData = data.map(d => {
      const result: any = { ...d, original: {} };
      metrics.forEach(metric => {
        result.original[metric] = d[metric] || 0;
      });
      return result;
    });

    // Logarithmic scales for median_gas_fee_eth and apr (normalize to [0, 1])
    const scales: { [key: string]: d3.ScaleLogarithmic<number, number> } = {};
    ["median_gas_fee_eth", "apr"].forEach(metric => {
      const values = data.map(d => d[metric] || 0);
      const minValue = Math.max(d3.min(values)!, 0.0001); // Avoid log(0)
      const maxValue = d3.max(values)! * 1.1;
      scales[metric] = d3.scaleLog()
        .domain([minValue, maxValue])
        .range([0, 1])
        .base(10)
        .clamp(true);
    });

    // Apply normalization for median_gas_fee_eth and apr
    normalizedData.forEach(d => {
      ["median_gas_fee_eth", "apr"].forEach(metric => {
        const value = d[metric] || 0;
        d[metric] = value > 0 ? scales[metric](value) : 0;
      });
    });

    // Scales
    const x0 = d3.scaleBand()
      .domain(data.map(d => d.pool_address))
      .range([0, innerWidth])
      .padding(0.2);

    const x1 = d3.scaleBand()
      .domain(metrics)
      .range([0, x0.bandwidth()])
      .padding(0.1);

    // Y-axis for total_volume_usd and tvl_usd (logarithmic scale directly to height)
    const maxValue = d3.max(data, d => Math.max(d.total_volume_usd, d.tvl_usd || 0))! * 1.1;
    const minValue = d3.min(data, d => Math.min(d.total_volume_usd, d.tvl_usd || 0))! || 0.0001;
    const yLog = d3.scaleLog()
      .domain([minValue, maxValue])
      .range([innerHeight, 0])
      .base(10)
      .clamp(true);

    // Y-axis for normalized values (median_gas_fee_eth and apr)
    const yNormalized = d3.scaleLinear()
      .domain([0, 5])
      .range([innerHeight, 0]);

    const yNormalizedAPY = d3.scaleLinear()
      .domain([0, 2])
      .range([innerHeight, 0]);

    // SVG for chart
    const g = svg.select("g.chart-group").empty()
      ? svg.append("g").attr("class", "chart-group").attr("transform", `translate(${margin.left},${margin.top})`)
      : svg.select("g.chart-group").attr("transform", `translate(${margin.left},${margin.top})`);

    // Grouped bars
    const poolGroups = g.selectAll(".pool")
      .data(normalizedData, d => d.pool_address);

    const poolGroupsEnter = poolGroups.enter()
      .append("g")
      .attr("class", "pool")
      .attr("transform", d => `translate(${x0(d.pool_address)},0)`);

    poolGroupsEnter.merge(poolGroups)
      .attr("transform", d => `translate(${x0(d.pool_address)},0)`);

    poolGroups.exit().remove();

    const bars = poolGroupsEnter.merge(poolGroups)
      .selectAll("rect")
      .data(d => metrics.map(key => ({ key, value: d[key], original: d.original[key], swap_count: d.swap_count })), d => d.key);

    const barsEnter = bars.enter()
      .append("rect")
      .attr("x", d => x1(d.key)!)
      .attr("width", x1.bandwidth())
      .attr("fill", d => color(d.key) as string)
      .attr("y", innerHeight)
      .attr("height", 0);

    // Animate bars on first mount
    if (isFirstMount.current && !isAnimating.current) {
      console.log("Animating bars");
      console.log(isFirstMount);
      isAnimating.current = true;

      barsEnter.merge(bars)
        .transition()
        .duration(3000) // 3 seconds for the growth
        .delay((d, i, nodes) => {
          const poolIndex = Math.floor(i / metrics.length);
          const barIndex = i % metrics.length;
          return poolIndex * 200 + barIndex * 50; // Reduced delays for testing
        })
        .attr("y", d => {
          if (d.key === "median_gas_fee_eth") {
            return yNormalized(d.value);
          } else if (d.key === "apr") {
            return yNormalizedAPY(d.value);
          } else {
            return yLog(d.value);
          }
        })
        .attr("height", d => {
          if (d.key === "median_gas_fee_eth") {
            return innerHeight - yNormalized(d.value);
          } else if (d.key === "apr") {
            return innerHeight - yNormalizedAPY(d.value);
          } else {
            return innerHeight - yLog(d.value);
          }
        })
        .ease(d3.easeElasticOut.amplitude(1).period(0.5))
        .on("end", () => {
          isAnimating.current = false;
          isFirstMount.current = false;
          console.log(isFirstMount);
        });
    } else {
      barsEnter.merge(bars)
        .attr("x", d => x1(d.key)!)
        .attr("width", x1.bandwidth())
        .attr("y", d => {
          if (d.key === "median_gas_fee_eth") {
            return yNormalized(d.value);
          } else if (d.key === "apr") {
            return yNormalizedAPY(d.value);
          } else {
            return yLog(d.value);
          }
        })
        .attr("height", d => {
          if (d.key === "median_gas_fee_eth") {
            return innerHeight - yNormalized(d.value);
          } else if (d.key === "apr") {
            return innerHeight - yNormalizedAPY(d.value);
          } else {
            return innerHeight - yLog(d.value);
          }
        });
    }

    bars.exit().remove();

    // Add interaction events after animation setup
    barsEnter.merge(bars)
      .on("mouseover", (event, d) => {
        if (tooltipRef.current) {
          const tooltipText = d.key === "median_gas_fee_eth"
            ? `${d.key}: ${d.original.toFixed(6)} ETH\nSwaps: ${d.swap_count}`
            : `${d.key}: ${d.original.toFixed(2)}`;
          tooltipRef.current.style.opacity = "1";
          tooltipRef.current.innerHTML = tooltipText;
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

    // Axes
    if (isFirstMount.current) {
      g.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(x0).tickFormat(d => d.slice(0, 10) + "..."))
        .selectAll("text")
        .attr("fill", "#fff")
        .style("text-anchor", "middle");

      // Y-axis for total_volume_usd and tvl_usd (logarithmic)
      g.append("g")
        .attr("class", "y-axis-left")
        .call(d3.axisLeft(yLog).ticks(5, d3.format(".2s")))
        .selectAll("text")
        .attr("fill", "#fff")
        .append("text")
        .attr("fill", "#fff")
        .attr("transform", "rotate(-90)")
        .attr("y", 6)
        .attr("dy", "-3em")
        .attr("text-anchor", "end")
        .text("Volume/TVL (USD)");

      // Y-axis for normalized values (right side)
      g.append("g")
        .attr("class", "y-axis-right")
        .attr("transform", `translate(${innerWidth}, 0)`)
        .call(d3.axisRight(yNormalized).ticks(5, d3.format(".1f")))
        .selectAll("text")
        .attr("fill", "#fff")
        .append("text")
        .attr("fill", "#fff")
        .attr("transform", "rotate(90)")
        .attr("y", -6)
        .attr("dy", "-3em")
        .attr("text-anchor", "end")
        .text("Gas/APR (Normalized)");
    } else {
      g.select(".x-axis")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(x0).tickFormat(d => d.slice(0, 10) + "..."))
        .selectAll("text")
        .attr("fill", "#fff")
        .style("text-anchor", "middle");

      g.select(".y-axis-left")
        .call(d3.axisLeft(yLog).ticks(5, d3.format(".2s")))
        .selectAll("text")
        .attr("fill", "#fff");

      g.select(".y-axis-right")
        .attr("transform", `translate(${innerWidth}, 0)`)
        .call(d3.axisRight(yNormalized).ticks(5, d3.format(".1f")))
        .selectAll("text")
        .attr("fill", "#fff");
    }

    // Legend
    const legendContainer = d3.select(containerRef.current)
      .select(".legend-container")
      .style("width", `${legendWidth}px`)
      .style("height", `${innerHeight / 2}px`)
      .style("background", "#000")
      .style("color", "#fff")
      .style("padding", "10px")
      .style("justify-self", "flex-end")
      .style("box-sizing", "border-box");

    legendContainer.selectAll("*").remove();

    legendContainer.append("div")
      .style("font-size", "16px")
      .style("font-weight", "bold")
      .style("margin-bottom", "10px")
      .text("Metrics Points");

    const legendItems = legendContainer.selectAll(".legend-item")
      .data(metrics)
      .enter()
      .append("div")
      .style("display", "flex")
      .style("align-items", "center")
      .style("margin-bottom", "8px");

    legendItems.append("div")
      .style("width", "15px")
      .style("height", "15px")
      .style("background", d => color(d) as string)
      .style("margin-right", "8px");

    legendItems.append("span")
      .style("font-size", "14px")
      .text(d => d.replace("_usd", "").replace("_eth", ""));
  };

  useEffect(() => {
    let resizeTimeout: NodeJS.Timeout | null = null;

    const updateChartSize = () => {
      if (containerRef.current && svgRef.current) {
        const width = containerRef.current.clientWidth || 600;
        const height = containerRef.current.clientHeight || 400;
        if (data.length) renderChart(width, height);
      }
    };

    updateChartSize();

    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        updateChartSize();
      }, 200); // Increased debounce to 200ms
    });

    if (containerRef.current) resizeObserver.observe(containerRef.current);

    return () => {
      if (containerRef.current) resizeObserver.unobserve(containerRef.current);
      if (resizeTimeout) clearTimeout(resizeTimeout);
    };
  }, [data]);

  useEffect(() => {
    return () => {
      isFirstMount.current = true;
      isAnimating.current = false;
    };
  }, []);

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", display: "flex", flexDirection: "row", justifyContent: "center" }}>
      <svg ref={svgRef} style={{ width: "100%", height: "100%" }}></svg>
      <div style={{ justifySelf: "flex-end" }} className="legend-container"></div>
    </div>
  );
};

export default PoolMetricsChart;


// "use client";
// import React, { useEffect, useRef, useState, useLayoutEffect } from "react";
// import * as d3 from "d3";
// import styles from "../../styles/Explore.module.css";

// interface PoolMetricsData {
//   pool_address: string;
//   median_gas_fee_eth: number;
//   swap_count: number;
//   total_volume_usd: number;
//   tvl_usd?: number;
//   apr?: number;
// }

// interface PoolMetricsChartProps {
//   data: PoolMetricsData[];
// }

// const PoolMetricsChart: React.FC<PoolMetricsChartProps> = ({ data }) => {
//   const svgRef = useRef<SVGSVGElement | null>(null);
//   const containerRef = useRef<HTMLDivElement | null>(null);
//   const tooltipRef = useRef<HTMLDivElement | null>(null);
//   const [dimensions, setDimensions] = useState({ width: 600, height: 400 });
//   const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

//   // Create tooltip once
//   useEffect(() => {
//     const tooltip = document.createElement("div");
//     tooltip.className = "tooltip";
//     tooltip.style.position = "absolute";
//     tooltip.style.background = "rgba(0, 0, 0, 0.8)";
//     tooltip.style.color = "#fff";
//     tooltip.style.padding = "5px 10px";
//     tooltip.style.borderRadius = "4px";
//     tooltip.style.pointerEvents = "none";
//     tooltip.style.opacity = "0";
//     tooltip.style.zIndex = "1000";
//     document.body.appendChild(tooltip);
//     tooltipRef.current = tooltip;

//     return () => {
//       if (tooltipRef.current) {
//         document.body.removeChild(tooltipRef.current);
//         tooltipRef.current = null;
//       }
//     };
//   }, []);

//   const renderChart = () => {
//     if (!svgRef.current || !containerRef.current || !data.length) return;

//     const svg = d3.select(svgRef.current);
//     const margin = { top: 20, right: 30, bottom: 40, left: 50 };
//     const legendWidth = 150;
//     const width = dimensions.width - margin.left - margin.right - legendWidth;
//     const height = dimensions.height - margin.top - margin.bottom;

//     svg.selectAll("*").remove();

//     // Define metrics and colors
//     const metrics = ["median_gas_fee_eth", "total_volume_usd", "tvl_usd", "apr"];
//     const color = d3.scaleOrdinal()
//       .domain(metrics)
//       .range(["#FF9F1C", "#2AB7CA", "#FED766", "#E71D36"]);

//     // Normalize median_gas_fee_eth and apr to [0, 1] using logarithmic scale
//     const normalizedData = data.map(d => {
//       const result: any = { ...d, original: {} };
//       metrics.forEach(metric => {
//         result.original[metric] = d[metric] || 0;
//       });
//       return result;
//     });

//     // Logarithmic scales for median_gas_fee_eth and apr (normalize to [0, 1])
//     const scales: { [key: string]: d3.ScaleLogarithmic<number, number> } = {};
//     ["median_gas_fee_eth", "apr"].forEach(metric => {
//       const values = data.map(d => d[metric] || 0);
//       const minValue = Math.max(d3.min(values)!, 0.0001); // Avoid log(0)
//       const maxValue = d3.max(values)! * 1.1;
//       scales[metric] = d3.scaleLog()
//         .domain([minValue, maxValue])
//         .range([0, 1])
//         .base(10)
//         .clamp(true);
//     });

//     // Apply normalization for median_gas_fee_eth and apr
//     normalizedData.forEach(d => {
//       ["median_gas_fee_eth", "apr"].forEach(metric => {
//         const value = d[metric] || 0;
//         d[metric] = value > 0 ? scales[metric](value) : 0;
//       });
//     });

//     // Scales
//     const x0 = d3.scaleBand()
//       .domain(data.map(d => d.pool_address))
//       .range([0, width])
//       .padding(0.2);

//     const x1 = d3.scaleBand()
//       .domain(metrics)
//       .range([0, x0.bandwidth()])
//       .padding(0.1);

//     // Y-axis for total_volume_usd and tvl_usd (logarithmic scale directly to height)
//     const maxValue = d3.max(data, d => Math.max(d.total_volume_usd, d.tvl_usd || 0))! * 1.1;
//     const minValue = d3.min(data, d => Math.min(d.total_volume_usd, d.tvl_usd || 0))! || 0.0001;
//     const yLog = d3.scaleLog()
//       .domain([minValue, maxValue])
//       .range([height, 0])
//       .base(10)
//       .clamp(true);

//     // Y-axis for normalized values (median_gas_fee_eth and apr)
//     const yNormalized = d3.scaleLinear()
//       .domain([0, 5])
//       .range([height, 0]);

//     const yNormalizedAPY = d3.scaleLinear()
//       .domain([0, 2])
//       .range([height, 0]);

//     // SVG for chart
//     const g = svg
//       .attr("width", width + margin.left + margin.right)
//       .attr("height", height + margin.top + margin.bottom)
//       .append("g")
//       .attr("transform", `translate(${margin.left},${margin.top})`);

//     // Grouped bars
//     const poolGroups = g.selectAll(".pool")
//       .data(normalizedData)
//       .enter()
//       .append("g")
//       .attr("class", "pool")
//       .attr("transform", d => `translate(${x0(d.pool_address)},0)`);

//     poolGroups.selectAll("rect")
//       .data(d => metrics.map(key => ({ key, value: d[key], original: d.original[key], swap_count: d.swap_count })))
//       .enter()
//       .append("rect")
//       .attr("x", d => x1(d.key)!)
//       .attr("y", d => {
//         if (d.key === "median_gas_fee_eth") {
//           return yNormalized(d.value);
//         } else if (d.key === "apr"){
//           return yNormalizedAPY(d.value);
//         }
//         else {
//           return yLog(d.value);
//         }
//       })
//       .attr("width", x1.bandwidth())
//       .attr("height", d => {
//         if (d.key === "median_gas_fee_eth") {
//           return height - yNormalized(d.value);
//         } else if (d.key === "apr"){
//             return height - yNormalizedAPY(d.value);
//           }
//         else {
//           return height - yLog(d.value);
//         }
//       })
//       .attr("fill", d => color(d.key) as string)
//       .on("mouseover", (event, d) => {
//         if (tooltipRef.current) {
//           const tooltipText = d.key === "median_gas_fee_eth"
//             ? `${d.key}: ${d.original.toFixed(6)} ETH\nSwaps: ${d.swap_count}`
//             : `${d.key}: ${d.original.toFixed(2)}`;
//           tooltipRef.current.style.opacity = "1";
//           tooltipRef.current.innerHTML = tooltipText;
//           tooltipRef.current.style.left = `${event.pageX + 10}px`;
//           tooltipRef.current.style.top = `${event.pageY - 10}px`;
//         }
//       })
//       .on("mousemove", event => {
//         if (tooltipRef.current) {
//           tooltipRef.current.style.left = `${event.pageX + 10}px`;
//           tooltipRef.current.style.top = `${event.pageY - 10}px`;
//         }
//       })
//       .on("mouseout", () => {
//         if (tooltipRef.current) {
//           tooltipRef.current.style.opacity = "0";
//         }
//       });

//     // Axes
//     g.append("g")
//       .attr("transform", `translate(0,${height})`)
//       .call(d3.axisBottom(x0).tickFormat(d => d.slice(0, 10) + "..."));

//     // Y-axis for total_volume_usd and tvl_usd (logarithmic)
//     g.append("g")
//       .call(d3.axisLeft(yLog).ticks(5, d3.format(".2s")))
//       .append("text")
//       .attr("fill", "#fff")
//       .attr("transform", "rotate(-90)")
//       .attr("y", 6)
//       .attr("dy", "-3em")
//       .attr("text-anchor", "end")
//       .text("Volume/TVL (USD)");

//     // Y-axis for normalized values (right side)
//     g.append("g")
//       .attr("transform", `translate(${width}, 0)`)
//       .call(d3.axisRight(yNormalized).ticks(5, d3.format(".1f")))
//       .append("text")
//       .attr("fill", "#fff")
//       .attr("transform", "rotate(90)")
//       .attr("y", -6)
//       .attr("dy", "-3em")
//       .attr("text-anchor", "end")
//       .text("Gas/APR (Normalized)");

//     // Legend
//     const legendContainer = d3.select(containerRef.current)
//       .select(".legend-container")
//       .style("width", `${legendWidth}px`)
//       .style("height", `${dimensions.height}px`)
//       .style("background", "#000")
//       .style("color", "#fff")
//       .style("padding", "10px")
//       .style("box-sizing", "border-box");

//     legendContainer.selectAll("*").remove();

//     legendContainer.append("div")
//       .style("font-size", "16px")
//       .style("font-weight", "bold")
//       .style("margin-bottom", "10px")
//       .text("Metrics Points");

//     const legendItems = legendContainer.selectAll(".legend-item")
//       .data(metrics)
//       .enter()
//       .append("div")
//       .style("display", "flex")
//       .style("align-items", "center")
//       .style("margin-bottom", "8px");

//     legendItems.append("div")
//       .style("width", "15px")
//       .style("height", "15px")
//       .style("background", d => color(d) as string)
//       .style("margin-right", "8px");

//     legendItems.append("span")
//       .style("font-size", "14px")
//       .text(d => d.replace("_usd", "").replace("_eth", ""));
//   };

//   useLayoutEffect(() => {
//     const handleResize = () => {
//       if (resizeTimeoutRef.current) {
//         clearTimeout(resizeTimeoutRef.current);
//       }
//       resizeTimeoutRef.current = setTimeout(() => {
//         if (containerRef.current) {
//           setDimensions({
//             width: containerRef.current.clientWidth,
//             height: containerRef.current.clientHeight,
//           });
//         }
//       }, 100);
//     };

//     renderChart();

//     const resizeObserver = new ResizeObserver(() => handleResize());
//     if (containerRef.current) resizeObserver.observe(containerRef.current);

//     return () => {
//       if (containerRef.current) resizeObserver.unobserve(containerRef.current);
//       if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
//     };
//   }, [data, dimensions]);

//   return (
//     <div ref={containerRef} style={{ width: "100%", height: "400px", display: "flex" }}>
//       <svg ref={svgRef}></svg>
//       <div className="legend-container"></div>
//     </div>
//   );
// };

// export default PoolMetricsChart;