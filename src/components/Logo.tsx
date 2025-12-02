
import React from 'react';

export const Logo: React.FC<{ className?: string }> = ({ className = "w-10 h-10" }) => (
  <svg 
    viewBox="0 0 512 512" 
    className={className}
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Dark Background Container (Optional, if we want it self-contained, but usually better transparent) */}
    {/* <rect width="512" height="512" rx="100" fill="#0f172a"/> */}
    
    {/* Camera Body */}
    <rect 
      x="96" 
      y="160" 
      width="320" 
      height="240" 
      rx="40" 
      stroke="#39ff14" 
      strokeWidth="32" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
    />
    
    {/* Lens */}
    <circle 
      cx="256" 
      cy="280" 
      r="60" 
      stroke="#39ff14" 
      strokeWidth="32" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
    />
    
    {/* Flash / Top Part */}
    <path 
      d="M190 160 L210 110 H302 L322 160" 
      stroke="#39ff14" 
      strokeWidth="32" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
    />
    
    {/* Small Detail */}
    <circle cx="360" cy="200" r="16" fill="#39ff14"/>
  </svg>
);

export default Logo;
