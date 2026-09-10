import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
// Representative, procedural hardware. These are not manufacturer CAD models.
// Pure catalog mapping is shared with the scene tests; prices remain in pricing.js.
export function describeBuild(build = {}, pricing) {
  const key = (slot, part) => Object.keys(pricing.parts[slot] || {}).find(k => pricing.parts[slot][k] === part) || '';
  const gpu = key('gpu', build.gpu);
  const chassis = key('case', build.case);
  const cooling = key('cooling', build.cooling);
  const storage = key('storage', build.storage);
  const appliance = Object.keys(pricing.appliances).find(k => pricing.appliances[k] === build.appliance) || '';
  const kind = build.delivery === 'appliance' ? 'appliance' : chassis === 'rack' ? 'rack' : chassis === 'sff' ? 'compact' : 'tower';
  return {
    kind, appliance, gpuKey: gpu, gpuLabel: build.gpu?.label || '', ramLabel: build.ram?.label || '',
    gpuCount: !gpu || gpu === 'igpu' ? 0 : gpu === 'aiFrontier' ? 4 : gpu === 'aiFlagship' ? 2 : 1,
    gpuTier: build.gpu?.tier || 1, memoryCount: !build.ram ? 0 : parseInt(build.ram.label) >= 64 ? 4 : 2,
    liquid: cooling === 'aio' || cooling === 'loop', customLoop: cooling === 'loop',
    bulkStorage: /Bulk|Raid|Net/.test(storage), rgb: chassis === 'glassRgb',
    chassis, accent: build.track === 'gaming' ? 0x00e5a0 : build.track === 'creative' ? 0x39a5ff : build.track === 'ai' ? 0xff9b55 : 0x87bacc,
    slots: kind === 'appliance'
      ? { appliance: build.appliance?.label || 'pending', storage: build.storage?.label || '' }
      : { case: chassis || 'pending', board: build.track || 'pending', cpu: build.cpu?.label || '', gpu: build.gpu?.label || '', ram: build.ram?.label || '', storage: build.storage?.label || '', cooling: build.cooling?.label || '' }
  };
}

