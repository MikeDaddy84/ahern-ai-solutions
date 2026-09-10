// Presentation-only power state. It never changes a configuration or estimate.
const clamp = value => Math.max(0, Math.min(1, value));
const ease = value => { const t = clamp(value); return t * t * (3 - 2 * t); };

export function createPowerSequence() {
  let key = null, start = 0, settled = false;
  return {
    update({ ready, hardwareKey, now, installDelay = 0, motion = true }) {
      if (!ready) { key = null; settled = false; return false; }
      if (key === hardwareKey) return false;
      key = hardwareKey;
      start = now + installDelay;
      settled = !motion;
      return true;
    },
    sample(now, motion = true) {
      if (key === null) return { phase: 'off', indicator: 0, lighting: 0, fanSpeed: 0 };
      // Disabling motion finishes startup immediately; enabling it never replays it.
      if (!motion) settled = true;
      const seconds = settled ? 3 : Math.max(0, (now - start) / 1000);
      if (seconds >= 2.8) settled = true;
      const spinUp = ease((seconds - .25) / 1.25);
      const settle = ease((seconds - 1.5) / 1.3);
      return {
        phase: settled ? 'running' : 'starting',
        indicator: ease(seconds / .35),
        lighting: ease((seconds - .65) / 1.35),
        fanSpeed: motion ? spinUp * (10 - 3 * settle) : 0
      };
    }
  };
}

export function applyHardwarePower(group, spec, power, { delta, now, motion }) {
  let moving = false;
  for (const rotor of group.userData.rotors) {
    if (motion && power.fanSpeed > 0) { rotor.rotation.z -= delta * power.fanSpeed; moving = true; }
  }
  for (const led of group.userData.lights) {
    const indicator = led.role === 'power';
    const enabled = indicator || (led.capable && spec?.rgb);
    const level = enabled ? (indicator ? power.indicator : power.lighting) : 0;
    if (level > 0) {
      const hue = indicator ? .46 : ((motion ? now * .000025 : .43) + led.phase) % 1;
      led.material.color.setHSL(hue, .7, .2 + .42 * level);
      led.material.emissive.setHSL(hue, .95, .5);
      led.material.emissiveIntensity = level * (indicator ? 1.1 : 1.7);
      if (motion && !indicator) moving = true;
    } else {
      led.material.color.setHex(0x69757d);
      led.material.emissive.setHex(0);
      led.material.emissiveIntensity = 0;
    }
  }
  return moving;
}
