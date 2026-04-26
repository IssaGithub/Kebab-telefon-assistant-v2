/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  transpilePackages: ["@restaurant-ai/shared"],
  async rewrites() {
    return [
      {
        source: "/v1/:path*",
        destination: "http://127.0.0.1:4000/v1/:path*"
      },
      {
        source: "/health",
        destination: "http://127.0.0.1:4000/health"
      }
    ];
  }
};

export default nextConfig;
