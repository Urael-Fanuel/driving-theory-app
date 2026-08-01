import type { NextConfig } from "next";
import { fileURLToPath } from "url";
import { dirname } from "path";

// This project lives inside the driving-theory-app repo, which has its own
// package-lock.json at the parent level — without this, Next.js's workspace-
// root auto-detection picks the PARENT directory (wrong) instead of this
// one, which silently breaks path resolution for anything Vercel-deployed
// from this subdirectory.
const dashboardRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: dashboardRoot,
  },
};

export default nextConfig;
