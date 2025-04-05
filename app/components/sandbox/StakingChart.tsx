"use client";
import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

const StakingChart = ({ stakingData, address }) => {
  const chartRef = useRef(null);

  const contractAddresses = {
    'Curve PYUSD/USDC': '0x383E6b4437b59fff47B619CBA855CA29342A8559',
    'Curve PYUSD/crvUSD': '0x625E92624Bc2D88619ACCc1788365A69767f6200',
    'Uniswap PYUSD/USDT': '0xDd2e0D86A45e4EF9bd490c2809E6405720cC357c',
  };

  useEffect(() => {
    if (!chartRef.current || !stakingData.length) return;

    // Clear existing content
    d3.select(chartRef.current).selectAll('*').remove();

    // Use all pools, not just active ones
    const activePools = stakingData; // No filtering for stakeAmount > 0

    const width = chartRef.current.clientWidth || 800;
    const height = 380;
    const centerX = width / 2;
    const centerY = height / 2;

    const svg = d3.select(chartRef.current)
      .append('svg')
      .attr('width', width)
      .attr('height', height);

    // Define gradients and filters
    const defs = svg.append('defs');

    // Pool gradients
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

    // Glow filter for PYUSD icon
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

    // Calculate total stake for percentages
    const totalStake = d3.sum(activePools, d => d.stakeAmount) || 1;
    const radiusInnest = 40;
    const radiusInner = 100;
    const radiusOuter = 160;

    // Create arc group centered in SVG
    const arcGroup = svg.append('g')
      .attr('transform', `translate(${centerX}, ${centerY})`);

    // Draw concentric circles
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

    // Add PYUSD icon in the inner circle
    arcGroup.append('image')
      .attr('xlink:href', '/pyusd-icon.svg')
      .attr('x', -25)
      .attr('y', -25)
      .attr('width', 50)
      .attr('height', 50)
      .attr('filter', 'url(#glow)');

// Create percentage-based arcs and text labels
let startAngle = 0;
const offset = 20; // Adjust this value to position labels further or closer
activePools.forEach((d, i) => {
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

  // Add text label at the midpoint of the arc, slightly outside the outer circle
    const midAngle = (startAngle + endAngle) / 2;
    const labelRadius = radiusOuter + offset;
    const labelX = labelRadius * Math.sin(midAngle);
    const labelY = -labelRadius * Math.cos(midAngle);

    arcGroup.append('text')
        .attr('x', labelX)
        .attr('y', labelY)
        .attr('text-anchor', 'middle')
        .attr('fill', '#fff')
        .attr('font-size', '12px')
        .text(d.pool);

    startAngle = endAngle;
    });

    // Single sweep effect
    const maxRadius = radiusOuter + 10;
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
    const legend = svg.append('g')
      .attr('transform', `translate(${centerX + 200}, 100)`);

    stakingData.forEach((d, i) => {
      const gradientId = d.pool.replace(/[^a-zA-Z0-9]/g, '-');
      const yOffset = i * 60;
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
        .attr('font-size', '12px')
        .text(`${d.pool}`);

      legend.append('text')
        .attr('x', 20)
        .attr('y', yOffset + 30)
        .attr('fill', '#ccc')
        .attr('font-size', '14px')
        .text(`Stake: ${d.stakeAmount} PYUSD`);

      legend.append('text')
        .attr('x', 20)
        .attr('y', yOffset + 45)
        .attr('fill', '#ccc')
        .attr('font-size', '11px')
        .text(`APY: ${d.apy}% | TVL: $${d.tvl.toLocaleString()}`);
    });

    // APY and TVL explanation on the left side
    const infoGroup = svg.append('g')
    .attr('transform', `translate(${centerX - 380}, 110)`);

    // Tooltip div (attached to chart container)
    const chartContainer = d3.select(chartRef.current);
    const tooltip = chartContainer.append('div')
    .style('position', 'absolute')
    .style('visibility', 'hidden')
    .style('background', 'rgba(129, 132, 153, 0.25)')
    .style('padding', '3px 8px')
    .style('border-radius', '8px')
    .style('font-size', '10px')
    .style('color', '#9196b0')
    .style('pointer-events', 'none'); // Changed from 'cursor' to 'none' to prevent tooltip interaction

    // Programmatic Contract Address info
    stakingData.forEach((d, i) => {
    const infoItem = infoGroup.append('g')
        .attr('class', 'info-item')
        .attr('transform', `translate(0, ${i * 40})`);

    // Circle for the "i"
    const infoCircle = infoItem.append('circle')
        .attr('cx', 0)
        .attr('cy', 0)
        .attr('r', 8)
        .attr('fill', 'none')
        .attr('stroke', '#818499')
        .attr('stroke-width', 1);

    // "i" text inside the circle
    const infoIcon = infoItem.append('text')
        .attr('x', 0)
        .attr('y', 4)
        .attr('text-anchor', 'middle')
        .attr('fill', '#fff')
        .attr('font-size', '12px')
        .text('i');

    // Pool contract text
    infoItem.append('text')
        .attr('x', 20)
        .attr('y', 4)
        .attr('fill', '#fff')
        .attr('font-size', '12px')
        .text(`${d.pool}`);

    // Add hover behavior only to the circle and "i" text
    const hoverGroup = infoItem.append('g')
        .style('cursor', 'pointer'); // Hand cursor on hover

    // Add invisible circle for better hover area
    hoverGroup.append('circle')
        .attr('cx', 0)
        .attr('cy', 0)
        .attr('r', 10) // Slightly larger than the visible circle for better hover area
        .attr('fill', 'transparent');

    hoverGroup.on('mouseover', (event) => {
        const contractAddress = contractAddresses[d.pool] || 'Not available';
        // const bbox = infoItem.node().getBBox(); 
        // const svgPoint = svg.node().createSVGPoint();
        // svgPoint.x = bbox.x;
        // svgPoint.y = bbox.y;
        // const coords = svgPoint.matrixTransform(svg.node().getScreenCTM());

        tooltip.style('visibility', 'visible')
        .text(`Contract Address: ${contractAddress}`)
        .style('left', `${event.layerX + 10}px`) // Position to the right of the text
        .style('top', `${event.layerY - 25}px`); // Position above the text
    })
    .on('mouseout', () => tooltip.style('visibility', 'hidden'));
    });

  }, [stakingData, address]);

  return (
    <div
      ref={chartRef}
      style={{
        width: '100%',
        height: '300px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative', // Contain tooltips within this div
      }}
    />
  );
};

export default StakingChart;