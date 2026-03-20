/**
 * Extract the official sign number from its image URL.
 * e.g. ".../v4/301.png?v=123" → "301"
 * Returns null if the filename is not a plain number.
 */
export function extractSignNumber(imageUrl?: string): string | null {
  if (!imageUrl) return null;
  const filename = imageUrl.split('/').pop()?.split('?')[0] ?? '';
  const name = filename.replace(/\.[^.]+$/, '');
  return /^\d+$/.test(name) ? name : null;
}

/**
 * Returns true if this sign should show a number badge.
 * All topics: warning (101–153) + regulatory (201–231) + right_of_way (301–310) + prohibitions (401–441) + public_transport (501–516) + information_guidance (601–640) + traffic_lights (701–729).
 */
export function shouldShowSignBadge(imageUrl?: string): boolean {
  const num = parseInt(extractSignNumber(imageUrl) ?? '');
  if (isNaN(num)) return false;
  return (num >= 101 && num <= 153) || (num >= 201 && num <= 231) || (num >= 301 && num <= 310) || (num >= 401 && num <= 441) || (num >= 501 && num <= 516) || (num >= 601 && num <= 640) || (num >= 701 && num <= 729);
}
