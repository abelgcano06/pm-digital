/** @type {import('next').NextConfig} */
const nextConfig = {
  // Don't bundle @react-pdf/renderer — use it as-is from node_modules
  // to avoid React class component duplication errors in the server bundle
  serverExternalPackages: ["@react-pdf/renderer"],
};

module.exports = nextConfig;
