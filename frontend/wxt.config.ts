import { defineConfig } from "wxt";
import { loadEnv } from "vite";
import {
  generateBuildInfo,
  installedBuildScript,
  serializeBuildInfo,
} from "./scripts/build-info";
import type { BuildInfo } from "./scripts/build-info";

let buildInfo: BuildInfo;

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
  hooks: {
    "build:before": (wxt) => {
      buildInfo = generateBuildInfo(wxt.config.root);
    },
    "build:publicAssets": (_wxt, files) => {
      files.push({
        relativeDest: "build-info.json",
        contents: serializeBuildInfo(buildInfo),
      });
    },
    "vite:build:extendConfig": (entrypoints, config) => {
      if (!entrypoints.some((entrypoint) => entrypoint.type === "background"))
        return;
      config.plugins ??= [];
      config.plugins.push({
        name: "career-form-installed-build",
        generateBundle: {
          order: "post",
          handler(_options, bundle) {
            for (const output of Object.values(bundle)) {
              if (output.type === "chunk" && output.isEntry)
                output.code = installedBuildScript(buildInfo) + output.code;
            }
          },
        },
      });
    },
    "build:manifestGenerated": (_wxt, manifest) => {
      if (manifest.action) delete manifest.action.default_popup;
    },
  },
  manifest: {
    description: "채용 지원 정보를 안전하게 재사용하는 Chrome 확장 프로그램",
    name: "Career Form",
    host_permissions: apiHostPermissions(configuredApiBaseUrl),
    optional_host_permissions: ["http://*/*", "https://*/*"],
    permissions: [
      "activeTab",
      "storage",
      "sidePanel",
      "scripting",
      "alarms",
      "notifications",
      "favicon",
    ],
    side_panel: {
      default_path: "sidepanel.html",
    },
    web_accessible_resources: [
      {
        resources: ["side-panel-launcher-logo.png", "unsupported-capybara.jpg"],
        matches: ["http://*/*", "https://*/*"],
      },
    ],
    version: "0.1.0",
  },
  modules: ["@wxt-dev/module-react"],
});
