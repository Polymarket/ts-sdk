import {
  BuilderVolumeInterval,
  createPublicClient,
  LeaderboardWindow,
} from '@polymarket/client';

const client = createPublicClient();

const leaderboard = await client
  .listBuilderLeaderboard({
    window: LeaderboardWindow.Week,
    pageSize: 10,
  })
  .firstPage();

console.log('Top builders this week');
console.table(
  leaderboard.items.map((builder) => ({
    rank: builder.rank,
    name: builder.builderName,
    code: builder.builderCode,
    volumeShares: builder.volume,
    activeUsers: builder.activeUsers,
  })),
);

const volume = await client.fetchBuilderVolume({
  interval: BuilderVolumeInterval.Day,
  bucketLimit: 2,
});
const latestBucketDate = volume[0]?.bucketDate;
const latestBucket = volume.filter(
  (point) => point.bucketDate === latestBucketDate,
);

console.log(`Builder volume for ${latestBucketDate ?? 'the latest bucket'}`);
console.table(
  latestBucket.slice(0, 10).map((point) => ({
    rank: point.rank,
    name: point.builderName,
    volumeShares: point.volume,
    activeUsers: point.activeUsers,
  })),
);
