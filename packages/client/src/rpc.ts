import type { EvmAddress, HexString } from '@polymarket/types';
import ky from 'ky';
import {
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
} from './errors';

export type EthCallRequest = {
  to: EvmAddress;
  data: HexString;
};

export type JsonRpcError = {
  code: number;
  message: string;
  data?: unknown;
};

type JsonRpcSuccess<TResult> = {
  jsonrpc: '2.0';
  id: number;
  result: TResult;
};

type JsonRpcFailure = {
  jsonrpc: '2.0';
  id: number | null;
  error: JsonRpcError;
};

type JsonRpcResponse<TResult> = JsonRpcSuccess<TResult> | JsonRpcFailure;

export type JsonRpcClientConfig = {
  url: string;
};

/** @internal */
export class JsonRpcClient {
  readonly #url: string;

  constructor({ url }: JsonRpcClientConfig) {
    this.#url = url;
  }

  async ethCall(request: EthCallRequest): Promise<HexString> {
    const response = await this.#post<HexString>({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ to: request.to, data: request.data }, 'latest'],
    });

    if ('error' in response) {
      throw new RequestRejectedError(
        `JSON-RPC eth_call failed: ${response.error.message}`,
        { cause: response.error, status: 200 },
      );
    }

    if (typeof response.result !== 'string') {
      throw new UnexpectedResponseError(
        'Expected JSON-RPC eth_call result to be a hex string',
      );
    }

    if (!isRpcHexString(response.result)) {
      throw new UnexpectedResponseError(
        'Expected JSON-RPC eth_call result to be a hex string',
      );
    }

    return response.result;
  }

  async ethCallBatch(
    requests: readonly EthCallRequest[],
  ): Promise<HexString[]> {
    if (requests.length === 0) {
      return [];
    }

    return this.#ethCallBatchWithSplit(requests);
  }

  async #ethCallBatchWithSplit(
    requests: readonly EthCallRequest[],
  ): Promise<HexString[]> {
    if (requests.length === 1) {
      return [await this.ethCall(requests[0] as EthCallRequest)];
    }

    try {
      return await this.#postEthCallBatch(requests);
    } catch (error) {
      if (!(error instanceof RequestRejectedError) || error.status < 500) {
        throw error;
      }

      const midpoint = Math.ceil(requests.length / 2);
      const [left, right] = await Promise.all([
        this.#ethCallBatchWithSplit(requests.slice(0, midpoint)),
        this.#ethCallBatchWithSplit(requests.slice(midpoint)),
      ]);

      return [...left, ...right];
    }
  }

  async #postEthCallBatch(
    requests: readonly EthCallRequest[],
  ): Promise<HexString[]> {
    const responses = await this.#postBatch<HexString>(
      requests.map((request, index) => ({
        jsonrpc: '2.0',
        id: index + 1,
        method: 'eth_call',
        params: [{ to: request.to, data: request.data }, 'latest'],
      })),
    );

    const responsesById = new Map<number, JsonRpcResponse<HexString>>();

    for (const response of responses) {
      if ('error' in response && response.id === null) {
        throw new RequestRejectedError(
          `JSON-RPC eth_call failed: ${response.error.message}`,
          { cause: response.error, status: 200 },
        );
      }

      if (response.id !== null) {
        responsesById.set(response.id, response);
      }
    }

    return requests.map((_, index) => {
      const id = index + 1;
      const response = responsesById.get(id);

      if (response === undefined) {
        throw new UnexpectedResponseError(
          'Expected JSON-RPC batch response for every request',
        );
      }

      if ('error' in response) {
        throw new RequestRejectedError(
          `JSON-RPC eth_call failed: ${response.error.message}`,
          { cause: response.error, status: 200 },
        );
      }

      return expectRpcHexResult(response.result);
    });
  }

  async #post<TResult>(json: unknown): Promise<JsonRpcResponse<TResult>> {
    let response: Response;

    try {
      response = await ky.post(this.#url, {
        json,
        throwHttpErrors: false,
      });
    } catch (error) {
      throw TransportError.fromError(error);
    }

    if (!response.ok) {
      throw new RequestRejectedError(
        `JSON-RPC request to ${this.#url} failed with status ${response.status}`,
        { status: response.status },
      );
    }

    let body: unknown;

    try {
      body = await response.json();
    } catch (error) {
      throw new UnexpectedResponseError(
        'Expected JSON-RPC response body to be JSON',
        { cause: error },
      );
    }

    if (!isJsonRpcResponse<TResult>(body)) {
      throw new UnexpectedResponseError('Unexpected JSON-RPC response shape');
    }

    return body;
  }

  async #postBatch<TResult>(
    json: unknown,
  ): Promise<JsonRpcResponse<TResult>[]> {
    let response: Response;

    try {
      response = await ky.post(this.#url, {
        json,
        throwHttpErrors: false,
      });
    } catch (error) {
      throw TransportError.fromError(error);
    }

    if (!response.ok) {
      throw new RequestRejectedError(
        `JSON-RPC request to ${this.#url} failed with status ${response.status}`,
        { status: response.status },
      );
    }

    let body: unknown;

    try {
      body = await response.json();
    } catch (error) {
      throw new UnexpectedResponseError(
        'Expected JSON-RPC response body to be JSON',
        { cause: error },
      );
    }

    if (
      !Array.isArray(body) ||
      !body.every((value) => isJsonRpcResponse<TResult>(value))
    ) {
      throw new UnexpectedResponseError('Unexpected JSON-RPC response shape');
    }

    return body;
  }
}

/** @internal */
export function isJsonRpcContractRevert(error: unknown): boolean {
  if (
    !(error instanceof RequestRejectedError) ||
    !isJsonRpcError(error.cause)
  ) {
    return false;
  }

  const message = [
    error.cause.message,
    stringifyJsonRpcErrorData(error.cause.data),
  ]
    .join(' ')
    .toLowerCase();

  return (
    (error.cause.code === 3 ||
      error.cause.code === -32_000 ||
      error.cause.code === -32_003 ||
      error.cause.code === -32_015 ||
      error.cause.code === -32_603) &&
    (message.includes('execution reverted') ||
      message.includes('revert') ||
      message.includes('invalid opcode'))
  );
}

function isJsonRpcResponse<TResult>(
  value: unknown,
): value is JsonRpcResponse<TResult> {
  if (!isRecord(value) || value.jsonrpc !== '2.0') {
    return false;
  }

  if ('error' in value) {
    return isJsonRpcError(value.error);
  }

  return 'result' in value;
}

function isJsonRpcError(value: unknown): value is JsonRpcError {
  return (
    isRecord(value) &&
    typeof value.code === 'number' &&
    typeof value.message === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isRpcHexString(value: string): value is HexString {
  return /^0x[a-fA-F0-9]*$/.test(value);
}

function expectRpcHexResult(value: unknown): HexString {
  if (typeof value !== 'string' || !isRpcHexString(value)) {
    throw new UnexpectedResponseError(
      'Expected JSON-RPC eth_call result to be a hex string',
    );
  }

  return value;
}

function stringifyJsonRpcErrorData(data: unknown): string {
  if (data === undefined) {
    return '';
  }

  if (typeof data === 'string') {
    return data;
  }

  try {
    return JSON.stringify(data);
  } catch {
    return '';
  }
}
