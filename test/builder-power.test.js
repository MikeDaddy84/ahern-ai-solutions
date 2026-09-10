const test = require('node:test');
const assert = require('node:assert/strict');

test('startup waits for assembly, ramps fans and lights, and stays running through summary updates', async () => {
  const { createPowerSequence } = await import('../public/builder-power.mjs');
  const sequence = createPowerSequence();
  assert.equal(sequence.sample(0).phase, 'off');
  assert.equal(sequence.update({ ready: true, hardwareKey: 'gaming', now: 0, installDelay: 1200 }), true);
  const waiting = sequence.sample(1000);
  assert.equal(waiting.fanSpeed, 0); assert.equal(waiting.lighting, 0); assert.equal(waiting.indicator, 0);
  const early = sequence.sample(1500);
  assert.ok(early.indicator > 0); assert.equal(early.lighting, 0);
  const middle = sequence.sample(2400);
  assert.ok(middle.fanSpeed > 0); assert.ok(middle.lighting > 0 && middle.lighting < 1);
  const peak = sequence.sample(2700);
  const running = sequence.sample(4100);
  assert.equal(running.phase, 'running'); assert.equal(running.lighting, 1);
  assert.ok(peak.fanSpeed > running.fanSpeed, 'Fan startup settles to an idle speed');
  assert.equal(sequence.update({ ready: true, hardwareKey: 'gaming', now: 4200 }), false, 'Answering the estimate must not reboot');
  assert.equal(sequence.sample(4200).phase, 'running');
  sequence.update({ ready: false, now: 4500 });
  assert.equal(sequence.sample(4500).phase, 'off');
  assert.equal(sequence.update({ ready: true, hardwareKey: 'gaming', now: 4600 }), true);
  assert.equal(sequence.sample(4600).phase, 'starting');
  assert.equal(sequence.update({ ready: true, hardwareKey: 'revised', now: 5000 }), true);
});

test('reduced motion and the motion toggle show a static powered state without replay', async () => {
  const { createPowerSequence } = await import('../public/builder-power.mjs');
  for (const initiallyEnabled of [true, false]) {
    const sequence = createPowerSequence();
    sequence.update({ ready: true, hardwareKey: 'ai', now: 0, installDelay: 1200, motion: initiallyEnabled });
    const paused = sequence.sample(100, false);
    assert.equal(paused.phase, 'running'); assert.equal(paused.fanSpeed, 0);
    assert.equal(paused.lighting, 1); assert.equal(paused.indicator, 1);
    assert.equal(sequence.sample(200, true).phase, 'running');
    sequence.update({ ready: false, now: 300 });
    assert.equal(sequence.sample(300, false).lighting, 0);
  }
});

test('hardware powers only selected ARGB, keeps plain builds unlit, and gives appliances a steady indicator', async () => {
  const THREE = await import('three');
  const { makeHardware } = await import('../public/builder-models.mjs');
  const { createPowerSequence, applyHardwarePower } = await import('../public/builder-power.mjs');
  const sequence = createPowerSequence();
  sequence.update({ ready: true, hardwareKey: 'test', now: 0 });
  const on = sequence.sample(3000);
  for (const rgb of [true, false]) {
    const spec = { kind: 'tower', rgb };
    const group = makeHardware(THREE, 'case', spec);
    assert.ok(group.userData.rotors.length);
    assert.ok(group.userData.lights.every(led => led.material.emissiveIntensity === 0));
    applyHardwarePower(group, spec, on, { delta: .1, now: 3000, motion: true });
    assert.ok(group.userData.rotors.every(rotor => rotor.rotation.z < 0));
    const lights = group.userData.lights;
    assert.ok(lights.some(led => led.role === 'power' && led.material.emissiveIntensity > 0));
    assert.ok(lights.filter(led => led.role === 'rgb').every(led => rgb ? led.material.emissiveIntensity > 0 : led.material.emissiveIntensity === 0));
    const angles = group.userData.rotors.map(rotor => rotor.rotation.z);
    applyHardwarePower(group, spec, on, { delta: .1, now: 3200, motion: false });
    assert.deepEqual(group.userData.rotors.map(rotor => rotor.rotation.z), angles);
    applyHardwarePower(group, spec, { indicator: 0, lighting: 0, fanSpeed: 0 }, { delta: .1, now: 3300, motion: true });
    assert.ok(lights.every(led => led.material.emissiveIntensity === 0));
  }
  const spec = { kind: 'appliance', appliance: 'mac', rgb: false };
  const appliance = makeHardware(THREE, 'appliance', spec);
  assert.equal(appliance.userData.rotors.length, 0);
  assert.equal(applyHardwarePower(appliance, spec, on, { delta: .1, now: 3000, motion: true }), false);
  assert.ok(appliance.userData.lights.length);
  assert.ok(appliance.userData.lights.every(led => led.role === 'power' && led.material.emissiveIntensity > 0));
});
