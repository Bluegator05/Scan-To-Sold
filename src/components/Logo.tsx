
import React from 'react';

export const Logo: React.FC<{ className?: string }> = ({ className = "w-10 h-10" }) => (
  <img
    src="/icon.png"
    alt="ScanToSold Logo"
    className={`${className} object-contain rounded-xl`}
  />
);

export default Logo;
