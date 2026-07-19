import type { BaseSecureClient } from '@polymarket/client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePolymarketContext } from './context';
import { UnauthenticatedError } from './errors';
import { isSessionRevocation } from './read';

export type WriteStatus = 'idle' | 'pending' | 'success' | 'error';

/**
 * State shape shared by all write hooks.
 */
export type WriteResult<TData, TError> = {
  /** Current operation status. */
  status: WriteStatus;
  /** Result of the last successful execution, or `undefined`. */
  data: TData | undefined;
  /** Error from the last execution, or `undefined`. */
  error: TError | undefined;
  /** Returns the state to `'idle'`, discarding any in-flight execution. */
  reset: () => void;
};

/**
 * State shape shared by write hooks that drive a wallet-interactive workflow.
 */
export type WorkflowWriteResult<
  TData,
  TError,
  TStepKind extends string,
> = WriteResult<TData, TError> & {
  /** Kind of the workflow step currently awaiting the wallet, while pending. */
  step: TStepKind | undefined;
};

type WriteState<TData, TError, TStepKind extends string> = {
  status: WriteStatus;
  data: TData | undefined;
  error: TError | undefined;
  step: TStepKind | undefined;
};

const idleState = {
  status: 'idle',
  data: undefined,
  error: undefined,
  step: undefined,
} satisfies WriteState<never, never, never>;

/**
 * Shared imperative write state machine over the session client. Executions
 * reject with `UnauthenticatedError` while unauthenticated, surface failures
 * on `error` as well as rethrowing them for imperative callers, report
 * workflow steps while pending, end the session on unauthorized rejections,
 * discard stale results after `reset`, and never update state after unmount.
 *
 * @internal
 */
export function useSecureWrite<
  TArgs extends unknown[],
  TData,
  TError,
  TStepKind extends string = never,
>(
  run: (
    client: BaseSecureClient,
    onStep: (kind: TStepKind) => void,
    ...args: TArgs
  ) => Promise<TData>,
): [
  execute: (...args: TArgs) => Promise<TData>,
  state: WorkflowWriteResult<TData, TError, TStepKind>,
] {
  const { secureClient, clearSession } = usePolymarketContext();

  const clientRef = useRef(secureClient);
  clientRef.current = secureClient;
  const runRef = useRef(run);
  runRef.current = run;

  const generationRef = useRef(0);
  const [state, setState] =
    useState<WriteState<TData, TError, TStepKind>>(idleState);

  useEffect(() => {
    return () => {
      generationRef.current += 1;
    };
  }, []);

  const execute = useCallback(
    async (...args: TArgs): Promise<TData> => {
      const client = clientRef.current;
      const generation = ++generationRef.current;

      if (client === undefined) {
        const error = new UnauthenticatedError();

        setState({
          status: 'error',
          data: undefined,
          error: error as TError,
          step: undefined,
        });
        throw error;
      }

      setState({
        status: 'pending',
        data: undefined,
        error: undefined,
        step: undefined,
      });

      const onStep = (kind: TStepKind) => {
        if (generationRef.current === generation) {
          setState((previous) => ({ ...previous, step: kind }));
        }
      };

      try {
        const data = await runRef.current(client, onStep, ...args);

        if (generationRef.current === generation) {
          setState({
            status: 'success',
            data,
            error: undefined,
            step: undefined,
          });
        }

        return data;
      } catch (error) {
        if (isSessionRevocation(error)) {
          clearSession(error);
        }

        if (generationRef.current === generation) {
          setState({
            status: 'error',
            data: undefined,
            error: error as TError,
            step: undefined,
          });
        }

        throw error;
      }
    },
    [clearSession],
  );

  const reset = useCallback(() => {
    generationRef.current += 1;
    setState(idleState);
  }, []);

  return [
    execute,
    {
      status: state.status,
      data: state.data,
      error: state.error,
      step: state.step,
      reset,
    },
  ];
}
