import { useEffect, useRef } from "react";
import { soundManager } from "../audio/soundManager";
import { useHype } from "../core/HypeContext";

export const useEventTrigger = (match, onEvent) => {
  const { isHypeMode } = useHype();
  const prevMatchRef = useRef(null);

  useEffect(() => {
    if (!match || !prevMatchRef.current) {
      prevMatchRef.current = match;
      return;
    }

    const prevMatch = prevMatchRef.current;
    const currentInn = match.currentInnings === 2 ? match.innings2 : match.innings1;
    const prevInn = prevMatch.currentInnings === 2 ? prevMatch.innings2 : prevMatch.innings1;

    if (!currentInn || !prevInn) return;

    // Detect Six
    const currentComm = currentInn.commentary?.[0];
    const prevComm = prevInn.commentary?.[0];

    if (currentComm && currentComm !== prevComm) {
      const eventData = {
        type: null,
        value: currentComm.runs,
        isWicket: currentComm.isWicket,
        text: currentComm.text
      };

      if (currentComm.isWicket) {
        eventData.type = "WICKET";
        if (isHypeMode) soundManager.play("WICKET");
      } else if (currentComm.runs === 6) {
        eventData.type = "SIX";
        if (isHypeMode) soundManager.play("SIX");
      } else if (currentComm.runs === 4) {
        eventData.type = "FOUR";
        if (isHypeMode) soundManager.play("BOUNDARY");
      }

      if (eventData.type) {
        onEvent(eventData);
      }
    }

    prevMatchRef.current = match;
  }, [match, isHypeMode, onEvent]);
};
