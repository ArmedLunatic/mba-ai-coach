import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The embedded PGlite database (used when DATABASE_URL is unset) ships WASM/Wasm-adjacent
  // binaries that Next's bundler should not try to trace/bundle for server code.
  serverExternalPackages: ['@electric-sql/pglite'],
};

export default nextConfig;
