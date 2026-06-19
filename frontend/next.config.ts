import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Desativa o streaming metadata: evita o mismatch de hidratação no
  // wrapper interno <div hidden> / <Suspense name="Next.Metadata"> que
  // ocorre quando o servidor e o cliente determinam `serveStreamingMetadata`
  // de forma diferente (Next.js 16 + Turbopack).
  htmlLimitedBots: /.*/,
};

export default nextConfig;
