import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /**
     * Request body clone buffer for App Router (incl. Route Handlers).
     * Default is 10MB; must match large multipart uploads (e.g. clips up to 100MB).
     * @see https://nextjs.org/docs/app/api-reference/config/next-config-js/proxyClientMaxBodySize
     */
    proxyClientMaxBodySize: "100mb",
    serverActions: {
      bodySizeLimit: "100mb",
    },
  },
};

export default nextConfig;
