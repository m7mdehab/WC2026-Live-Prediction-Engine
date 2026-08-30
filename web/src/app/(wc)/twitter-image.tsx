// Twitter card image reuses the exact OpenGraph generator, so twitter:image is always populated
// (Next does not reliably derive it from opengraph-image on its own).
export { default, alt, size, contentType } from "./opengraph-image";
