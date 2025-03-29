import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  compiler: {
    styledComponents: false, // ✅ Enables SSR for styled-components
  },
};

export default nextConfig;
