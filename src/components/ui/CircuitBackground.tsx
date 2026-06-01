'use client'

interface CircuitBackgroundProps {
  pulse?: boolean
}

export function CircuitBackground({ pulse = false }: CircuitBackgroundProps) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
      <svg
        viewBox="0 0 600 500"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
        className="w-full h-full"
      >
        <style>{`
          .tr { fill: none; }

          /* Slow draw traces — idle/preview state */
          .t1 {
            stroke: #5e6ad2; stroke-width: 1.2;
            stroke-dasharray: 800; stroke-dashoffset: 800;
            animation: drawOn 7s ease-in-out infinite alternate;
          }
          .t2 {
            stroke: #828fff; stroke-width: 0.7;
            stroke-dasharray: 600; stroke-dashoffset: 600;
            animation: drawOn 10s ease-in-out 1s infinite alternate;
          }
          .t3 {
            stroke: #3a3f6b; stroke-width: 1.0;
            stroke-dasharray: 700; stroke-dashoffset: 700;
            animation: drawOn 8.5s ease-in-out 2s infinite alternate;
          }
          @keyframes drawOn {
            0%   { stroke-dashoffset: 800; opacity: 0; }
            8%   { opacity: 1; }
            78%  { stroke-dashoffset: 0; opacity: 1; }
            100% { stroke-dashoffset: 0; opacity: 0.45; }
          }

          /* Fast pulse traces — processing state */
          .t1f { stroke: #5e6ad2; stroke-width: 1.6; stroke-dasharray: 800; stroke-dashoffset: 0; animation: tracePulse 1.1s ease-in-out infinite alternate; }
          .t2f { stroke: #828fff; stroke-width: 1.0; stroke-dasharray: 600; stroke-dashoffset: 0; animation: tracePulse 0.85s ease-in-out 0.3s infinite alternate; }
          .t3f { stroke: #5e6ad2; stroke-width: 0.8; stroke-dasharray: 700; stroke-dashoffset: 0; animation: tracePulse 1.4s ease-in-out 0.6s infinite alternate; }
          @keyframes tracePulse { 0% { opacity: 0.15 } 100% { opacity: 1 } }

          .nd  { fill: #5e6ad2; animation: np 3s ease-in-out infinite alternate; }
          .nd2 { fill: #828fff; animation: np 4s ease-in-out 0.5s infinite alternate; }
          @keyframes np { 0% { r: 3; opacity: 0.3; } 100% { r: 5.5; opacity: 1; } }
        `}</style>

        {/* Slow draw traces (idle) — hidden when pulsing */}
        {!pulse && <>
          <path className="tr t1" d="M0 110 H90 V60 H230 V110 H330 V80 H600" />
          <path className="tr t2" d="M230 110 V200 H110 V300 H280 V250 H390 V330 H600" />
          <path className="tr t3" d="M110 300 V400 H270 V490" />
        </>}

        {/* Fast pulse traces (processing) */}
        {pulse && <>
          <path className="tr t1f" d="M0 110 H90 V60 H230 V110 H330 V80 H600" />
          <path className="tr t2f" d="M230 110 V200 H110 V300 H280 V250 H390 V330 H600" />
          <path className="tr t3f" d="M110 300 V400 H270 V490" />
        </>}

        {/* Nodes — always visible */}
        <circle className="nd"  cx="90"  cy="110" r="3" />
        <circle className="nd2" cx="230" cy="110" r="3" />
        <circle className="nd"  cx="330" cy="80"  r="3" />
        <circle className="nd2" cx="110" cy="300" r="3" />
        <circle className="nd"  cx="280" cy="250" r="3" />
        <circle className="nd2" cx="270" cy="490" r="3" />
      </svg>
    </div>
  )
}
