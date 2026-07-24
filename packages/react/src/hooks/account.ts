import type {
  BalanceAllowanceResponse,
  BaseSecureClient,
  NotificationsResponse,
} from '@polymarket/client';
import type {
  DropNotificationsError,
  DropNotificationsRequest,
  FetchBalanceAllowanceError,
  FetchBalanceAllowanceRequest,
  FetchClosedOnlyModeError,
  FetchNotificationsError,
} from '@polymarket/client/actions';
import {
  dropNotifications,
  fetchBalanceAllowance,
  fetchClosedOnlyMode,
  fetchNotifications,
} from '@polymarket/client/actions';
import { useCallback } from 'react';
import type { UnauthenticatedError } from '../errors';
import type { ReadResult } from '../read';
import { useSecureClientAction } from '../read';
import type { Skip } from '../skip';
import type { WriteResult } from '../write';
import { useSecureWrite } from '../write';

type EmptyRequest = Record<string, never>;

/**
 * Fetches the session account's balance and allowance for an asset.
 *
 * @remarks
 * Pauses until a session is active. Useful for affordance checks before
 * placing orders; an order rejected for insufficient funds surfaces as
 * `InsufficientAllowanceError`. Errors surface on `error` as
 * {@link FetchBalanceAllowanceError}. Pass `skip` instead of the request to
 * pause fetching.
 *
 * @example
 * ```tsx
 * const { data: balance } = useBalance({ assetType: AssetType.COLLATERAL });
 * ```
 */
export function useBalance(
  request: FetchBalanceAllowanceRequest | Skip,
): ReadResult<BalanceAllowanceResponse, FetchBalanceAllowanceError> {
  return useSecureClientAction<
    FetchBalanceAllowanceRequest,
    BalanceAllowanceResponse,
    FetchBalanceAllowanceError
  >(fetchBalanceAllowance, request);
}

function fetchNotificationsAction(
  client: BaseSecureClient,
  _request: EmptyRequest,
): Promise<NotificationsResponse> {
  return fetchNotifications(client);
}

/**
 * Fetches the session account's notifications.
 *
 * @remarks
 * Pauses until a session is active. Dismiss entries with
 * `useDropNotifications` and call `refetch` to refresh the list. Errors
 * surface on `error` as {@link FetchNotificationsError}.
 *
 * @example
 * ```tsx
 * const { data: notifications, refetch } = useNotifications();
 * ```
 */
export function useNotifications(): ReadResult<
  NotificationsResponse,
  FetchNotificationsError
> {
  return useSecureClientAction<
    EmptyRequest,
    NotificationsResponse,
    FetchNotificationsError
  >(fetchNotificationsAction, {});
}

export type UseDropNotificationsError =
  | DropNotificationsError
  | UnauthenticatedError;

export type UseDropNotificationsResult = [
  dropNotifications: (request: DropNotificationsRequest) => Promise<void>,
  state: WriteResult<void, UseDropNotificationsError>,
];

/**
 * Dismisses notifications for the session account.
 *
 * @remarks
 * Failures surface on `error` and also reject the returned promise. Refresh
 * `useNotifications` with its `refetch` after a successful drop.
 *
 * @example
 * ```tsx
 * const [drop, { status }] = useDropNotifications();
 *
 * await drop({ ids: notifications.map((entry) => entry.id) });
 * ```
 */
export function useDropNotifications(): UseDropNotificationsResult {
  const run = useCallback(
    (
      client: BaseSecureClient,
      _onStep: (kind: never) => void,
      request: DropNotificationsRequest,
    ) => dropNotifications(client, request),
    [],
  );

  const [execute, state] = useSecureWrite<
    [DropNotificationsRequest],
    void,
    UseDropNotificationsError
  >(run);

  return [
    execute,
    {
      status: state.status,
      data: state.data,
      error: state.error,
      reset: state.reset,
    },
  ];
}

function fetchClosedOnlyModeAction(
  client: BaseSecureClient,
  _request: EmptyRequest,
): Promise<boolean> {
  return fetchClosedOnlyMode(client);
}

/**
 * Fetches whether the session account is restricted to closing positions.
 *
 * @remarks
 * Pauses until a session is active. `data` is `true` when the account is in
 * closed-only mode: it may only reduce or close existing positions and new
 * orders that open exposure are rejected. Errors surface on `error` as
 * {@link FetchClosedOnlyModeError}.
 *
 * @example
 * ```tsx
 * const { data: isClosedOnly } = useTradingRestriction();
 * ```
 */
export function useTradingRestriction(): ReadResult<
  boolean,
  FetchClosedOnlyModeError
> {
  return useSecureClientAction<EmptyRequest, boolean, FetchClosedOnlyModeError>(
    fetchClosedOnlyModeAction,
    {},
  );
}
