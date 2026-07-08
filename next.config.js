/** @type {import('next').NextConfig} */
const nextConfig = {
  // ssh2 (used for the Postgres-over-SSH-tunnel connector) ships some optional
  // native binary files that Vercel's build can't parse as JS modules.
  // Marking it external tells webpack to leave it alone and let Node.js
  // require it directly at runtime instead - this is the standard fix.
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push('ssh2', 'cpu-features');
    }
    return config;
  },
};
module.exports = nextConfig;
