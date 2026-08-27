import { createPublicClient } from '@polymarket/client';

const client = createPublicClient();

const results = await client
  .search({
    q: 'ethereum',
    pageSize: 3,
    searchTags: true,
    searchProfiles: true,
  })
  .firstPage();

console.log('Events');
console.table(
  results.items.events.map((event) => ({
    id: event.id,
    title: event.title ?? event.slug ?? 'Untitled event',
  })),
);

console.log('\nTags');
console.table(
  results.items.tags.map((tag) => ({
    id: tag.id,
    label: tag.label ?? tag.slug ?? 'Untitled tag',
  })),
);

console.log('\nProfiles');
console.table(
  results.items.profiles.map((profile) => ({
    id: profile.id ?? 'profile',
    name: profile.name ?? profile.wallet ?? 'Unnamed profile',
  })),
);
