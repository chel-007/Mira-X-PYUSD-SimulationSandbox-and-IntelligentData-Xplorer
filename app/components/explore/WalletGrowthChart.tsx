"use client";
import React, { useEffect, useRef } from "react";
import * as d3 from "d3";
import styles from "../../styles/Explore.module.css";

interface WalletGrowthChartProps {
  walletGrowthData: { date: string; newWallets: number }[];
  onZoom?: () => void;
  onPan?: () => void;
  onDownload?: () => void;
}

const WalletGrowthChart: React.FC<WalletGrowthChartProps> = ({ walletGrowthData, onZoom, onPan, onDownload }) => {
  const growthRef = useRef<SVGSVGElement | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const isFirstMount = useRef(true);
  const isAnimating = useRef(false);

  const updateGradient = (svg, height, margin) => {
    svg.select("#areaGradient").remove();
    const defs = svg.select("defs").empty() ? svg.append("defs") : svg.select("defs");
    const gradient = defs
      .append("linearGradient")
      .attr("id", "areaGradient")
      .attr("gradientUnits", "userSpaceOnUse")
      .attr("x1", 0).attr("y1", height - margin.bottom) // Bottom at x-axis
      .attr("x2", 0).attr("y2", margin.top);           // Top at chart top
    gradient.append("stop").attr("offset", "0%").attr("stop-color", "#4A90E2").attr("stop-opacity", 0.5);
    gradient.append("stop").attr("offset", "100%").attr("stop-color", "#7BCFFF").attr("stop-opacity", 0);
  };

  useEffect(() => {
    if (!growthRef.current || !walletGrowthData.length) return;

    const svg = d3.select(growthRef.current);
    let width = chartContainerRef.current?.clientWidth || 600;
    let height = chartContainerRef.current?.clientHeight || 400;
    const margin = { top: 20, right: 20, bottom: 30, left: 40 };

    // Setup SVG elements on first mount
    if (isFirstMount.current) {
      svg.selectAll("*").remove();
      updateGradient(svg, height, margin);
      svg.append("path").attr("class", "area").attr("fill", "url(#areaGradient)").attr("opacity", 0);
      svg.append("path").attr("class", "line").attr("fill", "none").attr("stroke", "#7BCFFF").attr("stroke-width", 2);
      svg.append("g").attr("class", "x-axis").attr("transform", `translate(0,${height - margin.bottom})`);
      svg.append("g").attr("class", "y-axis").attr("transform", `translate(${margin.left},0)`);
    } else {
      updateGradient(svg, height, margin); // Ensure gradient updates on every render
    }

    // Calculate cumulative data
    const cumulativeData = walletGrowthData.reduce((acc, d, i) => {
      const total = i === 0 ? d.newWallets : acc[i - 1].total + d.newWallets;
      acc.push({ date: d.date, total });
      return acc;
    }, [] as { date: string; total: number }[]);

    // Define scales
    const x = d3.scaleTime()
      .domain(d3.extent(cumulativeData, d => new Date(d.date)) as [Date, Date])
      .range([margin.left, width - margin.right]);

    const y = d3.scaleLinear()
      .domain([0, d3.max(cumulativeData, d => d.total) || 0])
      .range([height - margin.bottom, margin.top]);

    const area = d3.area<{ date: string; total: number }>()
      .x(d => x(new Date(d.date)))
      .y0(height - margin.bottom)
      .y1(d => y(d.total))
      .curve(d3.curveMonotoneX);

    const line = d3.line<{ date: string; total: number }>()
      .x(d => x(new Date(d.date)))
      .y(d => y(d.total))
      .curve(d3.curveMonotoneX);

    if (isFirstMount.current && !isAnimating.current) {
      isAnimating.current = true;
      svg.select(".area")
        .datum(cumulativeData)
        .attr("d", area)
        .transition()
        .duration(1000)
        .attr("opacity", 1);

      const linePath = svg.select(".line")
        .datum(cumulativeData)
        .attr("d", line);
      const totalLength = linePath.node()?.getTotalLength() || 0;
      linePath
        .attr("stroke-dasharray", `${totalLength} ${totalLength}`)
        .attr("stroke-dashoffset", totalLength)
        .transition()
        .duration(1500)
        .ease(d3.easeQuadOut)
        .attr("stroke-dashoffset", 0)
        .on("end", () => {
          isAnimating.current = false;
          isFirstMount.current = false;
        });

      svg.selectAll(".dot")
        .data(cumulativeData, d => d.date)
        .enter()
        .append("circle")
        .attr("class", "dot")
        .attr("cx", d => x(new Date(d.date)))
        .attr("cy", d => y(d.total))
        .attr("r", 0)
        .attr("fill", "#7BCFFF")
        .transition()
        .duration(500)
        .delay((_, i) => i * 10)
        .ease(d3.easeQuadOut)
        .attr("r", 4);
    } else if (!isAnimating.current) {
      svg.select(".area")
        .datum(cumulativeData)
        .transition()
        .duration(500)
        .attr("d", area);

      svg.select(".line")
        .datum(cumulativeData)
        .transition()
        .duration(500)
        .attr("d", line);

      const dots = svg.selectAll(".dot")
        .data(cumulativeData, d => d.date);

      dots.enter()
        .append("circle")
        .attr("class", "dot")
        .attr("cx", d => x(new Date(d.date)))
        .attr("cy", d => y(d.total))
        .attr("r", 0)
        .attr("fill", "#7BCFFF")
        .transition()
        .duration(500)
        .attr("r", 4);

      dots.transition()
        .duration(500)
        .attr("cx", d => x(new Date(d.date)))
        .attr("cy", d => y(d.total));

      dots.exit()
        .transition()
        .duration(500)
        .attr("r", 0)
        .remove();
    }

    // Update axes
    svg.select<SVGGElement>(".x-axis")
      .transition()
      .duration(500)
      .call(d3.axisBottom(x).ticks(6))
      .selectAll("text")
      .attr("fill", "#fff");

    svg.select<SVGGElement>(".y-axis")
      .transition()
      .duration(500)
      .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format("~s")))
      .selectAll("text")
      .attr("fill", "#fff");

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      if (chartContainerRef.current && growthRef.current) {
        const newWidth = chartContainerRef.current.clientWidth;
        const newHeight = chartContainerRef.current.clientHeight;
        console.log("Resize: newHeight", newHeight, "y1", newHeight - margin.bottom, "y2", margin.top);

        // Update scales
        x.range([margin.left, newWidth - margin.right]);
        y.range([newHeight - margin.bottom, margin.top]);

        // Update gradient first
        updateGradient(svg, newHeight, margin);

        // Update chart elements
        svg.select(".area").attr("d", area.y0(newHeight - margin.bottom));
        svg.select(".line").attr("d", line);
        svg.selectAll(".dot")
          .attr("cx", d => x(new Date(d.date)))
          .attr("cy", d => y(d.total));

        svg.select<SVGGElement>(".x-axis")
          .attr("transform", `translate(0,${newHeight - margin.bottom})`)
          .call(d3.axisBottom(x).ticks(5))
          .selectAll("text")
          .attr("fill", "#fff");

        svg.select<SVGGElement>(".y-axis")
          .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format("~s")))
          .selectAll("text")
          .attr("fill", "#fff");
      }
    });

    if (chartContainerRef.current) resizeObserver.observe(chartContainerRef.current);

    return () => {
      if (chartContainerRef.current) resizeObserver.unobserve(chartContainerRef.current);
    };
  }, [walletGrowthData]);

  return (
    <div ref={chartContainerRef} style={{ width: "100%", height: "100%" }}>
      <svg ref={growthRef} style={{ width: "100%", height: "100%" }}></svg>
    </div>
  );
};

