import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Плагин для логирования входящих запросов
const logIncomingHosts = () => ({
  name: "log-incoming-hosts",
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const host = req.headers.host || "";
      console.log(`[Vite] Request host: ${host}`);
      next();
    });
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Загружаем переменные окружения (.env)
  const env = loadEnv(mode, process.cwd(), "");

  return {
    server: {
      host: "0.0.0.0", // Слушаем на всех интерфейсах
      port: 8080,
      strictPort: false,

      // Разрешаем localhost и другие хосты для разработки
      allowedHosts: [
        "localhost",
        "127.0.0.1",
        env.VITE_ALLOWED_HOST, // Опциональный хост из переменной окружения
      ].filter(Boolean),

      // Настройки HMR для Vite
      hmr: {
        host: "localhost",
        port: 8080,
        protocol: "http",
      },

      proxy: {
        "/api": {
          target: env.VITE_API_URL || "http://localhost:4000",
          changeOrigin: true,
          secure: false,
          ws: true, // WebSocket proxying
          configure: (proxy, _options) => {
            proxy.on("error", (err, _req, _res) => {
              console.log("Proxy error:", err);
            });
            proxy.on("proxyReq", (proxyReq, req, _res) => {
              console.log("Proxying:", req.method, req.url);
            });
          },
        },
      },
    },

    plugins: [
      react(),
      logIncomingHosts(),
      mode === "development" && componentTagger(),
    ].filter(Boolean),

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
