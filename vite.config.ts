import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Плагин для разрешения ngrok-хостов и логирования входящих запросов
const allowNgrokHosts = () => ({
  name: "allow-ngrok-hosts",
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const host = req.headers.host || "";
      // Логируем только ngrok-запросы для удобства
      if (host.includes("ngrok")) {
        console.log(`[Vite] ✅ Разрешён ngrok-хост: ${host}`);
      }
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

      // Разрешаем ngrok и другие туннели
      allowedHosts: [
        env.VITE_ALLOWED_HOST || ".ngrok-free.app", // 👈 по умолчанию все ngrok-домены
      ],

      // Настройки HMR для туннелей
      hmr: {
        clientPort: 8080,
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
      allowNgrokHosts(),
      mode === "development" && componentTagger(),
    ].filter(Boolean),

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