export default WalletGrowthChart;


// "use client";
// import React, { useEffect, useRef } from "react";
// import * as d3 from "d3";
// import styles from "../../styles/Explore.module.css";

// interface WalletGrowthChartProps {
//   walletGrowthData: { date: string; newWallets: number }[];
//   onZoom?: () => void;
//   onPan?: () => void;
//   onDownload?: () => void;
// }

// const WalletGrowthChart: React.FC<WalletGrowthChartProps> = ({ walletGrowthData, onZoom, onPan, onDownload }) => {
//   const growthRef = useRef<SVGSVGElement | null>(null);
//   const chartContainerRef = useRef<HTMLDivElement>(null);
//   const isFirstMount = useRef(true); // This will only be true on the first render

//   useEffect(() => {
//     if (!growthRef.current || !walletGrowthData.length) return;

//     const svg = d3.select(growthRef.current) as d3.Selection<SVGSVGElement, unknown, null, undefined>;
//     const width = chartContainerRef.current?.clientWidth || 600;
//     const height = chartContainerRef.current?.clientHeight || 400;
//     const margin = { top: 20, right: 20, bottom: 30, left: 40 };

//     // Setup SVG elements (only on first mount)
//     if (isFirstMount.current) {
//       svg.selectAll("*").remove();

//       const defs = svg.append("defs");
//       const gradient = defs
//         .append("linearGradient")
//         .attr("id", "areaGradient")
//         .attr("gradientUnits", "userSpaceOnUse")
//         .attr("x1", 0).attr("y1", height - margin.bottom)
//         .attr("x2", 0).attr("y2", margin.top);
//       gradient.append("stop").attr("offset", "0%").attr("stop-color", "#4A90E2").attr("stop-opacity", 0.5);
//       gradient.append("stop").attr("offset", "100%").attr("stop-color", "#7BCFFF").attr("stop-opacity", 0);

