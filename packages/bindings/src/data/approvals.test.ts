import { describe, expect, it } from 'vitest';
import { FetchApprovalsResponseSchema } from './approvals';

const address = `0x${'a'.repeat(40)}`;
const token = `0x${'b'.repeat(40)}`;
const spender = `0x${'c'.repeat(40)}`;
const max = 2n ** 256n - 1n;

describe('FetchApprovalsResponseSchema', () => {
  it('preserves the approved flag separately from a max amount and parses exact uint256s', () => {
    const result = FetchApprovalsResponseSchema.parse({
      data: {
        address,
        chain_id: 137,
        checked_at: '2026-09-25T12:00:00Z',
        contracts: [
          { token, spender, standard: 'ERC20', amount: 'max', approved: false },
          {
            token,
            spender,
            standard: 'ERC20',
            amount: max.toString(),
            approved: true,
          },
          { token, spender, standard: 'ERC1155', approved: true },
        ],
      },
    });

    expect(result.chainId).toBe(137);
    expect(result.contracts).toEqual([
      { token, spender, standard: 'ERC20', amount: 'max', approved: false },
      { token, spender, standard: 'ERC20', amount: max, approved: true },
      { token, spender, standard: 'ERC1155', approved: true },
    ]);
  });

  it('keeps rows for standards it does not evaluate without failing the snapshot', () => {
    const result = FetchApprovalsResponseSchema.parse({
      data: {
        address,
        chain_id: 137,
        contracts: [
          { token, spender, standard: 'ERC1155', approved: true },
          { token, spender, standard: 'ERC721', approved: 'yes' },
          { token, spender, standard: 'ERC20', amount: null, approved: false },
        ],
      },
    });

    expect(result.contracts).toEqual([
      { token, spender, standard: 'ERC1155', approved: true },
      { token, spender, standard: undefined },
      { token, spender, standard: undefined },
    ]);
  });

  it.each([
    undefined,
    null,
    '',
    '-1',
    '01',
    '1.0',
    '1e3',
    '0x1',
    '1\n',
    ' 1',
    1,
    (max + 1n).toString(),
  ])('degrades an ambiguous or out-of-range ERC-20 amount to an unevaluated row: %s', (amount) => {
    const result = FetchApprovalsResponseSchema.parse({
      data: {
        address,
        chain_id: 137,
        contracts: [
          { token, spender, standard: 'ERC20', amount, approved: false },
        ],
      },
    });

    // The row keeps its addresses so a consumer that requires this pair can
    // still reject it, while unrelated rows never fail the whole snapshot.
    expect(result.contracts).toEqual([{ token, spender, standard: undefined }]);
  });

  it.each([
    'false',
    0,
    null,
    undefined,
  ])('does not coerce an approval flag: %s', (approved) => {
    const result = FetchApprovalsResponseSchema.parse({
      data: {
        address,
        chain_id: 137,
        contracts: [{ token, spender, standard: 'ERC1155', approved }],
      },
    });

    expect(result.contracts).toEqual([{ token, spender, standard: undefined }]);
  });
});
