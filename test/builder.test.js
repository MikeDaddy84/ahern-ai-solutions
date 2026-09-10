const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

function studio(hash = '') {
  const dom = new JSDOM(fs.readFileSync('public/pc-builder.html', 'utf8'), { url: 'https://example.test/pc-builder' + hash, runScripts: 'outside-only', pretendToBeVisual: true });
  dom.window.matchMedia = () => ({ matches: true }); dom.window.scrollTo = () => {};
  dom.window.eval(fs.readFileSync('public/pricing.js', 'utf8'));
  dom.window.eval(fs.readFileSync('public/pc-builder.js', 'utf8'));
  return dom;
}
function choose(dom, i) { const button = dom.window.document.querySelectorAll('.builder-option')[i]; assert.ok(button, 'Option exists'); button.click(); }
function finish(dom) { let n = 0; while (!dom.window.AHERN_BUILD.finished && n++ < 15) choose(dom, 0); assert.ok(dom.window.AHERN_BUILD.finished); }

test('all four tracks and both AI delivery forks reach a quote with a finite estimate', () => {
  for (const track of ['gaming', 'creative', 'everyday', 'ai']) {
    for (const delivery of track === 'ai' ? [0, 1] : [0]) {
      const dom = studio('#b=' + track); if (track === 'ai') choose(dom, delivery); finish(dom);
      const { build, estimate } = dom.window.AHERN_BUILD;
      assert.ok(estimate.total.every(Number.isFinite)); assert.ok(estimate.total[1] >= estimate.total[0]);
      const link = dom.window.document.querySelector('.builder-cta-row a');
      assert.ok(new URL(link.href).searchParams.get('build').includes('Sandbox estimate'));
      if (delivery) { assert.equal(build.delivery, 'appliance'); assert.equal(estimate.platform, null); }
      assert.match(dom.window.location.hash, /^#v=1&b=/); dom.window.close();
    }
  }
});

test('startup is requested at the estimate question on every track, with answers immediately usable', () => {
  for (const track of ['gaming', 'creative', 'everyday', 'ai']) {
    for (const delivery of track === 'ai' ? [0, 1] : [0]) {
      const dom = studio('#b=' + track);
      if (track === 'ai') choose(dom, delivery);
      let steps = 0;
      while (dom.window.AHERN_BUILD.phase === 'configuring' && steps++ < 15) choose(dom, 0);
      assert.equal(dom.window.AHERN_BUILD.phase, 'expectation', track);
      assert.equal(dom.window.AHERN_BUILD.finished, false);
      assert.equal(dom.window.AHERN_BUILD.estimate.complete, true);
      assert.match(dom.window.document.querySelector('.builder-question').textContent, /How does the estimate feel/);
      assert.equal(dom.window.document.querySelectorAll('.builder-option:disabled').length, 0);
      const price = Array.from(dom.window.AHERN_BUILD.estimate.total);
      choose(dom, 2);
      assert.equal(dom.window.AHERN_BUILD.phase, 'summary');
      assert.deepEqual(Array.from(dom.window.AHERN_BUILD.estimate.total), price);
      dom.window.document.querySelector('[data-step="0"]').click();
      assert.equal(dom.window.AHERN_BUILD.phase, 'configuring', 'Editing pauses the powered preview even for a completed build');
      dom.window.document.querySelector('#builder-back').click();
      assert.equal(dom.window.AHERN_BUILD.phase, 'summary');
      dom.window.close();
    }
  }
});

test('saved complete builds request startup and changed hardware returns to the estimate check', () => {
  const dom = studio('#v=1&b=gaming.0.0.1.1.0.2.2');
  assert.equal(dom.window.AHERN_BUILD.phase, 'summary');
  dom.window.document.querySelector('[data-step="3"]').click();
  assert.equal(dom.window.AHERN_BUILD.phase, 'configuring');
  choose(dom, 2);
  assert.equal(dom.window.AHERN_BUILD.phase, 'expectation');
  dom.window.close();
});

test('editing RAM keeps the machine assembled and preserves GPU, chassis, and cooling', () => {
  const dom = studio('#b=gaming.1.1.0.1.0.1.0');
  const before = dom.window.AHERN_BUILD.build;
  dom.window.document.querySelector('[data-step="3"]').click();
  assert.equal(dom.window.AHERN_BUILD.build.gpu, before.gpu);
  assert.equal(dom.window.AHERN_BUILD.build.case, before.case);
  choose(dom, 2);
  const after = dom.window.AHERN_BUILD.build;
  assert.equal(after.ram.label, '64GB'); assert.equal(after.gpu, before.gpu); assert.equal(after.cooling, before.cooling); assert.equal(after.case, before.case);
  assert.equal(dom.window.AHERN_BUILD.finished, false, 'Changed total needs reconfirmation');
  choose(dom, 0); assert.equal(dom.window.AHERN_BUILD.finished, true); dom.window.close();
});

test('changing RGB case preserves every compatible part and updates the visual state', () => {
  const dom = studio('#b=gaming.1.1.1.1.1.1.0');
  const before = dom.window.AHERN_BUILD.build;
  dom.window.document.querySelector('[data-step="5"]').click(); choose(dom, 0);
  const after = dom.window.AHERN_BUILD.build;
  assert.equal(after.case, dom.window.AHERN_PRICING.parts.case.glassRgb);
  for (const slot of ['cpu', 'gpu', 'ram', 'storage', 'cooling']) assert.equal(after[slot], before[slot]);
  dom.window.close();
});

test('changing AI delivery resets incompatible answers rather than reinterpreting them', () => {
  const dom = studio('#b=ai.0.1.2.0.0.1.0');
  dom.window.document.querySelector('[data-step="1"]').click(); choose(dom, 1);
  assert.equal(dom.window.AHERN_BUILD.build.delivery, 'appliance');
  assert.equal(dom.window.AHERN_BUILD.build.gpu, null); finish(dom); dom.window.close();
});

test('saved comparison retains its original estimate after editing the current build', () => {
  const dom = studio('#b=gaming.1.1.0.1.0.1.0');
  const total = dom.window.AHERN_BUILD.estimate.total.slice();
  dom.window.document.querySelector('#compare-save').click();
  dom.window.document.querySelector('[data-step="3"]').click(); choose(dom, 2); choose(dom, 0);
  const snapshot = JSON.parse(dom.window.sessionStorage.getItem('ahern-build-comparison-v1'));
  assert.deepEqual(snapshot.total, Array.from(total)); assert.ok(dom.window.document.querySelector('.comparison table'));
  assert.notDeepEqual(Array.from(dom.window.AHERN_BUILD.estimate.total), snapshot.total); dom.window.close();
});

test('legacy links survive and malformed hashes safely return to a usable question', () => {
  for (const hash of ['#b=%', '#b=gaming.1x.0', '#v=999&b=ai.0', '#b=ai.99', '#b=gaming.1.1.0.1.0.1.0']) {
    const dom = studio(hash); assert.ok(dom.window.document.querySelector('.builder-question'));
    if (hash.includes('1x')) assert.equal(dom.window.AHERN_BUILD.build.gpu, null);
    dom.window.close();
  }
});

test('browser back restores the previous configuration', async () => {
  const dom = studio('#b=gaming'); choose(dom, 0); choose(dom, 1);
  const previous = dom.window.AHERN_BUILD.build.gpu;
  await new Promise(resolve => { dom.window.addEventListener('popstate', resolve, { once: true }); dom.window.history.back(); });
  assert.equal(dom.window.AHERN_BUILD.build.gpu, previous); assert.match(dom.window.location.hash, /gaming\.0$/); dom.window.close();
});

test('3D hardware mapping matches GPU counts, RAM, ARGB, appliances and every case', async () => {
  const THREE = await import('three'); const { describeBuild, makeHardware } = await import('../public/builder-models.mjs');
  const dom = studio('#b=gaming.1.1.1.1.0.1.0'), p = dom.window.AHERN_PRICING;
  for (const [gpu, count] of [[p.parts.gpu.igpu, 0], [p.parts.gpu.game1440, 1], [p.parts.gpu.aiFlagship, 2], [p.parts.gpu.aiFrontier, 4]]) {
    const spec = describeBuild({ ...dom.window.AHERN_BUILD.build, gpu }, p); assert.equal(spec.gpuCount, count);
    const mesh = makeHardware(THREE, 'gpu', spec); assert.equal(mesh.userData.units.length, count);
  }
  for (const chassis of Object.values(p.parts.case)) {
    const spec = describeBuild({ ...dom.window.AHERN_BUILD.build, case: chassis }, p);
    assert.equal(spec.rgb, chassis === p.parts.case.glassRgb);
    for (const slot of Object.keys(spec.slots)) {
      const model = makeHardware(THREE, slot, spec); model.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(model);
      assert.ok([...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite));
      assert.ok(model.userData.rotors); assert.ok(model.userData.lights);
    }
  }
  for (const appliance of Object.values(p.appliances)) {
    const spec = describeBuild({ delivery: 'appliance', appliance }, p);
    assert.equal(spec.kind, 'appliance'); assert.ok(!spec.slots.gpu);
    assert.ok(makeHardware(THREE, 'appliance', spec).children.length);
  }
  dom.window.close();
});
