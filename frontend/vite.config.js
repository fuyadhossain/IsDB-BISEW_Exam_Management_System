import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

// NOTE: এই project আগে "Manus" নামের একটা online AI dev platform-এ বানানো হয়েছিল।
// আগের vite.config.js-এ Manus-এর নিজস্ব কিছু plugin ছিল
// (vite-plugin-manus-runtime, debug-collector, /manus-storage proxy) এবং HMR
// জোর করে wss://...:443 দিয়ে চালানো হচ্ছিল — এগুলো শুধু Manus-এর hosted preview
// server-এর জন্য দরকার ছিল। Local (XAMPP/VS Code) এ এগুলো থাকলে console-এ 404/500
// error এবং broken hot-reload হয়, কাজের কিছু ভাঙে না কিন্তু বিরক্তিকর। তাই
// local development-এর জন্য সেগুলো বাদ দেওয়া হয়েছে।
const plugins = [react(), tailwindcss()];

export default defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    strictPort: false, // 3000 busy থাকলে পরের ফাঁকা port নিজে থেকে ব্যবহার করবে
    host: true,
    // HMR এখন default settings ব্যবহার করবে (local browser <-> local vite server,
    // ws:// on the same port) — আগের মতো wss/443 জোর করে হার্ডকোড করা নেই, তাই
    // localhost-এ hot-reload ঠিকমতো কাজ করবে।
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
