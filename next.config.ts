import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        hostname: "avatar.vercel.sh",
      },
      {
        protocol: "https",
        hostname: "cjnlozxpzuensydxjyqd.supabase.co",
      },
    ],
  },
};

export default nextConfig;
