import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import fs from "fs";
import path from "path";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
  server: {
    port: 4004,
    https: {
      key: fs.readFileSync(path.resolve(__dirname, ".cert/localhost-key.pem")),
      cert: fs.readFileSync(path.resolve(__dirname, ".cert/localhost.pem")),
    },
  },
});