//       svg.append("path").attr("class", "area").attr("fill", "url(#areaGradient)").attr("opacity", 0);
//       svg.append("path").attr("class", "line").attr("fill", "none").attr("stroke", "#7BCFFF").attr("stroke-width", 2);
//       svg.append("g").attr("class", "x-axis").attr("transform", `translate(0,${height - margin.bottom})`);
//       svg.append("g").attr("class", "y-axis").attr("transform", `translate(${margin.left},0)`);
//     }

//     // Calculate cumulative data
//     const cumulativeData = walletGrowthData.reduce((acc, d, i) => {
//       const total = i === 0 ? d.newWallets : acc[i - 1].total + d.newWallets;
//       acc.push({ date: d.date, total });
//       return acc;
//     }, [] as { date: string; total: number }[]);

//     // Define scales
//     const x = d3.scaleTime()
//       .domain(d3.extent(cumulativeData, d => new Date(d.date)) as [Date, Date])
//       .range([margin.left, width - margin.right]);

//     const y = d3.scaleLinear()
//       .domain([0, d3.max(cumulativeData, d => d.total) || 0])
//       .range([height - margin.bottom, margin.top]);

//     const area = d3.area<{ date: string; total: number }>()
//       .x(d => x(new Date(d.date)))
//       .y0(height - margin.bottom)
//       .y1(d => y(d.total))
//       .curve(d3.curveMonotoneX);

//     const line = d3.line<{ date: string; total: number }>()
//       .x(d => x(new Date(d.date)))
//       .y(d => y(d.total))
//       .curve(d3.curveMonotoneX);

//     if (isFirstMount.current) {
//       // First mount: Animate the chart
//       svg.select(".area")
//         .datum(cumulativeData)
//         .attr("d", area)
//         .transition()
//         .duration(1000)
//         .attr("opacity", 1);

//       const linePath = svg.select(".line")
//         .datum(cumulativeData)
//         .attr("d", line);
//       const totalLength = linePath.node()?.getTotalLength() || 0;
//       linePath
//         .attr("stroke-dasharray", `${totalLength} ${totalLength}`)
//         .attr("stroke-dashoffset", totalLength)
//         .transition()
//         .duration(1500)
//         .ease(d3.easeQuadOut)
//         .attr("stroke-dashoffset", 0);

