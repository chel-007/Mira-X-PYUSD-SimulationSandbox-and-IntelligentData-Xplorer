

"use client";
import React, { useEffect, useRef } from "react";
import * as d3 from "d3";
interface SwapVolumeData {
  pool_address: string;
  date: string;
  total_volume_usd: number;
}

interface SwapVolumeChartProps {
  swapVolumeData: SwapVolumeData[];
  onDownload?: () => void;
}

const SwapVolumeChart: React.FC<SwapVolumeChartProps> = ({ swapVolumeData, onDownload }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const isFirstMount = useRef(true);

  const colors = { text: "#fff", hover: "#7BCFFF" };
  const poolColors = ["#0253a3", "#7BCFFF", "#1E90FF", "#FFD700", "#32CD32"];

  const formatVolume = (value: number) => {
    if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
    return value.toFixed(2);
  };

  const renderChart = (swapVolumeData: SwapVolumeData[], width: number, height: number, animate: boolean) => {
    if (!svgRef.current || !Array.isArray(swapVolumeData) || !swapVolumeData.length) return;

    const svg = d3.select(svgRef.current);
    const margin = { top: 40, right: 80, bottom: 60, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    svg.selectAll("*").remove();

    const bgGradient = svg.append("defs")
      .append("linearGradient")
      .attr("id", "bgGradient")
      .attr("x1", "0%").attr("y1", "0%").attr("x2", "0%").attr("y2", "100%");
    bgGradient.append("stop").attr("offset", "0%").attr("stop-color", "#010214");
    bgGradient.append("stop").attr("offset", "100%").attr("stop-color", "#020428");

    svg.insert("rect", ":first-child")
      .attr("width", width)
      .attr("height", height)
      .attr("fill", "url(#bgGradient)");

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const parseDate = d3.timeParse("%Y-%m-%d");
    const currentDate = new Date(); // Dynamic current date (e.g., today, April 5, 2025)
    const oneMonthAgo = new Date(currentDate);
    oneMonthAgo.setDate(currentDate.getDate() - 30);

    // console.log("swapvolumedata", swapVolumeData)

    const filteredData = swapVolumeData.filter(item => {
      const itemDate = parseDate(item.date);
      return itemDate && itemDate >= oneMonthAgo && itemDate <= currentDate;
    });

    if (!filteredData.length) return;

    const dates = [...new Set(filteredData.map(item => item.date))].sort();
    const poolAddresses = [...new Set(filteredData.map(item => item.pool_address))];

    const groupedData = dates.map(date => {
      const entry: { date: string; [key: string]: number | string } = { date };
      poolAddresses.forEach(pool => {
        const item = filteredData.find(d => d.date === date && d.pool_address === pool);
        entry[pool] = item ? item.total_volume_usd : 0;
      });
      return entry;
    });

    const poolVolumes = poolAddresses.map(pool => {
      const totalVolume = filteredData
        .filter(d => d.pool_address === pool)
        .reduce((sum, d) => sum + d.total_volume_usd, 0);
      const count = filteredData.filter(d => d.pool_address === pool).length;
      return { pool, avgVolume: count > 0 ? totalVolume / count : 0 };
    });

    poolVolumes.sort((a, b) => a.avgVolume - b.avgVolume);
    const sortedPoolAddresses = poolVolumes.map(p => p.pool);

    const stackedData = d3.stack()
      .keys(sortedPoolAddresses)
      .value((d, key) => d[key])(groupedData);

      const x = d3.scaleTime()
      .domain([d3.timeDay.offset(parseDate(dates[0]), -1), parseDate(dates[dates.length - 1])])
      .range([0, innerWidth]);
    
    const minNonZeroVolume = d3.min(swapVolumeData, d => d.total_volume_usd > 0 ? d.total_volume_usd : Infinity) || 1;
    const maxStackedValue = d3.max(stackedData, d => d3.max(d, d => d[1])) || 1;
    
    const y = d3.scaleSqrt()
      .domain([0, maxStackedValue * 1.5])
      .range([innerHeight, 0]);
    
    const yTickValues = d3.range(0, maxStackedValue * 1.5, 5e6);
    
    const color = d3.scaleOrdinal()
      .domain(poolAddresses)
      .range(poolColors.concat(d3.schemeCategory10));
    
    const widthPerDay = x(parseDate(dates[0]).getTime() + 86400000) - x(parseDate(dates[0]));
    const barWidth = widthPerDay * 0.8;
    
    const barData = dates.map((date, i) => ({
      date,
      dateIndex: i,
      segments: sortedPoolAddresses.map((pool, j) => {
        const rawY0 = stackedData[j][i][0];
        const rawY1 = stackedData[j][i][1];
        return {
          pool,
          y0: rawY0,
          y1: rawY1,
          rawVolume: rawY1 - rawY0,
          color: color(pool),
          dateIndex: i,
        };
      }),
    }));

    const barGroups = g.selectAll(".bar-group")
      .data(barData, d => d.date);

    const barGroupsEnter = barGroups.enter()
      .append("g")
      .attr("class", "bar-group")
      .attr("transform", d => `translate(${x(parseDate(d.date)) - barWidth / 2}, 0)`);

    barGroupsEnter.merge(barGroups)
      .attr("transform", d => `translate(${x(parseDate(d.date)) - barWidth / 2}, 0)`);

    barGroups.exit().remove();

    barGroupsEnter.each(function(d) {
      const group = d3.select(this);
      const rects = group.selectAll("rect")
        .data(d.segments)
        .enter()
        .append("rect")
        .attr("x", 0)
        .attr("width", barWidth)
        .attr("y", innerHeight)
        .attr("height", 0)
        .attr("fill", seg => seg.color)
        .attr("rx", 2);
    
      rects.each(function(seg) {
        // console.log(`Pool: ${seg.pool}, Date: ${d.date}, y0: ${seg.y0}, y1: ${seg.y1}, y(y0): ${y(seg.y0)}, y(y1): ${y(seg.y1)}, height: ${y(seg.y0) - y(seg.y1)}`);
      });
    
      rects.transition()
        .duration(1000)
        .ease(d3.easeBounce)
        .delay(seg => seg.dateIndex * 100)
        .attr("y", seg => Math.max(y(seg.y1), 0))
        .attr("height", seg => {
          const y0Pos = Math.min(y(seg.y0), innerHeight);
          const y1Pos = Math.max(y(seg.y1), 0);
          const height = y0Pos - y1Pos;
          return height > 0 ? height : 5;
        });
    });
    
    const tooltip = g.append("g")
      .attr("class", "tooltip")
      .style("opacity", 0)
      .style("pointer-events", "none");

    tooltip.append("rect")
      .attr("fill", "rgba(0, 0, 0, 0.8)")
      .attr("rx", 3);

    const tooltipText = tooltip.append("text")
      .attr("fill", colors.text)
      .attr("font-size", "12px")
      .attr("font-weight", 200)
      .attr("font-family", "Josefin Sans, sans-serif");

    barGroupsEnter.each(function(d) {
      const group = d3.select(this);
      const rects = group.selectAll("rect");

      rects
        .on("mouseover", (event, seg) => {
          d3.select(event.currentTarget).attr("opacity", 0.8);
          const fullText = `${seg.pool.slice(0, 4)}...${seg.pool.slice(-4)}: ${formatVolume(seg.rawVolume)} on ${d.date}`;

          tooltipText.selectAll("tspan").remove();

          tooltipText.append("tspan")
            .attr("x", 0)
            .attr("dy", 0)
            .text(fullText);

          const maxWidth = 200;
          const textWidth = tooltipText.node()?.getBBox().width || 0;

          if (textWidth > maxWidth) {
            const ellipsis = "...";
            let truncatedText = fullText;
            while ((tooltipText.text(truncatedText + ellipsis).node()?.getBBox().width || 0) > maxWidth && truncatedText.length > 0) {
              truncatedText = truncatedText.slice(0, -1);
            }
            tooltipText.text(truncatedText + ellipsis);
          }

          const bbox = tooltipText.node().getBBox();
          tooltip.select("rect")
            .attr("x", bbox.x - 5)
            .attr("y", bbox.y - 5)
            .attr("width", bbox.width + 10)
            .attr("height", bbox.height + 10);

          const xPos = x(parseDate(d.date)) + barWidth / 2;
          const yPos = Math.max(y(seg.y1), 0) - 10;
          const chartRightEdge = innerWidth;
          const tooltipWidth = bbox.width + 10;
          const adjustedX = (xPos + tooltipWidth > chartRightEdge) 
            ? chartRightEdge - tooltipWidth 
            : xPos;

          tooltip
            .attr("transform", `translate(${adjustedX},${yPos})`)
            .style("opacity", 1);
        })
        .on("mousemove", (event, seg) => {
          const xPos = x(parseDate(d.date)) + barWidth / 2;
          const yPos = Math.max(y(seg.y1), 0) - 10;
          const chartRightEdge = innerWidth;
          const tooltipWidth = tooltip.select("rect").node()?.getBBox().width || 150;
          const adjustedX = (xPos + tooltipWidth > chartRightEdge) 
            ? chartRightEdge - tooltipWidth 
            : xPos;

          tooltip.attr("transform", `translate(${adjustedX},${yPos})`);
        })
        .on("mouseout", (event) => {
          d3.select(event.currentTarget).attr("opacity", 1);
          tooltip.style("opacity", 0);
        });
    });

    const xTickInterval = d3.timeDay.every(1);
    g.append("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).ticks(xTickInterval).tickFormat(d3.timeFormat("%b %d")))
    .selectAll("text")
    .attr("fill", colors.text)
    .style("text-anchor", "end")
    .attr("dx", "-.8em")
    .attr("dy", ".15em")
    .attr("transform", "rotate(-45)");

    // Fixed ticks with 0.0M at base
    const logMin = Math.floor(Math.log10(minNonZeroVolume));
    const logMax = Math.ceil(Math.log10(maxStackedValue)) + 1;

    g.append("g")
      .attr("class", "y-axis")
      .call(d3.axisLeft(y).tickValues(yTickValues).tickFormat(d => `${(d / 1e6).toFixed(1)}M`))
      .selectAll("text")
      .attr("fill", colors.text);

    g.append("g")
      .attr("class", "grid")
      .call(d3.axisLeft(y).tickValues(yTickValues).tickSize(-innerWidth).tickFormat(() => ""))
      .selectAll("line")
      .attr("stroke", "rgba(255, 255, 255, 0.1)");

const poolDetails = {
  [sortedPoolAddresses[0]]: { description: "(py/crv)", link: "https://curve.fi/dex/ethereum/pools/factory-stable-ng-42/deposit/" },
  [sortedPoolAddresses[1]]: { description: "(PayPool)", link: "https://curve.fi/dex/ethereum/pools/factory-stable-ng-43/deposit/" },
};

const legend = g.selectAll(".legend").data(sortedPoolAddresses, d => d);
const legendEnter = legend.enter()
  .append("g")
  .attr("class", "legend")
  .attr("transform", (d, i) => `translate(${i * 150}, -20)`);

legendEnter.append("rect")
  .attr("x", 0)
  .attr("y", 0)
  .attr("width", 15)
  .attr("height", 15)
  .attr("fill", d => color(d) as string);

// Clickable pool address text
const addressText = legendEnter.append("text")
  .attr("x", 20)
  .attr("y", 12)
  .attr("fill", colors.text)
  .style("cursor", "pointer")
  .text(d => `${d.slice(0, 4)}...${d.slice(-4)}`)
  .on("click", (event, d) => {
    window.open(poolDetails[d].link, "_blank");
  });

legendEnter.append("text")
  .attr("x", 100)
  .attr("y", 12)
  .attr("fill", colors.text)
  .attr("font-size", "10px")
  .text(d => poolDetails[d].description);

// Hover effect on address text
addressText
  .on("mouseover", (event, d) => {
    d3.select(event.currentTarget).attr("fill", colors.hover || "#FFD700");
  })
  .on("mouseout", (event, d) => {
    d3.select(event.currentTarget).attr("fill", colors.text);
  });

legend.exit().remove();
  };

  const handleDownload = () => {
    if (!svgRef.current) return;

    const svg = svgRef.current;
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      canvas.width = svg.clientWidth;
      canvas.height = svg.clientHeight;
      ctx?.drawImage(img, 0, 0);
      const png = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = "swap-volume-chart.png";
      link.href = png;
      link.click();
      URL.revokeObjectURL(url);
    };

    img.src = url;
    if (onDownload) onDownload();
  };

  useEffect(() => {
    let resizeTimeout: NodeJS.Timeout | null = null;

    const updateChartSize = () => {
      if (chartContainerRef.current && svgRef.current && Array.isArray(swapVolumeData) && swapVolumeData.length) {
        const width = chartContainerRef.current.clientWidth || 600;
        const height = chartContainerRef.current.clientHeight || 400;
        renderChart(swapVolumeData, width, height, isFirstMount.current);
        isFirstMount.current = false;
      }
    };

    updateChartSize();

    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        updateChartSize();
      }, 200);
    });

    if (chartContainerRef.current) resizeObserver.observe(chartContainerRef.current);

    return () => {
      if (chartContainerRef.current) resizeObserver.unobserve(chartContainerRef.current);
      if (resizeTimeout) clearTimeout(resizeTimeout);
    };
  }, [swapVolumeData]);

  

  return (
    <div ref={chartContainerRef} style={{ width: "100%", height: "100%" }}>
      <svg ref={svgRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
};

export default SwapVolumeChart;


// "use client";
// import React, { useLayoutEffect, useRef, useState } from "react";
// import * as d3 from "d3";
// import styles from "../../styles/Explore.module.css";

// interface SwapVolumeData {
//   pool_address: string;
//   date: string;
//   total_volume_usd: number;
// }

// interface SwapVolumeChartProps {
  
//   data: SwapVolumeData[];
//   onZoom?: () => void;
//   onPan?: () => void;
//   onDownload?: () => void;
// }

// const SwapVolumeChart: React.FC<SwapVolumeChartProps> = ({ data, onZoom, onPan, onDownload }) => {
//   const svgRef = useRef<SVGSVGElement | null>(null);
//   const chartContainerRef = useRef<HTMLDivElement>(null);
//   const isFirstMount = useRef(true);
//   const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
//   const [zoomLevel, setZoomLevel] = useState(1); // State for zoom level
//   const [panOffset, setPanOffset] = useState(0); // State for panning offset

//   const colors = {
//     primary: "#7BCFFF",
//     secondary: "#357abd",
//     tertiary: "#818499",
//     background: "rgba(129, 132, 153, 0.08)",
//     text: "#fff",
//   };

//   const renderChart = (data: SwapVolumeData[], width: number, height: number, animate: boolean) => {
//     if (!svgRef.current || !Array.isArray(data) || !data.length) {
//       console.log("renderChart - Invalid data:", data);
//       return;
//     }

//     const svg = d3.select(svgRef.current);
//     const margin = { top: 20, right: 80, bottom: 60, left: 60 };
//     let innerWidth = width - margin.left - margin.right;
//     let innerHeight = height - margin.top - margin.bottom;

//     // Apply zoom and pan transformations
//     innerWidth = innerWidth * zoomLevel;
//     const xOffset = panOffset * innerWidth; // Panning offset
    

//     // Set the viewBox for responsive scaling
//     svg.attr("viewBox", `0 0 ${width} ${height}`).attr("preserveAspectRatio", "xMidYMid meet");

//     // Clear previous content
//     svg.selectAll("*").remove();

//     const g = svg
//       .append("g")
//       .attr("transform", `translate(${margin.left},${margin.top})`);

//     const parseDate = d3.timeParse("%Y-%m-%d");

//     // Filter data to the last 30 days
//     const currentDate = new Date("2025-03-27");
//     const oneMonthAgo = new Date(currentDate);
//     oneMonthAgo.setDate(currentDate.getDate() - 30);

//     const filteredData = data.filter(item => {
//       const itemDate = parseDate(item.date);
//       return itemDate && itemDate >= oneMonthAgo && itemDate <= currentDate;
//     });

//     if (!filteredData.length) {
//       console.log("No data available for the last 30 days.");
//       return;
//     }

//     // Extract unique dates and pool addresses from filtered data
//     const dates = [...new Set(filteredData.map(item => item.date))].sort();
//     const poolAddresses = [...new Set(filteredData.map(item => item.pool_address))];

//     // Group data by date for stacking
//     const groupedData = dates.map(date => {
//       const entry: { date: string; [key: string]: number | string } = { date };
//       poolAddresses.forEach(pool => {
//         const item = filteredData.find(d => d.date === date && d.pool_address === pool);
//         entry[pool] = item ? item.total_volume_usd : 0;
//       });
//       return entry;
//     });

//     // Calculate average volume per pool to determine stacking order
//     const poolVolumes = poolAddresses.map(pool => {
//       const totalVolume = filteredData
//         .filter(d => d.pool_address === pool)
//         .reduce((sum, d) => sum + d.total_volume_usd, 0);
//       const count = filteredData.filter(d => d.pool_address === pool).length;
//       return { pool, avgVolume: count > 0 ? totalVolume / count : 0 };
//     });

//     poolVolumes.sort((a, b) => a.avgVolume - b.avgVolume);
//     const sortedPoolAddresses = poolVolumes.map(p => p.pool);

//     const stackedData = d3.stack()
//       .keys(sortedPoolAddresses)
//       .value((d, key) => d[key])(groupedData);

//     const x = d3.scaleTime()
//       .domain([oneMonthAgo, currentDate])
//       .range([xOffset, innerWidth + xOffset]); // Adjust range for panning

//     const minNonZeroVolume = d3.min(filteredData, d => d.total_volume_usd > 0 ? d.total_volume_usd : Infinity) || 1;
//     const maxStackedValue = d3.max(stackedData, d => d3.max(d, d => d[1])) || 1;

//     const y = d3.scaleLog()
//       .domain([minNonZeroVolume, maxStackedValue])
//       .range([innerHeight, 0])
//       .base(10);

//     const color = d3.scaleOrdinal()
//       .domain(poolAddresses)
//       .range([colors.primary, colors.secondary, colors.tertiary]);

//     const gradientDefs = svg.append("defs");

//     const filter = svg.append("defs")
//       .append("filter")
//       .attr("id", "glow")
//       .attr("x", "-50%")
//       .attr("y", "-50%")
//       .attr("width", "50%")
//       .attr("height", "200%");

//     filter.append("feGaussianBlur")
//       .attr("stdDeviation", "1")
//       .attr("result", "blur");

//     filter.append("feMerge")
//       .append("feMergeNode")
//       .attr("in", "blur");

//     poolAddresses.forEach((pool, i) => {
//       const gradient = gradientDefs.append("linearGradient")
//         .attr("id", `gradient-${i}`)
//         .attr("x1", "0%")
//         .attr("y1", "0%")
//         .attr("x2", "0%")
//         .attr("y2", "100%");

//       gradient.append("stop")
//         .attr("offset", "0%")
//         .attr("stop-color", color(pool) as string)
//         .attr("stop-opacity", 0.7);

//       gradient.append("stop")
//         .attr("offset", "100%")
//         .attr("stop-color", color(pool) as string)
//         .attr("stop-opacity", 0.3);
//     });

//     const area = d3.area()
//       .curve(d3.curveCatmullRom.alpha(0.7))
//       .x(d => x(parseDate(d.data.date) as Date))
//       .y0(d => d[0] === 0 ? innerHeight : y(d[0]))
//       .y1(d => y(d[1]));

//     const initialArea = d3.area()
//       .curve(d3.curveCatmullRom.alpha(0.7))
//       .x(d => x(parseDate(d.data.date) as Date))
//       .y0(innerHeight)
//       .y1(innerHeight);

//     const areas = g.selectAll(".area")
//       .data(stackedData, d => d.key);

//     const areaEnter = areas.enter()
//       .append("path")
//       .attr("class", "area")
//       .attr("fill", (d, i) => `url(#gradient-${i})`)
//       .attr("d", initialArea);

//     if (animate) {
//       areaEnter
//         .merge(areas)
//         .transition()
//         .duration(1000)
//         .attr("d", area);
//     } else {
//       areaEnter
//         .merge(areas)
//         .attr("d", area);
//     }

//     areas.exit().remove();

//     const line = d3.line()
//       .curve(d3.curveCatmullRom.alpha(0.7))
//       .x(d => x(parseDate(d.data.date) as Date))
//       .y(d => y(d[1]));

//     const lines = g.selectAll(".line")
//       .data(stackedData, d => d.key);

//     const lineEnter = lines.enter()
//       .append("path")
//       .attr("class", "line")
//       .attr("fill", "none")
//       .attr("stroke", (d, i) => color(d.key) as string)
//       .attr("stroke-width", 1.5)
//       .style("filter", "url(#glow)")
//       .attr("d", initialArea);

//     if (animate) {
//       lineEnter
//         .merge(lines)
//         .transition()
//         .duration(1000)
//         .attr("d", line);
//     } else {
//       lineEnter
//         .merge(lines)
//         .attr("d", line);
//     }

//     lines.exit().remove();

//     const tooltip = d3.select("body").selectAll(`.${styles.tooltip}`)
//       .data([null])
//       .join("div")
//       .attr("class", styles.tooltip)
//       .style("position", "absolute")
//       .style("visibility", "hidden")
//       .style("background", "#333")
//       .style("color", colors.text)
//       .style("padding", "5px")
//       .style("border-radius", "3px");

//     g.selectAll(".area")
//       .on("mouseover", function (event, d) {
//         d3.select(this).attr("opacity", 1);
//         const mouseX = d3.pointer(event, this)[0];
//         const dateAtMouse = x.invert(mouseX - margin.left);
//         const closestDate = dates.reduce((a, b) =>
//           Math.abs(parseDate(a)!.getTime() - dateAtMouse.getTime()) <
//           Math.abs(parseDate(b)!.getTime() - dateAtMouse.getTime())
//             ? a
//             : b
//         );
//         const dateData = groupedData.find(g => g.date === closestDate);
//         const volume = dateData ? (dateData[d.key] as number) : 0;
//         tooltip.style("visibility", "visible")
//           .text(`${d.key}: ${volume.toFixed(2)} USD`);
//       })
//       .on("mousemove", (event) => {
//         tooltip.style("top", `${event.pageY - 10}px`)
//           .style("left", `${event.pageX + 10}px`);
//       })
//       .on("mouseout", function () {
//         d3.select(this).attr("opacity", 0.8);
//         tooltip.style("visibility", "hidden");
//       });

//     g.append("g")
//       .attr("class", "x-axis")
//       .attr("transform", `translate(0,${innerHeight})`)
//       .call(d3.axisBottom(x).ticks(d3.timeDay.every(7)))
//       .selectAll("text")
//       .attr("fill", colors.text)
//       .style("text-anchor", "end")
//       .attr("dx", "-.8em")
//       .attr("dy", ".15em")
//       .attr("transform", "rotate(-45)");

//     g.append("g")
//       .attr("class", "y-axis")
//       .call(d3.axisLeft(y).ticks(5).tickFormat(d => `${(d / 1e6).toFixed(1)}M`))
//       .selectAll("text")
//       .attr("fill", colors.text);

//     const legend = g.selectAll(".legend").data(sortedPoolAddresses, d => d);
//     const legendEnter = legend.enter()
//       .append("g")
//       .attr("class", "legend")
//       .attr("transform", (d, i) => `translate(${innerWidth - 70}, ${i * 20})`);

//     legendEnter.append("rect")
//       .attr("x", 0)
//       .attr("y", 0)
//       .attr("width", 15)
//       .attr("height", 15)
//       .attr("fill", (d, i) => color(d) as string);

//     legendEnter.append("text")
//       .attr("x", 20)
//       .attr("y", 12)
//       .attr("fill", colors.text)
//       .text(d => d.slice(0, 6) + "...");

//     legend.exit().remove();

//     svg.style("background", colors.background);
//   };

//   // Handle Zoom
//   const handleZoom = () => {
//     setZoomLevel(prev => Math.min(prev + 0.2, 2)); // Increase zoom, max 2x
//     if (onZoom) onZoom();
//   };

//   // Handle Pan
//   const handlePan = () => {
//     setPanOffset(prev => prev + 0.1); // Pan right by 10%
//     if (onPan) onPan();
//   };

//   // Handle Download
//   const handleDownload = () => {
//     if (!svgRef.current) return;

//     const svg = svgRef.current;
//     const serializer = new XMLSerializer();
//     const svgString = serializer.serializeToString(svg);
//     const canvas = document.createElement("canvas");
//     const ctx = canvas.getContext("2d");
//     const img = new Image();

//     const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
//     const url = URL.createObjectURL(svgBlob);

//     img.onload = () => {
//       canvas.width = svg.clientWidth;
//       canvas.height = svg.clientHeight;
//       ctx?.drawImage(img, 0, 0);
//       const png = canvas.toDataURL("image/png");
//       const link = document.createElement("a");
//       link.download = "swap-volume-chart.png";
//       link.href = png;
//       link.click();
//       URL.revokeObjectURL(url);
//     };

//     img.src = url;
//     if (onDownload) onDownload();
//   };

//   useLayoutEffect(() => {
//     const updateChartSize = () => {
//       if (chartContainerRef.current && svgRef.current && Array.isArray(data) && data.length) {
//         const width = chartContainerRef.current.clientWidth || 600;
//         const height = chartContainerRef.current.clientHeight || 400;
//         console.log("Calling renderChart with dimensions:", { width, height });
//         renderChart(data, width, height, isFirstMount.current);
//         isFirstMount.current = false;
//       } else {
//         console.log("Skipping renderChart - Invalid state:", { data });
//       }
//     };

//     const handleResize = () => {
//       if (resizeTimeoutRef.current) {
//         clearTimeout(resizeTimeoutRef.current);
//       }
//       resizeTimeoutRef.current = setTimeout(() => {
//         updateChartSize();
//       }, 50);
//     };

//     updateChartSize();

//     const resizeObserver = new ResizeObserver(() => handleResize());
//     if (chartContainerRef.current) resizeObserver.observe(chartContainerRef.current);

//     return () => {
//       if (chartContainerRef.current) resizeObserver.unobserve(chartContainerRef.current);
//       if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
//     };
//   }, [data, zoomLevel, panOffset]);

//   return (
//     <div ref={chartContainerRef} style={{ width: "100%", height: "100%" }}>
//       <svg ref={svgRef} style={{ width: "100%", height: "100%" }} />
//     </div>
//   );
// };

// export default SwapVolumeChart;