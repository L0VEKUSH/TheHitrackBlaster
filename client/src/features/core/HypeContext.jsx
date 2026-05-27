import React, { createContext, useContext, useState, useEffect } from "react";

const HypeContext = createContext();

export const HypeProvider = ({ children }) => {
  const [isHypeMode, setIsHypeMode] = useState(() => {
    const saved = localStorage.getItem("hypeMode");
    return saved !== null ? JSON.parse(saved) : true;
  });

  useEffect(() => {
    localStorage.setItem("hypeMode", JSON.stringify(isHypeMode));
  }, [isHypeMode]);

  const toggleHypeMode = () => setIsHypeMode(prev => !prev);

  return (
    <HypeContext.Provider value={{ isHypeMode, toggleHypeMode }}>
      {children}
    </HypeContext.Provider>
  );
};

export const useHype = () => {
  const context = useContext(HypeContext);
  if (!context) throw new Error("useHype must be used within HypeProvider");
  return context;
};
