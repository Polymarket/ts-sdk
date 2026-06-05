import { UserInputError } from './errors';

type PolymarketUrlResource = 'event' | 'market';

export function parsePolymarketSlugUrl(
  rawUrl: string,
  resource: PolymarketUrlResource,
): string {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch (cause) {
    throw new UserInputError('Expected a valid Polymarket URL.', { cause });
  }

  if (
    url.protocol !== 'https:' ||
    (url.hostname !== 'polymarket.com' && url.hostname !== 'www.polymarket.com')
  ) {
    throw new UserInputError('Expected a valid Polymarket URL.');
  }

  const [actualResource, slug, ...extraSegments] = url.pathname
    .split('/')
    .filter(Boolean);
  const marketSlug = extraSegments[0];

  if (
    resource === 'market' &&
    actualResource === 'event' &&
    slug !== undefined &&
    extraSegments.length <= 1
  ) {
    return marketSlug ?? slug;
  }

  if (
    actualResource !== resource ||
    slug === undefined ||
    extraSegments.length > 0
  ) {
    throw new UserInputError(`Expected a Polymarket ${resource} URL.`);
  }

  return slug;
}
