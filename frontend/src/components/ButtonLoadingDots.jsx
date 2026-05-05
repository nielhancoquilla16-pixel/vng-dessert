import React from 'react';

const ButtonLoadingDots = () => (
  <div className="flex flex-row gap-2" aria-hidden="true">
    <div className="w-4 h-4 rounded-full bg-red-500 animate-bounce"></div>
    <div className="w-4 h-4 rounded-full bg-orange-500 animate-bounce [animation-delay:-.3s]"></div>
    <div className="w-4 h-4 rounded-full bg-yellow-400 animate-bounce [animation-delay:-.5s]"></div>
  </div>
);

export default ButtonLoadingDots;
