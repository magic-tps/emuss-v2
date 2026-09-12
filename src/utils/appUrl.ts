/** Absolute return URL, including the deployment subdirectory on GitHub Pages. */
export function appUrl(path: string) {
  return new URL(`${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`, window.location.origin).href;
}
