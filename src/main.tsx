import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { loadAssetManifest } from "./components/assetManifest";
import "./styles.css";

void loadAssetManifest().then(() => {
  createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
}).catch(() => {
  const root = document.getElementById("root")!;
  root.textContent = "The asset pack could not load. Reload the page, or check public/assets/asset-manifest.json in your local checkout.";
  root.setAttribute("role", "alert");
});
