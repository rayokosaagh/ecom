import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Image uploads go through a server action, and the default request body
      // cap is 1 MB. Kept a little above MAX_UPLOAD_BYTES (5 MB) so the action
      // can return a helpful size error rather than the request being cut off
      // at the framework layer.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
