"use client";
import React, { useEffect, useRef } from "react";
import * as d3 from "d3";
import { gsap } from "gsap";
import styles from "../../styles/Explore.module.css";

interface GasFeeOverTimeData {
  event_date: string;
  event_type: string;
  avg_gas_fee_eth: number;
  avg_gas_fee_usd: number;
  transaction_count: number;
}

interface GasFeesChartProps {
  gasFeeData: GasFeeOverTimeData[];
  onZoom?: () => void;
  onPan?: () => void;
  onDownload?: () => void;
}

const GasFeesChart: React.FC<GasFeesChartProps> = ({ gasFeeData, onZoom, onPan, onDownload }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const isFirstMount = useRef(true);

  const colors = {
    transfer: "#FF9F1C",
    swap: "#2AB7CA",
    background: "#010214",
    text: "rgba(255, 255, 255, 0.1)",
  };

  // Tooltip setup
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

  const renderChart = (data: GasFeeOverTimeData[], width: number, height: number) => {
    if (!svgRef.current || !containerRef.current || !data.length) {
      console.log("Chart not rendering due to missing SVG, container, or data:", {
        svg: !!svgRef.current,
        container: !!containerRef.current,
        dataLength: data.length,
      });
      return;
    }

    const svg = d3.select(svgRef.current);
    const margin = { top: 20, right: 50, bottom: 60, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    if (isFirstMount.current) {
      svg.selectAll("*").remove();
    }

    const g = svg.select("g").empty()
      ? svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`)
      : svg.select("g");

    // Group data by date
    const dates = Array.from(new Set(data.map(d => d.event_date))).sort();
    const nestedData = d3.group(data, d => d.event_date);

    // Scales
    const x = d3.scaleBand()
      .domain(dates)
      .range([0, innerWidth])
      .padding(0.1);

    const maxGasFee = d3.max(data, d => d.avg_gas_fee_usd)! * 1.1;
    const minGasFee = Math.max(d3.min(data, d => d.avg_gas_fee_usd)!, 0.00001);
    const y = d3.scaleLog()
      .domain([minGasFee, maxGasFee])
      .range([innerHeight, 0])
      .base(10)
      .clamp(true);

    // Custom tick values for logarithmic scale
    const logMin = Math.log10(minGasFee);
    const logMax = Math.log10(maxGasFee);
    const tickCount = 8;
    const tickStep = (logMax - logMin) / (tickCount - 1);
    const tickValues = Array.from({ length: tickCount }, (_, i) => {
      const logValue = logMin + i * tickStep;
      return Math.pow(10, logValue);
    }).filter(val => val >= minGasFee && val <= maxGasFee);

    const color = d3.scaleOrdinal()
      .domain(["Transfer", "Swap"])
      .range([colors.transfer, colors.swap]);

    // Line generator
    const line = d3.line<{ date: string; value: number }>()
      .x(d => x(d.date)! + x.bandwidth() / 2)
      .y(d => y(d.value > 0 ? d.value : minGasFee))
      .curve(d3.curveCatmullRom.alpha(0.3));

    // Render lines for Transfer and Swap
    ["Transfer", "Swap"].forEach(eventType => {
      const lineData = dates.map(date => {
        const entry = nestedData.get(date)?.find(d => d.event_type === eventType);
        return { date, value: entry ? entry.avg_gas_fee_usd : 0 };
      });

      let path = g.select(`.line-${eventType.toLowerCase()}`);
      if (path.empty()) {
        path = g.append("path")
          .attr("class", `line-${eventType.toLowerCase()}`)
          .attr("fill", "none")
          .attr("stroke", color(eventType) as string)
          .attr("stroke-width", 2)
          .attr("d", line(lineData)); // Set initial path
      }

      const latestEntry = data
        .filter(d => d.event_type === eventType && d.avg_gas_fee_usd > 0)
        .slice(-1)[0];
      let circle = g.select(`.latest-point-${eventType.toLowerCase()}`);
      if (circle.empty() && latestEntry) {
        circle = g.append("circle")
          .attr("class", `latest-point-${eventType.toLowerCase()}`)
          .attr("cx", x(latestEntry.event_date)! + x.bandwidth() / 2)
          .attr("cy", y(latestEntry.avg_gas_fee_usd))
          .attr("r", 3)
          .attr("fill", "#fff")
          .attr("opacity", 0);
      }

      let label = g.select(`.label-${eventType.toLowerCase()}`);
      if (label.empty() && latestEntry) {
        label = g.append("text")
          .attr("class", `label-${eventType.toLowerCase()}`)
          .attr("x", x(latestEntry.event_date)! + x.bandwidth() / 2 + 30)
          .attr("y", y(latestEntry.avg_gas_fee_usd))
          .attr("fill", color(eventType) as string)
          .attr("font-size", "12px")
          .attr("text-anchor", "start")
          .attr("alignment-baseline", "middle")
          .text(eventType)
          .attr("opacity", 0);
      }

      const pathNode = path.node() as SVGPathElement | null;
      if (isFirstMount.current && pathNode) {
        const totalLength = pathNode.getTotalLength();
        console.log(`Path length for ${eventType}:`, totalLength);

        if (totalLength > 0) {
          // Set initial dash properties
          path
            .attr("stroke-dasharray", totalLength)
            .attr("stroke-dashoffset", totalLength);

          // GSAP animation
          gsap.to(pathNode, {
            strokeDashoffset: 0,
            duration: 4, // Customize this as you like (e.g., 3, 1.5)
            ease: "power2.out",
            onComplete: () => {
              if (latestEntry) {
                gsap.to(circle.node(), {
                  opacity: 1,
                  duration: 0.5,
                  onComplete: () => {
                    gsap.to(circle.node(), {
                      r: 6,
                      repeat: -1,
                      yoyo: true,
                      duration: 0.8,
                      ease: "power1.inOut",
                    });
                  },
                });
                gsap.to(label.node(), {
                  opacity: 0.8,
                  duration: 0.5,
                });
              }
            },
          });
        } else {
          console.warn(`Path for ${eventType} has zero length. Skipping animation.`);
          path.attr("stroke-dasharray", null)
            .attr("stroke-dashoffset", null);
          if (latestEntry) {
            circle.attr("opacity", 1);
            label.attr("opacity", 0.8);
          }
        }
      } else {
        // Update without animation on subsequent renders
        path
          .datum(lineData)
          .transition()
          .duration(500)
          .attr("d", line);

        if (latestEntry) {
          circle.transition()
            .duration(500)
            .attr("cx", x(latestEntry.event_date)! + x.bandwidth() / 2)
            .attr("cy", y(latestEntry.avg_gas_fee_usd))
            .attr("opacity", 1);

          label.transition()
            .duration(500)
            .attr("x", x(latestEntry.event_date)! + x.bandwidth() / 2 + 30)
            .attr("y", y(latestEntry.avg_gas_fee_usd))
            .attr("opacity", 0.8);

          const circleNode = circle.node();
          if (circleNode && !gsap.isTweening(circleNode)) {
            gsap.to(circleNode, {
              r: 6,
              repeat: -1,
              yoyo: true,
              duration: 0.8,
              ease: "power1.inOut",
            });
          }
        }
      }
    });

    // Dots for interaction
    g.selectAll(".dot").remove();
    g.selectAll(".dot")
      .data(data.filter(d => d.avg_gas_fee_usd > 0))
      .enter()
      .append("circle")
      .attr("class", "dot")
      .attr("cx", d => x(d.event_date)! + x.bandwidth() / 2)
      .attr("cy", d => y(d.avg_gas_fee_usd))
      .attr("r", 4)
      .attr("fill", d => color(d.event_type) as string)
      .attr("opacity", 0)
      .on("mouseover", (event, d) => {
        if (tooltipRef.current) {
          tooltipRef.current.style.opacity = "1";
          tooltipRef.current.innerHTML = `Date: ${d.event_date}<br>Type: ${d.event_type}<br>Gas Fee: $${d.avg_gas_fee_usd.toFixed(2)} USD<br>Count: ${d.transaction_count}`;
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
      })
      .transition()
      .duration(500)
      .attr("opacity", 1);

    // Axes
    if (isFirstMount.current) {
      g.append("g").attr("class", "x-axis");
      g.append("g").attr("class", "y-axis");
    }

    g.select(".x-axis")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).tickFormat(d => d.slice(5)))
      .selectAll("text")
      .attr("fill", "#fff")
      .style("text-anchor", "end")
      .attr("dx", "-.8em")
      .attr("dy", ".15em")
      .attr("transform", "rotate(-45)");

    g.select(".y-axis")
      .call(d3.axisLeft(y).tickValues(tickValues).tickFormat(d => `$${d.toFixed(2)}`))
      .selectAll("text")
      .attr("fill", "#fff");

    g.select(".y-axis-label").remove();
    g.append("text")
      .attr("class", "y-axis-label")
      .attr("transform", "rotate(-90)")
      .attr("y", -margin.left + 20)
      .attr("x", -innerHeight / 2)
      .attr("text-anchor", "middle")
      .attr("fill", "#fff")
      .text("Gas Fee (USD)");

    svg.style("background", colors.background);

    isFirstMount.current = false;
  };

  useEffect(() => {
    const updateChartSize = () => {
      if (containerRef.current && svgRef.current) {
        const width = containerRef.current.clientWidth || 600;
        const height = containerRef.current.clientHeight || 360;
        if (gasFeeData.length) renderChart(gasFeeData, width, height);
      }
    };

    updateChartSize();
    const resizeObserver = new ResizeObserver(() => updateChartSize());
    if (containerRef.current) resizeObserver.observe(containerRef.current);

    return () => {
      if (containerRef.current) resizeObserver.unobserve(containerRef.current);
    };
  }, [gasFeeData]);

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

export default GasFeesChart;