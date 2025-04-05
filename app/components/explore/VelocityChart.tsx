"use client";
import React, { useLayoutEffect, useRef, useEffect } from "react";
import * as d3 from "d3";
import { gsap } from "gsap";

interface VelocityChartProps {
  txPerHour: number;
  maxTxPerHour: number;
  loading: boolean;
}

const VelocityChart: React.FC<VelocityChartProps> = ({ txPerHour, maxTxPerHour, loading }) => {
  const velocityRef = useRef<SVGSVGElement | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const isFirstMount = useRef(true);
  const currentEndAngle = useRef(0); // Start at 0 radians
  const currentNeedleAngle = useRef(-Math.PI / 2);
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const renderChart = () => {
    if (!velocityRef.current || loading) return;

    const svg = d3.select(velocityRef.current);
    const width = chartContainerRef.current?.clientWidth || 200;
    const height = chartContainerRef.current?.clientHeight || 200;
    const radius = Math.min(width, height) / 2;
    const yOffset = height * 0.1;
    const fontSize = radius * 0.15;

    const angleScale = d3.scaleLinear().domain([0, 1]).range([-Math.PI / 2, Math.PI / 2]);
    const needleScale = d3.scaleLinear().domain([0, 1]).range([0, Math.PI]);

    const ratio = Math.min(txPerHour / maxTxPerHour, 1);
    const newEndAngle = needleScale(ratio);
    const newNeedleAngle = angleScale(ratio);

    const backgroundArc = d3.arc()
      .innerRadius(radius * 0.6)
      .outerRadius(radius * 0.9)
      .startAngle(needleScale(0))
      .endAngle(needleScale(1));

    const velocityArc = d3.arc()
      .innerRadius(radius * 0.6)
      .outerRadius(radius * 0.9)
      .startAngle(needleScale(0))
      .endAngle(newEndAngle);

    if (isFirstMount.current) {
      svg.selectAll("*").remove();

      const g = svg.append("g")
        .attr("transform", `translate(${width / 2},${height / 2 + yOffset}) rotate(-90)`);

      g.append("path")
        .attr("class", "background-arc")
        .attr("d", backgroundArc())
        .attr("fill", "rgba(255, 255, 255, 0.2)");

      const velocityPath = g.append("path")
        .attr("class", "velocity-path")
        .attr("d", velocityArc.endAngle(needleScale(0))())
        .attr("fill", "#7BCFFF")
        .attr("opacity", 0.8);

      const needle = g.append("line")
        .attr("id", "needle")
        .attr("x1", 0)
        .attr("y1", 0)
        .attr("x2", radius * 0.9 * Math.cos(angleScale(0)))
        .attr("y2", radius * 0.9 * Math.sin(angleScale(0)))
        .attr("stroke", "#fff")
        .attr("stroke-width", 2);

      g.append("text")
        .attr("class", "velocity-text")
        .attr("x", 0)
        .attr("y", radius * 0.3)
        .attr("text-anchor", "middle")
        .attr("fill", "#fff")
        .attr("transform", "rotate(90)")
        .attr("font-size", fontSize)
        .text(`${Math.round(txPerHour)} tx/h`);

      // D3 transition for arc
      velocityPath
        .transition()
        .duration(1000)
        .ease(d3.easeQuadOut)
        .attrTween("d", () => {
          const interpolate = d3.interpolate(needleScale(0), newEndAngle);
          return t => velocityArc.endAngle(interpolate(t))();
        })
        .on("end", () => {
          currentEndAngle.current = newEndAngle;
        });

      // GSAP for needle
      gsap.to({ angle: angleScale(0) }, {
        angle: newNeedleAngle,
        duration: 1.5,
        ease: "elastic.out(1, 0.5)",
        onUpdate: function () {
          const angle = this.targets()[0].angle;
          needle.attr("x2", radius * 0.9 * Math.cos(angle))
            .attr("y2", radius * 0.9 * Math.sin(angle));
        },
        onComplete: () => {
          currentNeedleAngle.current = newNeedleAngle;
        },
      });

      isFirstMount.current = false;
    } else {
      const g = svg.select("g")
        .attr("transform", `translate(${width / 2},${height / 2 + yOffset}) rotate(-90)`);

      g.select(".background-arc")
        .attr("d", backgroundArc());

      const velocityPath = g.select(".velocity-path");
      velocityPath
        .transition()
        .duration(500)
        .ease(d3.easeQuadOut)
        .attrTween("d", () => {
          const interpolate = d3.interpolate(currentEndAngle.current, newEndAngle);
          return t => velocityArc.endAngle(interpolate(t))();
        })
        .on("end", () => {
          currentEndAngle.current = newEndAngle;
        });

      const needle = g.select("#needle");
      gsap.to(needle.node(), {
        duration: 0.5,
        ease: "power2.out",
        onUpdate: function () {
          const t = this.ratio;
          const angle = currentNeedleAngle.current + t * (newNeedleAngle - currentNeedleAngle.current);
          needle.attr("x2", radius * 0.9 * Math.cos(angle))
            .attr("y2", radius * 0.9 * Math.sin(angle));
        },
        onComplete: () => {
          currentNeedleAngle.current = newNeedleAngle;
        },
      });

      g.select(".velocity-text")
        .attr("y", radius * 0.3)
        .attr("font-size", fontSize)
        .text(`${Math.round(txPerHour)} tx/h`);
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
  }, [txPerHour, maxTxPerHour, loading]);

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
          ref={velocityRef}
          style={{
            width: "100%",
            height: "100%",
          }}
        ></svg>
      )}
    </div>
  );
};

export default VelocityChart;