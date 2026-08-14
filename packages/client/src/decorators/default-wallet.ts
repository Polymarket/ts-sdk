import type { BaseSecureClient } from '../clients';

type WithDefaultWallet<TRequest, TField extends string> = Omit<
  TRequest,
  TField
> &
  Record<TField, string>;

export function withDefaultWallet<
  TField extends string,
  TRequest extends Partial<Record<TField, string>>,
>(
  client: BaseSecureClient,
  field: TField,
  request: TRequest = {} as TRequest,
): WithDefaultWallet<TRequest, TField> {
  if (
    request === null ||
    typeof request !== 'object' ||
    Array.isArray(request)
  ) {
    return request as WithDefaultWallet<TRequest, TField>;
  }

  return {
    ...request,
    [field]:
      request[field] === undefined ? client.account.wallet : request[field],
  } as WithDefaultWallet<TRequest, TField>;
}
