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
 * Stage: warning signs (101–153) + right_of_way signs (301–310).
 */
export function shouldShowSignBadge(imageUrl?: string): boolean {
  const num = parseInt(extractSignNumber(imageUrl) ?? '');
  if (isNaN(num)) return false;
  return (num >= 101 && num <= 153) || (num >= 301 && num <= 310);
}
