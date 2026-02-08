import React from 'react';

/**
 * SVG: узлы (круги) и связи между ними с лёгкой пульсацией.
 * Визуализация децентрализованной сети — «волновая» идея распространения сообщений.
 */
const NODES = [
  { cx: 20, cy: 35, r: 4 },
  { cx: 50, cy: 25, r: 5 },
  { cx: 80, cy: 40, r: 4 },
  { cx: 35, cy: 65, r: 4 },
  { cx: 65, cy: 70, r: 5 },
];
const LINKS = [
  [0, 1], [1, 2], [0, 3], [1, 3], [1, 4], [2, 4], [3, 4],
];

function linkPath(n1, n2) {
  const a = NODES[n1];
  const b = NODES[n2];
  const midX = (a.cx + b.cx) / 2;
  const midY = (a.cy + b.cy) / 2;
  return `M ${a.cx} ${a.cy} Q ${midX + 5} ${midY - 5} ${b.cx} ${b.cy}`;
}

export default function WaveNetwork({ width = 100, height = 100, className = '' }) {
  const scaleX = width / 100;
  const scaleY = height / 100;
  return (
    <svg
      viewBox="0 0 100 100"
      width={width}
      height={height}
      className={`wave-network ${className}`}
      aria-hidden
    >
      <defs>
        <linearGradient id="wave-network-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.6" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="0.8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g transform={`scale(${scaleX}, ${scaleY})`}>
        {LINKS.map(([i, j], k) => (
          <path
            key={k}
            d={linkPath(i, j)}
            fill="none"
            stroke="url(#wave-network-grad)"
            strokeWidth="1.2"
            strokeOpacity="0.7"
            className="wave-network-link"
          />
        ))}
        {NODES.map((n, i) => (
          <circle
            key={i}
            cx={n.cx}
            cy={n.cy}
            r={n.r}
            fill="url(#wave-network-grad)"
            filter="url(#glow)"
            className="wave-network-node"
          />
        ))}
      </g>
    </svg>
  );
}
