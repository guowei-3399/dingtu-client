import { normalizeExitGeoContext } from './safe-environment.mjs';

const fail = (code, message) => Object.assign(new Error(message), { code });
export const ENVIRONMENT_MODES = Object.freeze(['safe_tunnel', 'own_network']);
export const isTunnelEnvironmentMode = mode => mode === 'safe_tunnel';

/**
 * Main-process controller for Dingtu Open-Source Edition's two basic connectivity modes:
 * - 'safe_tunnel' (default): Basic local proxy on 127.0.0.1:17899.
 * - 'own_network': User's own OS network environment (stops tunnel & closes container windows to prevent cross-leak).
 */
export function createEnvironmentModeController({
  initialMode = 'safe_tunnel',
  stopTunnel = async () => {},
  closeBrowsers = async () => {},
  onAudit = () => {},
} = {}) {
  if (!ENVIRONMENT_MODES.includes(initialMode)) {
    throw fail('ENVIRONMENT_MODE_INVALID', '初始网络环境模式无效。');
  }
  let mode = initialMode;
  let exitGeo = null;
  let switching = Promise.resolve();
  const audit = (event, details) => { try { onAudit(event, details); } catch {} };

  function snapshot() {
    const tunnelActive = isTunnelEnvironmentMode(mode);
    return Object.freeze({
      mode,
      requiresTunnel: tunnelActive,
      dnsProtection: tunnelActive ? 'basic_proxy' : 'user_system',
      webrtcProtection: 'browser_default',
      processSandbox: tunnelActive ? 'proxy_17899_basic' : 'profile_only',
      tunInterface: null,
      exitGeo: exitGeo ? {
        countryCode: exitGeo.countryCode,
        timezone: exitGeo.timezone,
        locale: exitGeo.locale,
        regionLabel: exitGeo.regionLabel,
      } : null,
    });
  }

  function updateExitGeo(candidate) {
    if (candidate === null || candidate === undefined) {
      exitGeo = null;
      return snapshot();
    }
    exitGeo = normalizeExitGeoContext(candidate);
    return snapshot();
  }

  async function setMode(nextMode) {
    if (!ENVIRONMENT_MODES.includes(nextMode)) {
      throw fail('ENVIRONMENT_MODE_INVALID', '网络环境模式无效。');
    }
    const run = switching.then(async () => {
      if (nextMode === mode) return snapshot();
      const previous = mode;
      await Promise.resolve(closeBrowsers()).catch(() => {});
      if (nextMode === 'own_network' || previous !== 'own_network') {
        await Promise.resolve(stopTunnel()).catch(() => {});
      }
      if (nextMode === 'own_network') {
        exitGeo = null;
      }
      mode = nextMode;
      audit('environment_mode_changed', { from: previous, to: nextMode });
      return snapshot();
    });
    switching = run.catch(() => {});
    return run;
  }

  return Object.freeze({
    snapshot,
    getMode: () => mode,
    getExitGeo: () => exitGeo,
    updateExitGeo,
    setMode,
  });
}
