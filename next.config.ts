import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_API_URL: (process.env.NEXT_PUBLIC_API_URL || "").trim(),
  },
  turbopack: {
    root: path.resolve(process.cwd(), "."),
  },
};

export default nextConfig;
