import { DemoBackend, SupabaseBackend, type Backend } from "./backend";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_KEY;

export const IS_DEMO = import.meta.env.VITE_DEMO === "1" || !url || !key;

export const backend: Backend = IS_DEMO ? new DemoBackend() : new SupabaseBackend(url as string, key as string);

export const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";
