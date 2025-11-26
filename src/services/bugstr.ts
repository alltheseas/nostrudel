import { init, captureException, type BugstrPayload } from "bugstr-ts";
import appPackage from "../../package.json";
import bugstrPackage from "bugstr-ts/package.json";
import { CAP_IS_WEB } from "../env";
import { logger } from "../helpers/debug";

// Track initialization status so we only capture when Bugstr is ready.
let bugstrReady = false;

// Parse relay list once and reuse it.
const bugstrRelays = (import.meta.env.VITE_BUGSTR_RELAYS ?? "")
  .split(",")
  .map((relay) => relay.trim())
  .filter(Boolean);

const bugstrEnabled = CAP_IS_WEB && import.meta.env.VITE_BUGSTR_ENABLED === "true";
const bugstrNpub = import.meta.env.VITE_BUGSTR_NPUB;
const bugstrEnvironment = import.meta.env.VITE_BUGSTR_ENV ?? import.meta.env.MODE ?? "development";
const bugstrRelease =
  import.meta.env.VITE_APP_VERSION ?? import.meta.env.VITE_COMMIT_HASH ?? import.meta.env.MODE ?? "dev";
const bugstrBaseVersion = (appPackage as { version?: string }).version;
const bugstrSdkVersion = (bugstrPackage as { version?: string }).version;
const bugstrAppVersion = [bugstrBaseVersion, import.meta.env.VITE_APP_VERSION, import.meta.env.VITE_COMMIT_HASH]
  .filter(Boolean)
  .join(" ");

const bootstrapBugstr = () => {
  // Prefer fast exits to keep control flow simple.
  if (!bugstrEnabled) return;
  if (!bugstrNpub) return logger("Bugstr disabled: missing VITE_BUGSTR_NPUB");
  if (!bugstrRelays.length) return logger("Bugstr disabled: missing VITE_BUGSTR_RELAYS");

  try {
    init({
      developerPubkey: bugstrNpub,
      relays: bugstrRelays,
      environment: bugstrEnvironment,
      release: bugstrRelease,
      // Tag payloads with app + version so the developer sees where it came from.
      beforeSend: (payload: BugstrPayload) => {
        const prefixParts = [
          bugstrBaseVersion && `nostrudel ${bugstrBaseVersion}`,
          bugstrAppVersion,
          bugstrSdkVersion && `bugstr-ts ${bugstrSdkVersion}`,
        ]
          .filter(Boolean)
          .join(" ");
        const prefix = prefixParts ? `[${prefixParts}]` : "[nostrudel]";
        return { ...payload, message: `${prefix} ${payload.message}` };
      },
      // Respect the SDK default confirm prompt unless the host overrides it.
      confirmSend: (payload) => window.confirm(`Send crash report to the developer?\n\n${payload.message}`),
    });
    bugstrReady = true;
    logger("Bugstr initialized", { bugstrEnvironment, bugstrRelease });
  } catch (error) {
    logger("Bugstr init failed", error);
  }
};

bootstrapBugstr();

export const captureBugstrException = (error: unknown, context?: string) => {
  if (!bugstrReady) return;
  if (!error) return;

  const message = context ? `${context}: ${String(error)}` : String(error);
  const normalizedError = error instanceof Error ? error : new Error(message);

  try {
    // captureException already redacts and gift-wraps before sending.
    captureException(normalizedError);
  } catch (captureError) {
    logger("Bugstr capture failed", captureError);
  }
};
