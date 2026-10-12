export function publicApplicationLink(
  url: string | undefined,
  host: string,
): string | undefined {
  if (!url || url.length > 512) return undefined;
  const match =
    /^https:\/\/([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.career\.greetinghr\.com)\/(?:ko|en)\/o\/[1-9]\d{0,11}\/apply$/.exec(
      url,
    );
  return match && match[0] === url && match[1] === host.toLowerCase()
    ? url
    : undefined;
}
