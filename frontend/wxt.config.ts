import { defineConfig } from "wxt";
import { loadEnv } from "vite";

const fileEnv = loadEnv("production", ".", "");
const configuredApiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ?? fileEnv.VITE_API_BASE_URL;

function apiHostPermissions(apiBaseUrl: string | undefined): string[] {
  const value = apiBaseUrl?.trim();
  if (!value) return [];

  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("VITE_API_BASE_URL은 HTTP(S) origin이어야 합니다.");
  }
  if (
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error("VITE_API_BASE_URL에는 origin만 지정할 수 있습니다.");
  }
  return [`${url.origin}/*`];
}

export default defineConfig({
  manifest: {
    description: "채용 지원 정보를 안전하게 재사용하는 Chrome 확장 프로그램",
    name: "Career Form",
    host_permissions: apiHostPermissions(configuredApiBaseUrl),
    permissions: ["storage", "sidePanel"],
    side_panel: {
      default_path: "sidepanel.html",
    },
    version: "0.1.0",
  },
  modules: ["@wxt-dev/module-react"],
});
