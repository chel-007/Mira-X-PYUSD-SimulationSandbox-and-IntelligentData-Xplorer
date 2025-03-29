"use client";
import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

const ChartReports = ({ view, transactionData, gasData }) => {
  const chartRef = useRef(null);

  useEffect(() => {
    if (view !== 'balance' && view !== 'gas' && chartRef.current) {
      d3.select(chartRef.current).selectAll('*').remove();
    }
  }, [view]);

  useEffect(() => {
    if (view !== 'balance' || !chartRef.current) return;

    d3.select(chartRef.current).selectAll('*').remove();
    const svg = d3.select(chartRef.current)
      .append('svg')
      .attr('width', '100%')
      .attr('height', 350) // Increased height to 300px
      .style('display', 'block');

    const width = chartRef.current.clientWidth;
    const height = 350; // Match the SVG height
    const margin = { top: 70, right: 20, bottom: 20, left: 40 }; // Increased top and bottom margins

    const isEmpty = transactionData.every(d => d.transactions === 0);
    if (isEmpty || transactionData.length === 0) return; // Let Wallets.tsx handle no-data

    const xScale = d3.scaleBand()
      .domain(transactionData.map(d => d.date))
      .range([margin.left, width - margin.right])
      .padding(0.2);

    const yScale = d3.scaleLinear()
      .domain([0, d3.max(transactionData, d => d.transactions) * 1.1 || 5])
      .range([height - margin.bottom, margin.top]);

    svg.selectAll('.grid-line')
      .data(yScale.ticks(5))
      .enter()
      .append('line')
      .attr('x1', margin.left)
      .attr('x2', width - margin.right)
      .attr('y1', d => yScale(d))
      .attr('y2', d => yScale(d))
      .attr('stroke', 'rgba(129, 132, 153, 0.2)')
      .attr('stroke-dasharray', '8,6');

    svg.selectAll('.bar')
      .data(transactionData.filter(d => d.transactions > 0))
      .enter()
      .append('path')
      .attr('d', d => {
        const x = xScale(d.date);
        const y = yScale(d.transactions);
        const w = xScale.bandwidth();
        const h = height - margin.bottom - y;
        const r = 10;
        return `M ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} L ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
      })
      .attr('fill', '#7BCFFF');

    svg.append('g')
      .attr('transform', `translate(0, ${height - margin.bottom})`)
      .call(d3.axisBottom(xScale))
      .select('.domain')
      .remove();

    svg.append('g')
      .attr('transform', `translate(${margin.left}, 0)`)
      .call(d3.axisLeft(yScale).ticks(5))
      .select('.domain')
      .remove();
  }, [view, transactionData]);

  useEffect(() => {
    if (view !== 'gas' || !chartRef.current) return;

    d3.select(chartRef.current).selectAll('*').remove();
    const svg = d3.select(chartRef.current)
      .append('svg')
      .attr('width', '100%')
      .attr('height', 300) // Increased height to 300px
      .style('display', 'block');

    const width = chartRef.current.clientWidth;
    const height = 300; // Match the SVG height
    const margin = { top: 40, right: 20, bottom: 50, left: 40 }; // Increased top and bottom margins

    const isEmpty = gasData.every(d => d.gas === '0.000');
    if (isEmpty || gasData.length === 0) return; // Let Wallets.tsx handle no-data

    const xScale = d3.scaleBand()
      .domain(gasData.map(d => d.date))
      .range([margin.left, width - margin.right])
      .padding(0.2);

    const yScale = d3.scaleLinear()
      .domain([0, d3.max(gasData, d => d.gas) * 1.1 || 0.05])
      .range([height - margin.bottom, margin.top]);

    const line = d3.line()
      .x(d => xScale(d.date) + xScale.bandwidth() / 2)
      .y(d => yScale(d.gas));

    svg.append('path')
      .datum(gasData)
      .attr('fill', 'none')
      .attr('stroke', '#7BCFFF')
      .attr('stroke-width', 2)
      .attr('d', line);

    const tooltip = d3.select('body').append('div').style('position', 'absolute');
    svg.selectAll('.dot')
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

    svg.append('g')
      .attr('transform', `translate(0, ${height - margin.bottom})`)
      .call(d3.axisBottom(xScale))
      .select('.domain')
      .remove();
  }, [view, gasData]);

  return (
    <div
      ref={chartRef}
      style={{
        width: '100%',
        height: '300px', // Increased height to 300px
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center', // Center vertically
      }}
    />
  );
};

export default ChartReports;