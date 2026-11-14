import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    // Pure SPA: every route is client-rendered and the fallback page boots the router.
    // The Express server in index.js serves dist/ and falls back to index.html.
    adapter: adapter({ pages: 'dist', assets: 'dist', fallback: 'index.html', strict: false }),
  },
};

export default config;
