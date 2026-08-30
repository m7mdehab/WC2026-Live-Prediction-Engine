import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // IA consolidation: every retired URL answers HTTP 301 (not 308 -- `permanent: true` would emit
  // 308) to its new home. Hash fragments are legal in redirect destinations and survive into the
  // Location header. The /matches/[id] → /match/[id] alias stays route-level (permanentRedirect).
  async redirects() {
    return [
      { source: "/ai-vs-humans", destination: "/predict#ai-vs-humans", statusCode: 301 },
      { source: "/bracket", destination: "/forecast#bracket", statusCode: 301 },
      { source: "/daily", destination: "/matches", statusCode: 301 },
      { source: "/daily/:date", destination: "/matches/day/:date", statusCode: 301 },
      // THESE TWO EXIST TO PREVENT A REGRESSION, not to add anything, and the reason is worth
      // keeping because it is not obvious.
      //
      // Moving the World Cup pages into a route group was necessary for an unrelated reason. Next
      // appends a hash to any metadata image route whose parent path contains a group segment
      // (lib/metadata/get-metadata-route.js; note the explicit carve-out for sitemap directly above
      // it, which is why robots.txt and sitemap.xml kept their names and these did not). So
      // /opengraph-image became /opengraph-image-35zo67, and the old URL 404s.
      //
      // That matters because presaira.com is live: every World Cup link ever shared to X, Facebook,
      // LinkedIn, Slack or iMessage carries the OLD url in the scraper's cached card, and those cards
      // would break on the next fetch. Leaving the files at the app root is NOT an alternative; there
      // they are outside both groups, and every WC page then emits no og:image meta tag at all
      // (measured, not assumed). These two redirects keep the old URLs alive so nothing already
      // shared breaks, while the pages keep emitting a correct absolute card URL.
      { source: "/opengraph-image", destination: "/opengraph-image-35zo67", statusCode: 301 },
      { source: "/twitter-image", destination: "/twitter-image-35zo67", statusCode: 301 },
    ];
  },
};

export default nextConfig;
