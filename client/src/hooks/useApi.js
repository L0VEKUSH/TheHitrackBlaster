// src/hooks/useApi.js
import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Exponential backoff retry logic
 */
const retryWithBackoff = async (apiFn, maxRetries = 3, baseDelay = 1000) => {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await Promise.race([
        apiFn(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Request timeout")), 30000)
        )
      ]);
    } catch (err) {
      lastError = err;

      // Don't retry on 4xx errors (client errors) except 408, 429, 503
      const statusCode = err.response?.status;
      if (statusCode && statusCode >= 400 && statusCode < 500 && ![408, 429, 503].includes(statusCode)) {
        throw err;
      }

      // Don't retry on last attempt
      if (attempt === maxRetries) break;

      // Exponential backoff
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
};

export function useApi(apiFn, deps = [], immediate = true, options = {}) {
  const { maxRetries = 2, timeout = 30000 } = options;
  
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState(null);
  const isMountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const execute = useCallback(async (...args) => {
    setLoading(true);
    setError(null);

    try {
      const result = await retryWithBackoff(
        () => apiFn(...args),
        maxRetries,
        1000
      );

      // Only update state if component is still mounted
      if (isMountedRef.current) {
        setData(result.data || result);
        setLoading(false);
      }

      return result.data || result;
    } catch (err) {
      if (!isMountedRef.current) return;

      let errorMsg = err.message;

      if (err.response?.data?.message) {
        errorMsg = err.response.data.message;
      } else if (err.message === "Request timeout") {
        errorMsg = "Request timed out. Please check your connection.";
      } else if (err.code === "ERR_NETWORK") {
        errorMsg = "Network error. Please check your internet connection.";
      }

      setError(errorMsg);
      setLoading(false);
      console.error("API Error:", err);
      throw err;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (immediate) {
      execute().catch(err => {
        // Error is already handled in execute
        console.warn("Initial API call failed:", err.message);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { data, loading, error, execute, setData };
}

/**
 * Hook for manual API calls with retry logic
 */
export function useApiCall() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const call = useCallback(async (apiFn, options = {}) => {
    const { maxRetries = 2 } = options;
    setLoading(true);
    setError(null);

    try {
      const result = await retryWithBackoff(apiFn, maxRetries);
      setLoading(false);
      return result;
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.message;
      setError(errorMsg);
      setLoading(false);
      throw err;
    }
  }, []);

  return { loading, error, call };
}
