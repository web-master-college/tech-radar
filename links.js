// Shared link rules for the page and the validator.
// A link is usable only as https, with a host and no embedded login.

// An article image is shown only with one of these licenses.
// Anything else, including a missing license, uses the topic illustration.
const SUITABLE_IMAGE_LICENSES = new Set(["cc0", "cc-by", "cc-by-sa", "public-domain"]);

export function isSuitableImageLicense(value) {
  return typeof value === "string" && SUITABLE_IMAGE_LICENSES.has(value);
}

export function toHttpsUrl(value) {
  if (typeof value !== "string") return null;
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (!url.hostname) return null;
  return url.href;
}

// Syntactic identity for duplicate detection:
// lowercase host, drop the fragment, drop the default https port,
// drop a trailing slash, and sort query parameters. Tracking parameters
// are kept, so two links that differ only by a query still count as different.
export function normalizeLink(value) {
  const href = toHttpsUrl(value);
  if (!href) return null;
  const url = new URL(href);
  url.hash = "";
  if (url.port === "443") url.port = "";
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname.length > 1) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }
  const entries = [...url.searchParams.entries()].sort((left, right) => {
    if (left[0] < right[0]) return -1;
    if (left[0] > right[0]) return 1;
    if (left[1] < right[1]) return -1;
    if (left[1] > right[1]) return 1;
    return 0;
  });
  url.search = "";
  for (const [key, item] of entries) {
    url.searchParams.append(key, item);
  }
  return url.href;
}
