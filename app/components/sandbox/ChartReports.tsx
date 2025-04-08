"use client";
import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

const ChartReports = ({ view, transactionData, gasData }) => {
  const chartRef = useRef(null);
  const svgRef = useRef(null);

  // Clear chart when view changes
  useEffect(() => {
    if (view !== 'balance' && view !== 'gas' && chartRef.current) {
      d3.select(chartRef.current).selectAll('*').remove();
    }
  }, [view]);

  // Resize handler
  const resizeChart = () => {
    if (!chartRef.current || !svgRef.current) return;
    const container = chartRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const svg = d3.select(svgRef.current);
    svg.attr('width', width).attr('height', height);

    if (view === 'balance') drawBalanceChart(width, height);
    if (view === 'gas') drawGasChart(width, height);
  };

  // Balance Chart
  const drawBalanceChart = (width, height) => {
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 70, right: 20, bottom: 30, left: 40 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const isEmpty = transactionData.every(d => d.transactions === 0);
    if (isEmpty || transactionData.length === 0) return;

    const xScale = d3.scaleBand()
      .domain(transactionData.map(d => d.date))
      .range([0, chartWidth])
      .padding(0.2);

    const yScale = d3.scaleLinear()
      .domain([0, d3.max(transactionData, d => d.transactions) * 1.1 || 5])
      .range([chartHeight, 0]);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    g.selectAll('.grid-line')
      .data(yScale.ticks(5))
      .enter()
      .append('line')
      .attr('x1', 0)
      .attr('x2', chartWidth)
      .attr('y1', d => yScale(d))
      .attr('y2', d => yScale(d))
      .attr('stroke', 'rgba(129, 132, 153, 0.2)')
      .attr('stroke-dasharray', '8,6');

    g.selectAll('.bar')
      .data(transactionData.filter(d => d.transactions > 0))
      .enter()
      .append('path')
      .attr('d', d => {
        const x = xScale(d.date);
        const y = yScale(d.transactions);
        const w = xScale.bandwidth();
        const h = chartHeight - y;
        const r = Math.min(10, w / 2); // Responsive corner radius
        return `M ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} L ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
      })
      .attr('fill', '#7BCFFF');

    g.append('g')
      .attr('transform', `translate(0, ${chartHeight})`)
      .call(d3.axisBottom(xScale))
      .select('.domain')
      .remove();

    g.append('g')
      .call(d3.axisLeft(yScale).ticks(5))
      .select('.domain')
      .remove();
  };

  // Gas Chart
  const drawGasChart = (width, height) => {
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 40, right: 20, bottom: 50, left: 40 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const isEmpty = gasData.every(d => d.gas === '0.000');
    if (isEmpty || gasData.length === 0) return;

    const xScale = d3.scaleBand()
      .domain(gasData.map(d => d.date))
      .range([0, chartWidth])
      .padding(0.2);

    const yScale = d3.scaleLinear()
      .domain([0, d3.max(gasData, d => d.gas) * 1.1 || 0.05])
      .range([chartHeight, 0]);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const line = d3.line()
      .x(d => xScale(d.date) + xScale.bandwidth() / 2)
      .y(d => yScale(d.gas));

    g.append('path')
      .datum(gasData)
      .attr('fill', 'none')
      .attr('stroke', '#7BCFFF')
      .attr('stroke-width', 2)
      .attr('d', line);

    const tooltip = d3.select('body').select('.gas-tooltip') // Reuse or create unique tooltip
      .data([null])
      .enter()
      .append('div')
      .attr('class', 'gas-tooltip')
      .style('position', 'absolute')
      .style('visibility', 'hidden');

    g.selectAll('.dot')
      .data(gasData)
      .enter()
      .append('circle')
      .attr('cx', d => xScale(d.date) + xScale.bandwidth() / 2)
      .attr('cy', d => yScale(d.gas))
      .attr('r', 5)
      .attr('fill', '#7BCFFF')
      .on('mouseover', (event, d) => {
        tooltip.style('visibility', 'visible')
          .text(`Gas: ${d.gas} Gwei`)
          .style('left', `${event.pageX + 10}px`)
          .style('top', `${event.pageY - 10}px`)
          .style('background', 'rgba(255, 255, 255, 0.9)')
          .style('padding', '5px 10px')
          .style('border', '1px solid #ccc')
          .style('border-radius', '3px')
          .style('font-size', '12px');
      })
      .on('mouseout', () => tooltip.style('visibility', 'hidden'));

    g.append('g')
      .attr('transform', `translate(0, ${chartHeight})`)
      .call(d3.axisBottom(xScale))
      .select('.domain')
      .remove();

    g.append('g')
      .call(d3.axisLeft(yScale).ticks(5))
      .select('.domain')
      .remove();
  };

  // Setup chart and resize listener
  useEffect(() => {
    if (!chartRef.current) return;

    // Initial SVG setup
    d3.select(chartRef.current).selectAll('*').remove();
    const svg = d3.select(chartRef.current)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .style('display', 'block');
    svgRef.current = svg.node();

    // Draw initial chart
    resizeChart();

    // Add resize observer
    const observer = new ResizeObserver(() => resizeChart());
    observer.observe(chartRef.current);

    return () => {
      observer.disconnect();
      d3.select('body').select('.gas-tooltip').remove(); // Cleanup tooltip
    };
  }, [view, transactionData, gasData]);

  return (
    <div
      ref={chartRef}
      style={{
        width: '100%',
        minHeight: '350px', // Minimum height
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
      }}
    />
  );
};

export default ChartReports;