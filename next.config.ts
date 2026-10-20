import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.SELF_LAB_TEST_DEV === "1" ? ".next-browser" : ".next",
  cacheComponents: true,
  partialPrefetching: true,
  logging: {
    incomingRequests: {
      ignore: [
        /^\/api\/auth\/(?:verify-email|reset-password)(?:\/|\?|$)/,
        /[?&](?:token|password|confirmPassword|newPassword)=/i,
      ],
    },
  },
};

export default nextConfig;