//       svg.selectAll(".dot")
//         .data(cumulativeData, d => d.date)
//         .enter()
//         .append("circle")
//         .attr("class", "dot")
//         .attr("cx", d => x(new Date(d.date)))
//         .attr("cy", d => y(d.total))
//         .attr("r", 0)
//         .attr("fill", "#7BCFFF")
//         .transition()
//         .duration(500)
//         .delay((_, i) => i * 10)
//         .ease(d3.easeQuadOut)
//         .attr("r", 4);

//       isFirstMount.current = false; // Mark as no longer first mount
//     } else {
//       // Subsequent updates: Smoothly transition without replaying full animation
//       svg.select(".area")
//         .datum(cumulativeData)
//         .transition()
//         .duration(500)
//         .attr("d", area);

//       svg.select(".line")
//         .datum(cumulativeData)
//         .transition()
//         .duration(500)
//         .attr("d", line);

//       const dots = svg.selectAll(".dot")
//         .data(cumulativeData, d => d.date);

//       dots.enter()
//         .append("circle")
//         .attr("class", "dot")
//         .attr("cx", d => x(new Date(d.date)))
//         .attr("cy", d => y(d.total))
//         .attr("r", 0)
//         .attr("fill", "#7BCFFF")
//         .transition()
//         .duration(500)
//         .attr("r", 4);

//       dots.transition()
//         .duration(500)
//         .attr("cx", d => x(new Date(d.date)))
//         .attr("cy", d => y(d.total));

//       dots.exit()
//         .transition()
//         .duration(500)
//         .attr("r", 0)
//         .remove();
//     }

//     // Update axes (always)
//     svg.select<SVGGElement>(".x-axis")
//       .transition()
//       .duration(500)
//       .call(d3.axisBottom(x).ticks(6))
//       .selectAll("text")
//       .attr("fill", "#fff");

//     svg.select<SVGGElement>(".y-axis")
//       .transition()
//       .duration(500)
//       .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format("~s")))
//       .selectAll("text")
//       .attr("fill", "#fff");

//     // Handle resize
//     const resizeObserver = new ResizeObserver(() => {
//       if (chartContainerRef.current && growthRef.current) {
//         const newWidth = chartContainerRef.current.clientWidth;
//         const newHeight = chartContainerRef.current.clientHeight;
//         x.range([margin.left, newWidth - margin.right]);
//         y.range([newHeight - margin.bottom, margin.top]);

//         svg.select(".area")
//           .attr("d", area);
//         svg.select(".line")
//           .attr("d", line);
//         svg.selectAll(".dot")
//           .attr("cx", d => x(new Date(d.date)))
//           .attr("cy", d => y(d.total));

//         svg.select<SVGGElement>(".x-axis")
//           .attr("transform", `translate(0,${newHeight - margin.bottom})`)
//           .call(d3.axisBottom(x).ticks(5))
//           .selectAll("text")
//           .attr("fill", "#fff");

//         svg.select<SVGGElement>(".y-axis")
//           .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format("~s")))
//           .selectAll("text")
//           .attr("fill", "#fff");

//         svg.select("#areaGradient")
//           .attr("x1", 0).attr("y1", newHeight - margin.bottom)
//           .attr("x2", 0).attr("y2", margin.top);
//       }
//     });

//     if (chartContainerRef.current) resizeObserver.observe(chartContainerRef.current);

//     return () => {
//       if (chartContainerRef.current) resizeObserver.unobserve(chartContainerRef.current);
//     };
//   }, [walletGrowthData]);

//   // No need to reset isFirstMount on every unmount
//   // Remove this useEffect unless you want to reset on full component unmount:
//   useEffect(() => {
//     return () => {
//       isFirstMount.current = true;
//     };
//   }, []);

//   return (
//     <div ref={chartContainerRef} style={{ width: "100%", height: "100%" }}>
//       <svg ref={growthRef} style={{ width: "100%", height: "100%" }}></svg>
//     </div>
//   );
// };

// export default WalletGrowthChart;