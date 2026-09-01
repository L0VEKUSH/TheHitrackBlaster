import { useEffect, useRef } from "react";
import { soundManager } from "../audio/soundManager";
import { useHype } from "../core/HypeContext";
import { getActiveInnings } from "../../utils/matchSelectors";

export const useEventTrigger = (match, onEvent) => {
  const { isHypeMode } = useHype();
  const prevMatchRef = useRef(null);
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!match || !prevMatchRef.current) {
      prevMatchRef.current = match;
      return;
    }

    const prevMatch = prevMatchRef.current;
    // Store the snapshot before any early return so an innings transition does
    // not get compared repeatedly on every render.
    prevMatchRef.current = match;

    const currentMatchId = match._id ?? match.id;
    const previousMatchId = prevMatch._id ?? prevMatch.id;
    if (currentMatchId != null && previousMatchId != null &&
        String(currentMatchId) !== String(previousMatchId)) {
      return;
    }

    const currentInn = getActiveInnings(match);
    const prevInn = getActiveInnings(prevMatch);

    if (!currentInn || !prevInn) return;

    const currentCommentary = currentInn.commentary || [];
    const previousCommentary = prevInn.commentary || [];

    // Undo exposes an older commentary entry at index zero. Only a growing
    // authoritative feed represents a new event that should animate or sound.
    if (currentCommentary.length <= previousCommentary.length) return;

    const currentComm = currentCommentary[0];
    const prevComm = previousCommentary[0];
    const currentEventId = currentComm?.eventId || currentComm?.sequence || currentComm?._id;
    const previousEventId = prevComm?.eventId || prevComm?.sequence || prevComm?._id;

    if (currentComm && (!currentEventId || currentEventId !== previousEventId)) {
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
        onEventRef.current?.(eventData);
      }
    }
  }, [match, isHypeMode]);
};
