// Per checklist §四.17: browser hits same-origin /api/*; Next rewrites to backend.
const backend = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3001';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@teacher-score/auth', '@teacher-score/types'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backend}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
