import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, createCheck, getCheck } from "./api";
import type { Check } from "./types";

const POLL_MS = 1000;

export const isFinal = (c: Check) => c.status === "done" || c.status === "error";

// Owns submit + polling. One check is followed at a time; starting another
// (or unmounting) cancels the pending timer and ignores late responses.
export function useCheck(onFinished: () => void) {
  const [check, setCheck] = useState<Check | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const run = useRef(0);
  const [lastId, setLastId] = useState<string | null>(null);
  const finished = useRef(onFinished);
  useEffect(() => {
    finished.current = onFinished;
  });

  const stop = useCallback(() => {
    run.current += 1;
    window.clearTimeout(timer.current);
    return run.current;
  }, []);

  const follow = useCallback(
    async function follow(id: string, mine: number) {
      setLastId(id);
      try {
        const next = await getCheck(id);
        if (mine !== run.current) return;
        setCheck(next);
        if (isFinal(next)) finished.current();
        else timer.current = window.setTimeout(() => void follow(id, mine), POLL_MS);
      } catch (e) {
        if (mine !== run.current) return;
        setError(e instanceof ApiError ? e.message : "Something went wrong while loading the check.");
      }
    },
    [],
  );

  useEffect(
    () => () => {
      stop();
    },
    [stop],
  );

  const submit = useCallback(
    async (answer: string) => {
      const mine = stop();
      setError(null);
      setCheck(null);
      setSubmitting(true);
      setLastId(null);
      try {
        const { id } = await createCheck({ answer });
        if (mine !== run.current) return;
        setSubmitting(false);
        await follow(id, mine);
      } catch (e) {
        if (mine !== run.current) return;
        setSubmitting(false);
        setError(e instanceof ApiError ? e.message : "Could not start the check.");
      }
    },
    [stop, follow],
  );

  const open = useCallback(
    (id: string) => {
      const mine = stop();
      setError(null);
      setSubmitting(false);
      void follow(id, mine);
    },
    [stop, follow],
  );

  const retry = useCallback(() => {
    if (lastId) open(lastId);
  }, [lastId, open]);

  // Shows a ready-made check without any network call (dev preview only).
  const show = useCallback(
    (c: Check) => {
      stop();
      setError(null);
      setCheck(c);
    },
    [stop],
  );

  const running = submitting || (check !== null && !isFinal(check) && error === null);
  return { check, running, error, canRetry: lastId !== null, submit, open, retry, show };
}
