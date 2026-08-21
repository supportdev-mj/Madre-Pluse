/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  transpilePackages: ['@madre-pulse/shared'],
};

module.exports = nextConfig;
