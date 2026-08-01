// Twitter/X reads `twitter-image`, not `opengraph-image`, so the file has to
// exist — but the card is the same card. Re-exported rather than duplicated so
// the two can never drift into showing different promises for the same link.
export { default, alt, size, contentType } from "./opengraph-image";
