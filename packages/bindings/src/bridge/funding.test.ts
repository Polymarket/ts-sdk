import { describe, expect, it } from 'vitest';
import {
  FundingAddressSetResponseSchema,
  FundingTransactionsPageSchema,
  KnownFundingTransactionStatus,
} from './funding';

describe('FundingAddressSetResponseSchema', () => {
  it('normalizes the response and retains Tron addresses and warnings', () => {
    const result = FundingAddressSetResponseSchema.parse({
      address: {
        evm: '0x0000000000000000000000000000000000000001',
        svm: '11111111111111111111111111111111',
        btc: 'bc1qexample',
        tron: 'TExample',
      },
      note: 'Use the address for the source chain.',
      warnings: [
        {
          code: 'missing_builder_code',
          message: 'Include a builder code for attribution.',
        },
      ],
    });

    expect(result).toEqual({
      addresses: {
        evm: '0x0000000000000000000000000000000000000001',
        svm: '11111111111111111111111111111111',
        btc: 'bc1qexample',
        tron: 'TExample',
      },
      note: 'Use the address for the source chain.',
      warnings: [
        {
          code: 'missing_builder_code',
          message: 'Include a builder code for attribution.',
        },
      ],
    });
  });

  it('normalizes the documented TVM key to tron', () => {
    const result = FundingAddressSetResponseSchema.parse({
      address: {
        evm: '0x0000000000000000000000000000000000000001',
        svm: '11111111111111111111111111111111',
        btc: 'bc1qexample',
        tvm: 'TExample',
      },
    });

    expect(result.addresses.tron).toBe('TExample');
    expect(result.addresses).not.toHaveProperty('tvm');
  });
});

describe('FundingTransactionsPageSchema', () => {
  it('accepts detected transactions before optional metadata is available', () => {
    const result = FundingTransactionsPageSchema.parse({
      transactions: [
        {
          fromChainId: '1',
          fromTokenAddress: '0x0000000000000000000000000000000000000002',
          fromAmountBaseUnit: '1000000',
          toChainId: '137',
          toTokenAddress: '0x0000000000000000000000000000000000000003',
          status: 'DEPOSIT_DETECTED',
        },
      ],
      nextCursor: 'eyJsYXN0SWQiOiI0MiJ9',
    });

    expect(result.transactions[0]?.status).toBe(
      KnownFundingTransactionStatus.DepositDetected,
    );
    expect(result.transactions[0]?.createdTimeMs).toBeUndefined();
    expect(result.transactions[0]?.txHash).toBeUndefined();
    expect(result.nextCursor).toBe('eyJsYXN0SWQiOiI0MiJ9');
  });

  it('preserves newly introduced statuses', () => {
    const result = FundingTransactionsPageSchema.parse({
      transactions: [
        {
          fromChainId: '1',
          fromTokenAddress: '0x0000000000000000000000000000000000000002',
          fromAmountBaseUnit: '1000000',
          toChainId: '137',
          toTokenAddress: '0x0000000000000000000000000000000000000003',
          status: 'REFUNDING',
        },
      ],
      nextCursor: null,
    });

    expect(result.transactions[0]?.status).toBe('REFUNDING');
  });

  it('treats a pre-pagination response as a terminal page', () => {
    const result = FundingTransactionsPageSchema.parse({ transactions: [] });

    expect(result.nextCursor).toBeNull();
  });
});