export function makeHardware(THREE, slot, spec) {
  const root = new THREE.Group(); root.name = slot;
  root.userData.rotors = []; root.userData.lights = []; root.userData.units = [];
  const mat = (color, metalness = .65, roughness = .32) => new THREE.MeshStandardMaterial({ color, metalness, roughness, envMapIntensity: .8 });
  const charcoal = mat(0x24292f), black = mat(0x080d12, .3, .43), alloy = mat(0xa9b1b6, .85, .23);
  const pcb = mat(0x111e1b, .18, .7), gold = mat(0xcba958, .8, .28), rubber = mat(0x0c1015, .05, .8);
  function box(w, h, d, x, y, z, material = charcoal, parent = root, radius = 0) {
    const geometry = radius ? new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 3, h / 3, d / 3)) : new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function disc(radius, depth, x, y, z, material = black, parent = root) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, depth, 40), material);
    mesh.rotation.x = Math.PI / 2; mesh.position.set(x, y, z); mesh.castShadow = true; parent.add(mesh); return mesh;
  }
  function bank(w, h, d, count, spacing, x, y, z, material, parent = root, axis = 'x') {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(w, h, d), material, count);
    const transform = new THREE.Object3D();
    for (let i = 0; i < count; i++) { transform.position.set(x, y, z); transform.position[axis] += i * spacing; transform.updateMatrix(); mesh.setMatrixAt(i, transform.matrix); }
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function screw(x, y, z, parent = root) {
    disc(.025, .019, x, y, z, alloy, parent);
    box(.027, .004, .003, x, y, z + .011, black, parent);
    box(.004, .027, .003, x, y, z + .011, black, parent);
  }
  function line(points, radius = .022, material = rubber, parent = root) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, radius, 8, false), material); mesh.castShadow = true; parent.add(mesh); return mesh;
  }
  function lightMaterial(phase = 0, enabled = spec.rgb, capable = true, role = 'rgb') {
    const material = mat(0x69757d, .15, .3);
    material.emissiveIntensity = 0;
    root.userData.lights.push({ material, phase, enabled, capable, role }); return material;
  }
  function label(text, width, height, x, y, z, parent = root, color = '#d8dfe1', background = null) {
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = Math.round(512 * height / width);
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.fillStyle = color; ctx.font = '600 ' + Math.round(canvas.height * .65) + 'px Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width * .94);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
    mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  }
  function fan(radius, x, y, z, parent = root, lighting = true, phase = 0) {
    const group = new THREE.Group(); group.position.set(x, y, z); parent.add(group);
    box(radius * 2.28, radius * 2.28, .1, 0, 0, -.035, black, group, .03);
    disc(radius * 1.035, .08, 0, 0, .025, rubber, group);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * .99, radius * .052, 10, 56), lightMaterial(phase, lighting && spec.rgb, lighting));
    ring.position.z = .075; group.add(ring);
    const rotor = new THREE.Group(); rotor.position.z = .075; group.add(rotor); root.userData.rotors.push(rotor);
    const blade = new THREE.Shape();
    blade.moveTo(.06 * radius, .16 * radius);
    blade.bezierCurveTo(.5 * radius, .24 * radius, .92 * radius, .48 * radius, .9 * radius, .03 * radius);
    blade.bezierCurveTo(.85 * radius, -.23 * radius, .37 * radius, -.15 * radius, .13 * radius, .04 * radius);
    blade.closePath();
    const bladeGeometry = new THREE.ExtrudeGeometry(blade, { depth: .018, bevelEnabled: false });
    const blades = new THREE.InstancedMesh(bladeGeometry, mat(0x424951, .55, .3), 9);
    const transform = new THREE.Object3D();
    for (let i = 0; i < 9; i++) { transform.rotation.z = i / 9 * Math.PI * 2; transform.updateMatrix(); blades.setMatrixAt(i, transform.matrix); }
    rotor.add(blades); disc(radius * .23, .045, 0, 0, .05, alloy, rotor);
    disc(radius * .17, .049, 0, 0, .055, black, rotor);
    [-1, 1].forEach(a => [-1, 1].forEach(b => screw(a * radius, b * radius, .035, group)));
    return group;
  }
  function circuitTexture() {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 768;
    const ctx = canvas.getContext('2d'); if (!ctx) return null;
    ctx.fillStyle = '#111c19'; ctx.fillRect(0, 0, 512, 768);
    let seed = 43; const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < 120; i++) {
      const x = rand() * 512, y = rand() * 768, length = 15 + rand() * 110;
      ctx.strokeStyle = i % 4 ? '#293b30' : '#736648'; ctx.lineWidth = i % 4 ? 1.2 : 1.8;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + length / 2, y); ctx.lineTo(x + length, y + length / 2); ctx.lineTo(x + length, y + length); ctx.stroke();
      ctx.fillStyle = '#b8a56c'; ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    ctx.fillStyle = '#b9c7bb'; ctx.font = '14px Arial'; ['PCIEX16', 'M.2 NVMe', 'DDR5', 'CPU_PWR', 'USB 3.2'].forEach((t, i) => ctx.fillText(t, 30, 120 + i * 135));
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
  }
  if (slot === 'case') {
    box(2.3, .1, 2, 0, -1.66, 0, charcoal, root, .025);
    box(2.3, .08, 2, 0, 1.66, 0, charcoal, root, .02);
    box(2.22, 3.24, .055, 0, 0, -.97, black);
    [-1.09, 1.09].forEach(x => [-.93, .93].forEach(z => box(.062, 3.27, .062, x, 0, z, charcoal, root, .012)));
    // Front fan rail and perforated intake. The near side is a removable cutaway.
    const front = new THREE.Group(); front.position.set(1.065, 0, 0); front.rotation.y = Math.PI / 2; root.add(front);
    for (let i = 0; i < 3; i++) fan(.4, 0, 1.02 - i * 1.02, 0, front, true, i * .16);
    [-.61, .61].forEach(x => box(.09, 3.25, .12, x, 0, .05, charcoal, front, .02));
    bank(.008, 3.08, .015, 27, .045, -.59, 0, .19, charcoal, front);
    // Glass is visible as a lightly tinted rim; the open center keeps components readable.
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xaed9ed, transparent: true, opacity: .15, metalness: .08, roughness: .06, depthWrite: false, side: THREE.DoubleSide });
    if (spec.rgb) {
      box(.22, 3.17, .012, -1, 0, .975, glass);
      box(2.08, .12, .012, 0, 1.55, .975, glass);
      box(2.08, .12, .012, 0, -1.55, .975, glass);
    }
    box(1.99, .37, 1.74, -.055, -1.42, -.03, charcoal, root, .025);
    label('AHERN  /  PERFORMANCE SYSTEMS', 1.15, .09, -.17, -1.44, .853);
    bank(.024, .15, .01, 15, .045, .14, -1.41, .85, black);
    [-.84, .84].forEach(x => [-.7, .7].forEach(z => box(.23, .14, .3, x, -1.78, z, rubber, root, .035)));
    [-1.075, 1.075].forEach(x => [-1.56, 1.56].forEach(y => screw(x, y, .98)));
    disc(.052, .02, 1.055, 1.54, .57, lightMaterial(.7, true, true, 'power'));
    box(.13, .04, .025, .85, 1.59, .97, black);
    if (spec.chassis === 'rack') [-1.22, 1.22].forEach(x => { box(.23, 3.4, .12, x, 0, .92, alloy); [-1.3, 1.3].forEach(y => disc(.035, .14, x, y, 1, black)); });
    // Visible cable loom emerging from the PSU compartment.
    for (let i = 0; i < 5; i++) line([[.77 + i * .025, -1.25, -.3], [.77 + i * .025, -.8, -.49], [.78 + i * .025, .12, -.4], [.66, .2, -.42]], .009);
  } else if (slot === 'board') {
    const boardMaterial = mat(0x283a32, .2, .65); const texture = circuitTexture();
    if (texture) boardMaterial.map = texture;
    box(1.77, 2.55, .065, -.12, .07, -.68, pcb, root, .013);
    box(1.76, 2.54, .008, -.12, .07, -.642, boardMaterial);
    // Socket bracket, VRM heatsinks and rear I/O enclosure.
    box(.65, .65, .055, -.27, .61, -.6, alloy, root, .025);
    box(.52, .52, .063, -.27, .61, -.564, black);
    line([[.09, .9, -.52], [.11, .37, -.52], [.02, .28, -.52]], .012, alloy);
    box(.29, 1.17, .23, -.84, .64, -.5, charcoal, root, .024);
    bank(.016, 1.1, .028, 10, .025, -.956, .64, -.371, alloy);
    box(.86, .23, .2, -.32, 1.2, -.52, charcoal, root, .025);
    bank(.014, .18, .028, 28, .025, -.65, 1.2, -.407, alloy);
    for (let i = 0; i < 4; i++) {
      const x = .27 + i * .126;
      box(.06, .94, .095, x, .64, -.56, black);
      box(.018, .83, .014, x, .64, -.506, gold);
      [-.49, .49].forEach(y => box(.072, .07, .105, x, .64 + y, -.525, alloy, root, .01));
    }
    [-.22, -.61, -.98].forEach(y => {
      box(1.16, .073, .095, -.2, y, -.563, alloy, root, .012);
      box(1.02, .026, .018, -.22, y, -.503, black);
      box(.075, .11, .08, .39, y, -.52, black);
    });
    box(.47, .32, .09, .37, -.38, -.54, charcoal, root, .018);
    label('AHERN', .33, .07, .37, -.38, -.488);
    for (let i = 0; i < 7; i++) {
      disc(.033, .07, -.88, -.23 - i * .115, -.545, alloy);
      box(.075, .065, .055, -.69, -.27 - i * .13, -.557, black);
    }
    bank(.027, .06, .018, 19, .064, -.76, -1.15, -.57, gold);
    [-.93, .71].forEach(x => [-1.15, 1.27].forEach(y => screw(x, y, -.59)));
    label('A / ATX', .35, .09, -.62, -.82, -.588);
  } else if (slot === 'cpu') {
    box(.53, .53, .035, -.27, .61, -.513, pcb);
    box(.47, .47, .048, -.27, .61, -.465, alloy, root, .018);
    label('CPU', .22, .1, -.27, .65, -.437, root, '#545d62');
    label('DESKTOP PROCESSOR', .32, .035, -.27, .55, -.436, root, '#5c6569');
  } else if (slot === 'gpu') {
    const model = /RTX\s*\d{4}(?:\s*Ti)?/.exec(spec.gpuLabel)?.[0] || (spec.gpuKey === 'aiFlagship' ? 'RTX 5090' : spec.gpuKey === 'aiFrontier' ? 'RTX / COMPUTE' : 'WORKSTATION');
    for (let i = 0; i < spec.gpuCount; i++) {
      const card = new THREE.Group(); card.position.set(-.1, spec.gpuCount > 1 ? .06 - i * .37 : -.58, .31 + i * .08); root.add(card);
      const length = spec.gpuTier >= 3 ? 1.77 : 1.48;
      const height = spec.gpuCount > 1 ? .31 : .65;
      box(length, height, .2, 0, 0, 0, charcoal, card, .05);
      box(length - .06, height - .035, .025, 0, 0, -.12, alloy, card, .007);
      bank(.016, height - .07, .16, 40, (length - .16) / 40, -length / 2 + .08, 0, .075, alloy, card);
      box(length, .055, .21, 0, height / 2, .02, black, card, .013);
      box(length, .045, .22, 0, -height / 2, .02, black, card, .01);
      const count = spec.gpuTier >= 3 ? 3 : 2;
      for (let j = 0; j < count; j++) {
        const radius = Math.min(.25, height * .39);
        const x = (j - (count - 1) / 2) * (length - .2) / count;
        fan(radius, x, 0, .16, card, false);
      }
      label(model.startsWith('RTX') ? 'GEFORCE ' + model : model, length * .72, .075, 0, height / 2 + .008, .142, card);
      box(.28, .017, .022, length / 2 - .23, height / 2 + .02, .145, lightMaterial(.43), card);
      [-1, 1].forEach(a => [-1, 1].forEach(b => screw(a * (length / 2 - .04), b * (height / 2 - .06), .13, card)));
      // Gold edge connector and black braided power leads.
      box(.48, .055, .02, -.19, -height / 2 - .027, -.04, gold, card);
      for (let j = 0; j < 4; j++) line([[length / 2 - .05, height / 2, -.025 + j * .017], [.91 + j * .014, .35, .05], [1 + j * .012, -.45, -.22]], .011, rubber, card);
      root.userData.units.push({ group: card, home: card.position.clone(), index: i });
    }
  } else if (slot === 'ram') {
    const capacity = parseInt(spec.ramLabel) / spec.memoryCount;
    for (let i = 0; i < spec.memoryCount; i++) {
      const dimm = new THREE.Group();
      dimm.position.set(.27 + (spec.memoryCount === 2 ? 1 + i * 2 : i) * .126, .64, -.42); root.add(dimm);
      box(.039, .86, .21, 0, 0, 0, pcb, dimm);
      box(.044, .76, .16, 0, 0, .02, charcoal, dimm, .01);
      box(.049, .81, .035, 0, 0, .12, lightMaterial(.12 + i * .14), dimm, .012);
      bank(.044, .068, .037, 7, .095, 0, -.29, .042, black, dimm, 'y');
      box(.042, .7, .025, 0, 0, -.108, gold, dimm);
      const decal = label(capacity + 'GB DDR5', .43, .047, .026, 0, .015, dimm);
      if (decal) decal.rotation.y = Math.PI / 2;
      root.userData.units.push({ group: dimm, home: dimm.position.clone(), index: i });
    }
  } else if (slot === 'storage') {
    box(.68, .165, .023, -.23, -.42, -.55, pcb, root, .006);
    for (let i = 0; i < 3; i++) box(.13, .12, .022, -.42 + i * .18, -.42, -.522, black);
    label('NVMe  /  PCIe', .38, .055, -.23, -.42, -.506, root, '#e6e6df', '#26282b');
    screw(.07, -.42, -.51);
    if (spec.bulkStorage) {
      box(.62, .21, .62, .59, -1.15, .13, alloy, root, .025);
      label('ARCHIVE', .3, .055, .59, -1.15, .451, root, '#626b71');
    }
  } else if (slot === 'cooling') {
    if (spec.liquid) {
      disc(.235, .17, -.27, .61, -.25, charcoal);
      disc(.202, .02, -.27, .61, -.153, black);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.205, .021, 10, 64), lightMaterial(.6)); ring.position.set(-.27, .61, -.14); root.add(ring);
      label('A', .17, .14, -.27, .61, -.133);
      box(1.65, .15, .88, -.1, 1.44, .05, charcoal, root, .03);
      bank(.012, .13, .78, 49, .031, -.845, 1.44, .05, alloy);
      [-.5, .31].forEach((x, i) => { const f = fan(.34, x, 1.31, .05, root, true, .4 + i * .15); f.rotation.x = Math.PI / 2; });
      line([[-.06, .59, -.19], [.27, .55, .14], [.67, .95, .3], [.62, 1.42, .13]], .04);
      line([[-.06, .69, -.19], [.22, .73, .17], [.48, 1.02, .38], [.45, 1.42, .13]], .04);
      if (spec.customLoop) {
        const fluid = new THREE.MeshPhysicalMaterial({ color: 0x56edcf, metalness: 0, roughness: .09, transparent: true, opacity: .7 });
        const reservoir = disc(.105, .61, .74, .2, .45, fluid); reservoir.rotation.x = 0;
        [.52, -.12].forEach(y => { const cap = disc(.122, .06, .74, y, .45, charcoal); cap.rotation.x = 0; });
        line([[.74, -.13, .45], [.72, -.45, .57], [.4, -.61, .58]], .031, fluid);
      }
    } else {
      for (let i = 0; i < 4; i++) line([[-.46 + i * .12, .61, -.4], [-.46 + i * .12, .23, -.05], [-.46 + i * .12, .92, .03]], .018, gold);
      bank(.58, .014, .53, 22, .023, -.27, .36, -.09, alloy, root, 'y');
      fan(.29, -.27, .61, .22, root, false);
      box(.6, .03, .56, -.27, .9, -.08, charcoal, root, .01);
      label('AHERN', .24, .06, -.27, .91, .207);
    }
  } else if (slot === 'appliance') {
    const count = spec.appliance === 'sparkPair' ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const x = count === 2 ? (i - .5) * 1.8 : 0;
      const h = spec.appliance === 'dgxStation' ? 2.8 : .8;
      const silverBox = /mac/i.test(spec.appliance);
      box(1.57, h, 1.66, x, -.4, 0, silverBox ? alloy : charcoal, root, .075);
      box(1.36, .06, 1.4, x, -.4 - h / 2, 0, black, root, .02);
      bank(.014, h * .54, .015, 48, .029, x - .68, -.35, .838, black);
      box(.045, .02, .02, x + .6, -.65, .841, lightMaterial(0, true, true, 'power'));
      [-.46, -.2].forEach(p => box(.17, .055, .014, x + p, -.64, .841, black, root, .01));
      label(silverBox ? 'AI STUDIO' : /spark/i.test(spec.appliance) ? 'DGX SPARK CLASS' : 'LOCAL AI', .69, .07, x, -.16, .846);
    }
  }
  // Keep unlit designs dark; RGB is driven by selected hardware, never the theme.
  root.userData.baseScale = new THREE.Vector3(1, 1, 1);
  if (spec.kind === 'compact') root.userData.baseScale.set(.8, .8, .85);
  if (spec.kind === 'rack') root.userData.baseScale.set(1.28, .64, 1.12);
  root.scale.copy(root.userData.baseScale);
  return root;
}
