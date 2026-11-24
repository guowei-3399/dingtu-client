import test from 'node:test';
import assert from 'node:assert/strict';
import { ENVIRONMENT_MODES, createEnvironmentModeController } from './environment-mode.mjs';

test('environment mode supports safe_tunnel and own_network with clean tunnel/browser teardown on switches', async () => {
  assert.deepEqual(ENVIRONMENT_MODES, ['safe_tunnel', 'own_network']);
  const events = [];
  const controller = createEnvironmentModeController({
    stopTunnel: async () => { events.push('stop-tunnel'); },
    closeBrowsers: async () => { events.push('close-browsers'); },
    onAudit: (event, details) => { events.push([event, details]); },
  });

  assert.equal(controller.getMode(), 'safe_tunnel');
  assert.equal(controller.snapshot().requiresTunnel, true);

  controller.updateExitGeo({ countryCode: 'US', timezone: 'America/Los_Angeles', locale: 'en-US' });
  assert.equal(controller.getExitGeo().timezone, 'America/Los_Angeles');

  // Switch safe_tunnel -> own_network: closes browsers, stops tunnel, clears exitGeo
  const ownSnap = await controller.setMode('own_network');
  assert.equal(ownSnap.mode, 'own_network');
  assert.equal(ownSnap.requiresTunnel, false);
  assert.equal(ownSnap.exitGeo, null);
  assert.deepEqual(events.slice(0, 2), ['close-browsers', 'stop-tunnel']);

  events.length = 0;
  // Switch own_network -> safe_tunnel cleanly (no tunnel to stop when leaving own_network)
  const backSafe = await controller.setMode('safe_tunnel');
  assert.equal(backSafe.mode, 'safe_tunnel');
  assert.equal(backSafe.requiresTunnel, true);
  assert.deepEqual(events, [
    'close-browsers',
    ['environment_mode_changed', { from: 'own_network', to: 'safe_tunnel' }],
  ]);

  await assert.rejects(controller.setMode('strong_tun'), { code: 'ENVIRONMENT_MODE_INVALID' });
  await assert.rejects(controller.setMode('global_hijack'), { code: 'ENVIRONMENT_MODE_INVALID' });
});
