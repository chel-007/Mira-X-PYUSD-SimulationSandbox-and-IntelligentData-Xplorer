"use client";
import React, { useEffect, useRef } from "react";
import * as d3 from "d3";
import { gsap } from "gsap";
import styles from "../../styles/Explore.module.css";

interface TransactionChartProps {
  dailyData: { date: string; value: number }[];
  monthlyData: { date: string; value: number }[];
  view: "daily" | "monthly"; // New prop for view state
  onToggle?: (newView: "daily" | "monthly") => void; // Optional prop for toggle callback
}

const TransactionChart: React.FC<TransactionChartProps> = ({ dailyData, monthlyData, view }) => {
  const chartRef = useRef<SVGSVGElement | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const isFirstMount = useRef(true);

  const colors = {
    primary: "#7BCFFF",
    background: "#010214",
    text: "rgba(255, 255, 255, 0.1)",
  };

  const smoothDailyData = (data: { date: string; value: number }[]) => {
    return data.map((d, i) => {
      const window = data.slice(Math.max(0, i - 1), i + 2);
      const avg = d3.mean(window, w => w.value) || d.value;
      return { date: d.date, value: avg };
    });
  };

  const renderChart = (data: { date: string; value: number }[], width: number, height: number) => {
    const smoothedData = view === "daily" ? smoothDailyData(data) : data;
    const svg = d3.select(chartRef.current);
    const margin = { top: 20, right: 30, bottom: 60, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.bottom - margin.top;
  
    if (isFirstMount.current) {
      svg.selectAll("*").remove();
    }
  
    const g = svg.select("g").empty()
      ? svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`)
      : svg.select("g");
  
    const x = d3.scaleTime()
      .domain(d3.extent(data, (d) => new Date(d.date)) as [Date, Date])
      .range([0, innerWidth]);
  
    const yMax = d3.max(smoothedData, (d) => d.value) || 0;
    const y = d3.scaleLinear().domain([0, yMax]).nice().range([innerHeight, 0]);
  
    const area = d3.area<{ date: string; value: number }>()
      .x((d) => x(new Date(d.date)))
      .y0(innerHeight)
      .y1((d) => y(d.value))
      .curve(view === "daily" ? d3.curveBasis : d3.curveMonotoneX);
  
    const initialArea = d3.area<{ date: string; value: number }>()
      .x((d) => x(new Date(d.date)))
      .y0(innerHeight)
      .y1(innerHeight)
      .curve(view === "daily" ? d3.curveBasis : d3.curveMonotoneX);
  
    let path = g.select("path");
    if (path.empty()) {
      path = g.append("path")
        .attr("fill", colors.primary)
        .attr("opacity", 0.8);
    }
  
    const latest = data[data.length - 1];
    let circle = g.select(".latest-point");
    if (circle.empty()) {
      circle = g.append("circle")
        .attr("class", "latest-point")
        .attr("cx", x(new Date(latest.date)))
        .attr("cy", y(latest.value))
        .attr("r", 3)
        .attr("fill", "#fff")
        .attr("opacity", 0);
    }
  
    if (isFirstMount.current) {
      path.datum(smoothedData)
        .attr("d", initialArea)
        .transition()
        .duration(1000)
        .attr("d", area)
        .on("end", () => {
          circle.transition()
            .duration(500)
            .attr("opacity", 1)
            .on("end", () => {
              gsap.to(circle.node(), {
                r: 6,
                repeat: -1,
                yoyo: true,
                duration: 0.8,
                ease: "power1.inOut",
              });
            });
        });
  
      g.append("g")
        .attr("class", "x-axis");
  
      g.append("g")
        .attr("class", "y-axis");
  
      isFirstMount.current = false;
    } else {
      if (view !== (path.attr("data-view") || "daily")) { // Toggle changed
        path.transition()
          .duration(300)
          .attr("opacity", 0)
          .on("end", () => {
            path.datum(smoothedData)
              .attr("d", area) // Set new shape instantly
              .transition()
              .duration(300)
              .attr("opacity", 0.8);
          });
      } else { // Data update
        path.datum(smoothedData)
          .transition()
          .duration(300)
          .attr("d", area);
      }
  
      circle.transition()
        .duration(500)
        .attr("cx", x(new Date(latest.date)))
        .attr("cy", y(latest.value))
        .attr("opacity", 1);
  
      // Reapply GSAP pulse if not already pulsing
      const circleNode = circle.node();
      if (circleNode && !gsap.isTweening(circleNode)) {
        gsap.to(circleNode, {
          r: 8,
          repeat: -1,
          yoyo: true,
          duration: 0.5,
          ease: "power1.inOut",
        });
      }
    }
  
    // Update x-axis transform on every render
    g.select(".x-axis")
      .attr("transform", `translate(0,${innerHeight})`) // Update position
      .call(
        view === "daily"
          ? d3.axisBottom(x).ticks(d3.timeDay.every(2))
          : d3.axisBottom(x).ticks(d3.timeMonth.every(1))
      )
      .selectAll("text")
      .attr("fill", "#fff")
      .style("text-anchor", "end")
      .attr("dx", "-.8em")
      .attr("dy", ".15em")
      .attr("transform", "rotate(-45)");
      
  
    g.select(".y-axis")
      .call(
        view === "daily"
          ? d3.axisLeft(y).ticks(5).tickFormat(d => `${(d / 1e6).toFixed(1)}M`)
          : d3.axisLeft(y).ticks(5).tickFormat(d => `${(d / 1e9).toFixed(1)}G`)
      )
      .selectAll("text")
      .attr("fill", "#fff");
  
    svg.style("background", colors.background);
    path.attr("data-view", view); // Track current view
  };

  useEffect(() => {
    const updateChartSize = () => {
      if (chartContainerRef.current && chartRef.current) {
        const width = chartContainerRef.current.clientWidth || 600;
        const height = chartContainerRef.current.clientHeight || 360;
        const data = view === "daily" ? dailyData : monthlyData;
        if (data.length) renderChart(data, width, height);
      }
    };

    updateChartSize();

    const resizeObserver = new ResizeObserver(() => updateChartSize());
    if (chartContainerRef.current) resizeObserver.observe(chartContainerRef.current);

    return () => {
      if (chartContainerRef.current) resizeObserver.unobserve(chartContainerRef.current);
    };
  }, [dailyData, monthlyData, view]);

  useEffect(() => {
    return () => {
      isFirstMount.current = true;
    };
  }, []);

  return (
    <div ref={chartContainerRef} style={{ width: "100%", height: "100%" }}>
      <svg ref={chartRef} style={{ width: "100%", height: "100%" }}></svg>
    </div>
  );
};

export default TransactionChart;


// "use client";
// import React, { useEffect, useState, useRef } from "react";
// import * as d3 from "d3";
// import { gsap } from "gsap";
// import ToggleSwitch from "./ToggleSwitch";
// import styles from "../../styles/Explore.module.css";

// interface TransactionChartProps {
//   dailyData: { date: string; value: number }[];
//   monthlyData: { date: string; value: number }[];
//   loading: boolean;
// }

// const TransactionChart: React.FC<TransactionChartProps> = ({ dailyData, monthlyData, loading }) => {
//   const [view, setView] = useState<"daily" | "monthly">("daily");
//   const chartRef = useRef<SVGSVGElement | null>(null);
//   const chartContainerRef = useRef<HTMLDivElement>(null);
//   const isFirstMount = useRef(true);

//   const colors = {
//     primary: "#7BCFFF",
//     background: "#010214",
//     text: "rgba(255, 255, 255, 0.1)",
//   };

//   const smoothDailyData = (data: { date: string; value: number }[]) => {
//     return data.map((d, i) => {
//       const window = data.slice(Math.max(0, i - 1), i + 2);
//       const avg = d3.mean(window, w => w.value) || d.value;
//       return { date: d.date, value: avg };
//     });
//   };

//   const renderChart = (data: { date: string; value: number }[], width: number, height: number) => {
//     const smoothedData = view === "daily" ? smoothDailyData(data) : data;
//     const svg = d3.select(chartRef.current);
//     const margin = { top: 20, right: 30, bottom: 60, left: 60 };
//     const innerWidth = width - margin.left - margin.right;
//     const innerHeight = height - margin.bottom - margin.top;

//     if (isFirstMount.current) {
//       svg.selectAll("*").remove();
//       svg.attr("width", width).attr("height", height);
//     }

//     const g = svg.select("g").empty()
//       ? svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`)
//       : svg.select("g");

//     const x = d3.scaleTime()
//       .domain(d3.extent(data, (d) => new Date(d.date)) as [Date, Date])
//       .range([0, innerWidth]);

//     const yMax = d3.max(smoothedData, (d) => d.value) || 0;
//     const y = d3.scaleLinear().domain([0, yMax]).nice().range([innerHeight, 0]);

//     const area = d3.area<{ date: string; value: number }>()
//       .x((d) => x(new Date(d.date)))
//       .y0(innerHeight)
//       .y1((d) => y(d.value))
//       .curve(view === "daily" ? d3.curveBasis : d3.curveMonotoneX);

//     const initialArea = d3.area<{ date: string; value: number }>()
//       .x((d) => x(new Date(d.date)))
//       .y0(innerHeight)
//       .y1(innerHeight)
//       .curve(view === "daily" ? d3.curveBasis : d3.curveMonotoneX);

//     let path = g.select("path");
//     if (path.empty()) {
//       path = g.append("path")
//         .attr("fill", colors.primary)
//         .attr("opacity", 0.8);
//     }

//     const latest = data[data.length - 1];
//     let circle = g.select(".latest-point");
//     if (circle.empty()) {
//       circle = g.append("circle")
//         .attr("class", "latest-point")
//         .attr("cx", x(new Date(latest.date)))
//         .attr("cy", y(latest.value))
//         .attr("r", 3)
//         .attr("fill", "#fff")
//         .attr("opacity", 0);
//     }

//     if (isFirstMount.current) {
//       path.datum(smoothedData)
//         .attr("d", initialArea)
//         .transition()
//         .duration(1000)
//         .attr("d", area)
//         .on("end", () => {
//           circle.transition()
//             .duration(500)
//             .attr("opacity", 1)
//             .on("end", () => {
//               gsap.to(circle.node(), {
//                 r: 6,
//                 repeat: -1,
//                 yoyo: true,
//                 duration: 0.8,
//                 ease: "power1.inOut",
//               });
//             });
//         });

//       g.append("g")
//         .attr("class", "x-axis")
//         .attr("transform", `translate(0,${innerHeight})`);

//       g.append("g")
//         .attr("class", "y-axis");

//       isFirstMount.current = false;
//     } else {
//       if (view !== (path.attr("data-view") || "daily")) { // Toggle changed
//         path.transition()
//           .duration(300)
//           .attr("opacity", 0)
//           .on("end", () => {
//             path.datum(smoothedData)
//               .attr("d", area) // Set new shape instantly
//               .transition()
//               .duration(300)
//               .attr("opacity", 0.8);
//           });
//       } else { // Data update
//         path.datum(smoothedData)
//           .transition()
//           .duration(500)
//           .attr("d", area);
//       }

//       circle.transition()
//         .duration(500)
//         .attr("cx", x(new Date(latest.date)))
//         .attr("cy", y(latest.value))
//         .attr("opacity", 1);

//       // Reapply GSAP pulse if not already pulsing
//       const circleNode = circle.node();
//       if (circleNode && !gsap.isTweening(circleNode)) {
//         gsap.to(circleNode, {
//           r: 8,
//           repeat: -1,
//           yoyo: true,
//           duration: 0.5,
//           ease: "power1.inOut",
//         });
//       }
//     }

//     g.select(".x-axis")
//       .call(
//         view === "daily"
//           ? d3.axisBottom(x).ticks(d3.timeDay.every(2))
//           : d3.axisBottom(x).ticks(d3.timeMonth.every(1))
//       )
//       .selectAll("text")
//       .attr("fill", "#fff")
//       .style("text-anchor", "end")
//       .attr("dx", "-.8em")
//       .attr("dy", ".15em")
//       .attr("transform", "rotate(-45)");

//     g.select(".y-axis")
//       .call(
//         view === "daily"
//           ? d3.axisLeft(y).ticks(5).tickFormat(d => `${(d / 1e6).toFixed(1)}M`)
//           : d3.axisLeft(y).ticks(5).tickFormat(d => `${(d / 1e9).toFixed(1)}G`)
//       )
//       .selectAll("text")
//       .attr("fill", "#fff");

//     svg.style("background", colors.background);
//     path.attr("data-view", view); // Track current view
//   };

//   useEffect(() => {
//     const updateChartSize = () => {
//       if (chartContainerRef.current && chartRef.current && !loading) {
//         const width = chartContainerRef.current.clientWidth || 600;
//         const height = chartContainerRef.current.clientHeight || 360;
//         const data = view === "daily" ? dailyData : monthlyData;
//         if (data.length) renderChart(data, width, height);
//       }
//     };

//     updateChartSize();

//     const resizeObserver = new ResizeObserver(() => updateChartSize());
//     if (chartContainerRef.current) resizeObserver.observe(chartContainerRef.current);

//     return () => {
//       if (chartContainerRef.current) resizeObserver.unobserve(chartContainerRef.current);
//     };
//   }, [dailyData, monthlyData, view, loading]);

//   useEffect(() => {
//     return () => {
//       isFirstMount.current = true;
//     };
//   }, []);

//   const handleToggle = (newView: "daily" | "monthly") => setView(newView);

//   return (
//     <div style={{ padding: "6px" }}>
//       <div style={{ textAlign: "center", color: "#fff", marginBottom: "10px" }}>
//         {view === "daily" ? "Daily Volume - Current Month" : "Monthly Volume - All Time"}
//       </div>
//       <ToggleSwitch onToggle={handleToggle} />
//       <div ref={chartContainerRef}>
//         {loading ? <div>Loading...</div> : <svg ref={chartRef}></svg>}
//       </div>
//     </div>
//   );
// };

// export default TransactionChart;