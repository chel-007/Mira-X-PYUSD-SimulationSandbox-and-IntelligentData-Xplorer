"use client";
import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

const StakingChart = ({ stakingData, address }) => {
  const chartRef = useRef(null);
  const svgRef = useRef(null);

  const contractAddresses = {
    'Curve PYUSD/USDC': '0x383E6b4437b59fff47B619CBA855CA29342A8559',
    'Curve PYUSD/crvUSD': '0x625E92624Bc2D88619ACCc1788365A69767f6200',
  };

  const drawChart = (width, height) => {
    if (!chartRef.current || !stakingData.length) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const activePools = stakingData;
    const centerX = width / 2;
    const centerY = height / 2;
    const baseRadius = Math.min(width, height) / 2;
    const radiusInnest = baseRadius * 0.25;
    const radiusInner = baseRadius * 0.6;
    const radiusOuter = baseRadius;

    // Define gradients and filters
    const defs = svg.append('defs');
    activePools.forEach((d, i) => {
      const gradientId = d.pool.replace(/[^a-zA-Z0-9]/g, '-');
      const gradient = defs.append('linearGradient')
        .attr('id', `${gradientId}Gradient`)
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '100%')
        .attr('y2', '100%');
      gradient.append('stop')
        .attr('offset', '10%')
        .attr('stop-color', i === 0 ? 'rgba(43, 139, 234, 0.08)' : i === 1 ? 'rgba(167, 218, 255, 0.08)' : 'rgba(0, 124, 12, 0.08)')
        .attr('stop-opacity', 0.4);
      gradient.append('stop')
        .attr('offset', '90%')
        .attr('stop-color', i === 0 ? 'rgb(39, 146, 252)' : i === 1 ? '#818499' : 'rgb(0, 124, 12)')
        .attr('stop-opacity', 0.8);
    });

    const glowFilter = defs.append('filter')
      .attr('id', 'glow')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%');
    glowFilter.append('feGaussianBlur')
      .attr('stdDeviation', '1')
      .attr('result', 'blur');
    glowFilter.append('feColorMatrix')
      .attr('type', 'matrix')
      .attr('values', '0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0');

    const totalStake = d3.sum(activePools, d => d.stakeAmount) || 1;

    const arcGroup = svg.append('g')
      .attr('transform', `translate(${centerX}, ${centerY})`);

    // Concentric circles
    arcGroup.append('circle')
      .attr('r', radiusInnest)
      .attr('fill', 'none')
      .attr('stroke', '#818499')
      .attr('stroke-width', 1);

    arcGroup.append('circle')
      .attr('r', radiusInner)
      .attr('fill', 'none')
      .attr('stroke', '#818499c7')
      .attr('stroke-width', 1);

    arcGroup.append('circle')
      .attr('r', radiusOuter)
      .attr('fill', 'none')
      .attr('stroke', '#818499')
      .attr('stroke-width', 1);

    // PYUSD icon
    const iconSize = radiusInnest * 1.2;
    arcGroup.append('image')
      .attr('xlink:href', '/pyusd-icon.svg')
      .attr('x', -iconSize / 2)
      .attr('y', -iconSize / 2)
      .attr('width', iconSize)
      .attr('height', iconSize)
      .attr('filter', 'url(#glow)');

    // Percentage arcs and labels
    let startAngle = 0;
    const offset = baseRadius * 0.15;
    activePools.forEach((d) => {
      const gradientId = d.pool.replace(/[^a-zA-Z0-9]/g, '-');
      const stakePercentage = d.stakeAmount / totalStake;
      const endAngle = startAngle + (stakePercentage * 2 * Math.PI);

      const arc = d3.arc()
        .innerRadius(radiusInnest)
        .outerRadius(radiusOuter)
        .startAngle(startAngle)
        .endAngle(endAngle);

      arcGroup.append('path')
        .attr('d', arc)
        .attr('fill', `url(#${gradientId}Gradient)`);

      const midAngle = (startAngle + endAngle) / 2;
      const labelRadius = radiusOuter + offset;
      const labelX = labelRadius * Math.sin(midAngle);
      const labelY = -labelRadius * Math.cos(midAngle);

      arcGroup.append('text')
        .attr('x', labelX)
        .attr('y', labelY)
        .attr('text-anchor', 'middle')
        .attr('fill', '#fff')
        .attr('font-size', Math.min(12, baseRadius * 0.06))
        .text(d.pool);

      startAngle = endAngle;
    });

    // Sweep effect
    const maxRadius = radiusOuter + baseRadius * 0.06;
    const sweepArc = d3.arc()
      .innerRadius(0)
      .outerRadius(maxRadius);

    const sweepGradient = defs.append('linearGradient')
      .attr('id', 'sweepGradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '100%')
      .attr('y2', '100%');
    sweepGradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', 'rgba(129, 132, 153, 0.08)')
      .attr('stop-opacity', 1);
    sweepGradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', 'rgba(129, 132, 153, 0.08)')
      .attr('stop-opacity', 0);

    arcGroup.append('path')
      .attr('fill', 'url(#sweepGradient)')
      .transition()
      .duration(2000)
      .ease(d3.easeLinear)
      .attrTween('d', () => {
        const interpolate = d3.interpolate(0, 2 * Math.PI);
        return t => sweepArc({ startAngle: 0, endAngle: interpolate(t) });
      });

    // Legend
    const legendX = width > 600 ? centerX + baseRadius * 1.6 : 20;
    const legend = svg.append('g')
      .attr('transform', `translate(${legendX}, ${height > 300 ? 100 : 20})`);

    stakingData.forEach((d, i) => {
      const gradientId = d.pool.replace(/[^a-zA-Z0-9]/g, '-');
      const yOffset = i * (height > 300 ? 80 : 40);
      legend.append('rect')
        .attr('x', 0)
        .attr('y', yOffset)
        .attr('width', 10)
        .attr('height', 10)
        .attr('fill', `url(#${gradientId}Gradient)`);

      legend.append('text')
        .attr('x', 20)
        .attr('y', yOffset + 10)
        .attr('fill', '#fff')
        .attr('font-size', Math.min(12, baseRadius * 0.06))
        .text(`${d.pool}`);

      legend.append('text')
        .attr('x', 20)
        .attr('y', yOffset + 30)
        .attr('fill', '#ccc')
        .attr('font-size', Math.min(14, baseRadius * 0.07))
        .text(`Stake: ${d.stakeAmount} PYUSD`);

      legend.append('text')
        .attr('x', 20)
        .attr('y', yOffset + 50)
        .attr('fill', '#ccc')
        .attr('font-size', Math.min(18, baseRadius * 0.06))
        .text(`APY: ${d.apy}% | TVL: $${d.tvl.toLocaleString()}`);
    });

    // Info group
// Info group
const infoX = width > 600 ? centerX - baseRadius * 2.5 : 20;
const infoGroup = svg.append('g')
  .attr('transform', `translate(${infoX}, ${Math.max(20, baseRadius * 0.65)})`); // Dynamic top padding

// Tooltip (append directly, no .data().enter())
const tooltip = d3.select(chartRef.current)
  .append('div')
  .attr('class', 'staking-tooltip')
  .style('position', 'absolute')
  .style('visibility', 'hidden')
  .style('background', 'rgba(129, 132, 153, 0.25)')
  .style('padding', '3px 8px')
  .style('border-radius', '8px')
  .style('font-size', '10px')
  .style('color', '#9196b0')
  .style('pointer-events', 'none');

stakingData.forEach((d, i) => {
  const spacing = Math.max(30, baseRadius * 0.2); // Minimum 30px, scales with radius
  const infoItem = infoGroup.append('g')
    .attr('transform', `translate(0, ${i * spacing})`);

  infoItem.append('circle')
    .attr('cx', 0)
    .attr('cy', 0)
    .attr('r', Math.min(8, baseRadius * 0.04))
    .attr('fill', 'none')
    .attr('stroke', '#818499')
    .attr('stroke-width', 1);

  infoItem.append('text')
    .attr('x', 0)
    .attr('y', 4)
    .attr('text-anchor', 'middle')
    .attr('fill', '#fff')
    .attr('font-size', Math.min(14, baseRadius * 0.06))
    .text('i');

  infoItem.append('text')
    .attr('x', 20)
    .attr('y', 4)
    .attr('fill', '#fff')
    .attr('font-size', Math.min(14, baseRadius * 0.06))
    .text(`${d.pool}`);

  const hoverGroup = infoItem.append('g')
    .style('cursor', 'pointer');

  hoverGroup.append('circle')
    .attr('cx', 0)
    .attr('cy', 0)
    .attr('r', Math.min(10, baseRadius * 0.05))
    .attr('fill', 'transparent');

  hoverGroup.on('mouseover', (event) => {
    const contractAddress = contractAddresses[d.pool] || 'Not available';
    tooltip.style('visibility', 'visible')
      .text(`Contract Address: ${contractAddress}`)
      .style('left', `${event.layerX + 10}px`)
      .style('top', `${event.layerY - 25}px`);
  })
  .on('mouseout', () => tooltip.style('visibility', 'hidden'));
});
  };

  useEffect(() => {
    if (!chartRef.current) return;

    d3.select(chartRef.current).selectAll('*').remove();
    const svg = d3.select(chartRef.current)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .style('display', 'block');
    svgRef.current = svg.node();

    const resizeChart = () => {
      const width = chartRef.current.clientWidth;
      const height = chartRef.current.clientHeight;
      svg.attr('width', width).attr('height', height);
      drawChart(width, height);
    };

    resizeChart();
    const observer = new ResizeObserver(() => resizeChart());
    observer.observe(chartRef.current);

    return () => {
      observer.disconnect();
      d3.select(chartRef.current).select('.staking-tooltip').remove();
    };
  }, [stakingData, address]);

  return (
    <div
      ref={chartRef}
      style={{
        width: '100%',
        minHeight: '350px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    />
  );
};

export default StakingChart;