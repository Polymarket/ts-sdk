import { z } from 'zod';
import {
  BaseUnitsSchema,
  CommentIdSchema,
  CommentParentEntityTypeSchema,
  EventIdSchema,
  IsoDateTimeStringSchema,
  PaginationCursorSchema,
  TokenIdSchema,
} from '../shared';
import { ImageOptimizationSchema } from './common';
import { SeriesIdSchema } from './event';

export const CommentPositionSchema = z.object({
  tokenId: TokenIdSchema.nullish(),
  positionSize: BaseUnitsSchema.nullish(),
});

export const CommentProfileSchema = z
  .object({
    name: z.string().nullish(),
    pseudonym: z.string().nullish(),
    displayUsernamePublic: z.boolean().nullish(),
    bio: z.string().nullish(),
    isMod: z.boolean().nullish(),
    isCreator: z.boolean().nullish(),
    proxyWallet: z.string().nullish(),
    baseAddress: z.string().nullish(),
    profileImage: z.string().nullish(),
    profileImageOptimized: ImageOptimizationSchema.nullish(),
    positions: z.array(CommentPositionSchema).nullish(),
  })
  .transform(({ proxyWallet, ...rest }) => ({
    ...rest,
    wallet: proxyWallet,
  }));

export enum ReactionType {
  Heart = 'HEART',
}

export const ReactionTypeSchema = z.enum(ReactionType);

export const ReactionSchema = z.object({
  id: z.string(),
  commentID: z.number().int().nullish(),
  reactionType: ReactionTypeSchema.nullish(),
  icon: z.string().nullish(),
  userAddress: z.string().nullish(),
  createdAt: IsoDateTimeStringSchema.nullish(),
  profile: CommentProfileSchema.nullish(),
});

export const CommentMediaSchema = z.object({
  id: z.string(),
  commentID: z.number().int().nullish(),
  provider: z.string().nullish(),
  providerMediaId: z.string().nullish(),
  url: z.string().nullish(),
  mediaType: z.string().nullish(),
  altText: z.string().nullish(),
  createdAt: IsoDateTimeStringSchema.nullish(),
});

export const CommentSchema = z.object({
  id: CommentIdSchema,
  body: z.string().nullish(),
  parentEntityType: CommentParentEntityTypeSchema.nullish(),
  parentEntityID: z.union([EventIdSchema, SeriesIdSchema]).nullish(),
  parentCommentID: CommentIdSchema.nullish(),
  userAddress: z.string().nullish(),
  replyAddress: z.string().nullish(),
  createdAt: IsoDateTimeStringSchema.nullish(),
  updatedAt: IsoDateTimeStringSchema.nullish(),
  media: z.array(CommentMediaSchema).nullish(),
  profile: CommentProfileSchema.nullish(),
  reactions: z.array(ReactionSchema).nullish(),
  reportCount: z.number().int().nullish(),
  reactionCount: z.number().int().nullish(),
  tradeAsset: z.string().nullish(),
});

export const ListCommentsResponseSchema = z.array(CommentSchema);
export const ListCommentsKeysetResponseSchema = z
  .object({
    comments: z.array(CommentSchema),
    next_cursor: PaginationCursorSchema.optional(),
  })
  .transform(({ comments, next_cursor }) => ({
    items: comments,
    nextCursor: next_cursor,
  }));

export type Comment = z.infer<typeof CommentSchema>;
export type CommentMedia = z.infer<typeof CommentMediaSchema>;
export type CommentPosition = z.infer<typeof CommentPositionSchema>;
export type CommentProfile = z.infer<typeof CommentProfileSchema>;
export type Reaction = z.infer<typeof ReactionSchema>;
export type ListCommentsResponse = z.infer<typeof ListCommentsResponseSchema>;
export type ListCommentsKeysetResponse = z.infer<
  typeof ListCommentsKeysetResponseSchema
>;
