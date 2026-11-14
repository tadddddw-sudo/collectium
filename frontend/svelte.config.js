import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    // Pure SPA: every route is client-rendered and the fallback page boots the router.
    adapter: adapter({ fallback: 'index.html', strict: false }),
  },
};

export default config;
