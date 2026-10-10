import type { ContentItem } from '@/lib/types/content';

/**
 * 大学物理 · 详解分类内容
 * 13 章 42 节，源自课件 PPT 与学习指导（第1-5、7-9、10-14章；无第6章课件）。
 */
export const physicsDetailItems: ContentItem[] = [
  {
    id: 'ch01',
    title: '力学基本定律',
    type: 'section',
    status: 'done',
    summary: '质点运动学、牛顿定律、动量、功与能、刚体定轴转动、物体弹性。',
    children: [
      { id: '1.1', title: '质点运动学', type: 'section', status: 'done', videoIds: [], interactiveIds: [] },
      { id: '1.2', title: '牛顿定律与动量', type: 'section', status: 'done', videoIds: [], interactiveIds: [] },
      { id: '1.3', title: '功、能与碰撞', type: 'section', status: 'done', videoIds: [], interactiveIds: [] },
      { id: '1.4', title: '刚体转动与弹性', type: 'section', status: 'done', videoIds: [], interactiveIds: [] },
    ],
  },
  {
    id: 'ch02',
    title: '流体运动',
    type: 'section',
    status: 'done',
    summary: '理想流体、连续性方程、伯努利方程、黏性流体与血液流动。',
    children: [
      { id: '2.1', title: '理想流体的稳定流动与连续性方程', type: 'section', status: 'done', videoIds: ['phys-ch02-2.1-ex1-artery-stenosis-velocity', 'phys-ch02-2.1-kp2-streamline-flow-tube', 'phys-ch02-2.1-kp3-continuity-equation'], interactiveIds: [] },
      { id: '2.2', title: '伯努利方程及其应用', type: 'section', status: 'done', videoIds: ['phys-ch02-2.2-ex1-tank-orifice-velocity', 'phys-ch02-2.2-ex2-aircraft-wing-lift', 'phys-ch02-2.2-ex3-venturi-flowmeter', 'phys-ch02-2.2-kp1-bernoulli-derivation', 'phys-ch02-2.2-kp2-bernoulli-pressure-velocity-tradeoff'], interactiveIds: [] },
      { id: '2.3', title: '黏性流体、泊肃叶定律与血液流动', type: 'section', status: 'done', videoIds: ['phys-ch02-2.3-ex1-poiseuille-viscosity-measurement', 'phys-ch02-2.3-ex2-max-velocity-artery-reynolds', 'phys-ch02-2.3-ex3-viscous-bernoulli-energy-loss', 'phys-ch02-2.3-kp1-newton-viscosity-law', 'phys-ch02-2.3-kp2-poiseuille-law-velocity-profile', 'phys-ch02-2.3-kp3-reynolds-number-laminar-turbulent', 'phys-ch02-2.3-kp4-blood-circulation-velocity-pressure'], interactiveIds: [] },
    ],
  },
  {
    id: 'ch03',
    title: '振动',
    type: 'section',
    status: 'done',
    summary: '简谐振动、振动合成、阻尼振动与受迫振动。',
    children: [
      { id: '3.1', title: '简谐振动', type: 'section', status: 'done', videoIds: ['phys-ch03-3.1-ex1-floating-block-shm', 'phys-ch03-3.1-ex2-initial-phase-phasor', 'phys-ch03-3.1-kp2-shm-equation-derivation', 'phys-ch03-3.1-kp3-rotating-vector-method', 'phys-ch03-3.1-kp4-shm-phase-xva', 'phys-ch03-3.1-kp5-shm-energy'], interactiveIds: [] },
      { id: '3.2', title: '简谐振动的合成', type: 'section', status: 'done', videoIds: ['phys-ch03-3.2-ex1-phasor-addition-example', 'phys-ch03-3.2-kp1-same-freq-synthesis-phasor', 'phys-ch03-3.2-kp2-beat-phenomenon', 'phys-ch03-3.2-kp3-perpendicular-lissajous'], interactiveIds: [] },
      { id: '3.3', title: '阻尼振动、受迫振动和共振', type: 'section', status: 'done', videoIds: ['phys-ch03-3.3-ex1-three-damping-comparison', 'phys-ch03-3.3-kp1-damped-oscillation', 'phys-ch03-3.3-kp2-resonance-amplitude-curve'], interactiveIds: [] },
    ],
  },
  {
    id: 'ch04',
    title: '机械波',
    type: 'section',
    status: 'done',
    summary: '平面简谐波、波的能量与干涉、多普勒效应与声波。',
    children: [
      { id: '4.1', title: '机械波的特点与平面简谐波', type: 'section', status: 'done', videoIds: ['phys-ch04-4.1-ex1-wave-param-from-equation', 'phys-ch04-4.1-ex2-phase-tracking-along-wave', 'phys-ch04-4.1-kp1-plane-wave', 'phys-ch04-4.1-kp2-wave-function-meaning', 'phys-ch04-4.1-kp3-transverse-vs-longitudinal'], interactiveIds: [] },
      { id: '4.2', title: '波的能量、衍射、干涉与驻波', type: 'section', status: 'done', videoIds: ['phys-ch04-4.2-ex1-interference-coherent-sources', 'phys-ch04-4.2-ex2-standing-wave-nodes-antinodes', 'phys-ch04-4.2-kp1-wave-energy-density', 'phys-ch04-4.2-kp2-wave-interference-pattern', 'phys-ch04-4.2-kp3-standing-wave-formation'], interactiveIds: [] },
      { id: '4.3', title: '多普勒效应与声波', type: 'section', status: 'done', videoIds: ['phys-ch04-4.3-ex1-sonar-doppler-submarine', 'phys-ch04-4.3-ex2-doppler-beat-frequency', 'phys-ch04-4.3-kp1-doppler-effect-mechanism', 'phys-ch04-4.3-kp2-sound-intensity-level'], interactiveIds: [] },
    ],
  },
  {
    id: 'ch05',
    title: '分子动理论',
    type: 'section',
    status: 'done',
    summary: '理想气体状态方程、压强与能量公式、速率分布、液体表面现象。',
    children: [
      { id: '5.1', title: '分子动理论基本概念与理想气体', type: 'section', status: 'done', videoIds: ['phys-ch05-5.1-ex1-gas-bubble-rising-volume', 'phys-ch05-5.1-kp2-molecular-force-potential-well', 'phys-ch05-5.1-kp3-pressure-derivation-molecular-collision', 'phys-ch05-5.1-kp4-energy-equipartition-degrees-of-freedom'], interactiveIds: [] },
      { id: '5.2', title: '气体分子速率分布与液体表面现象', type: 'section', status: 'done', videoIds: ['phys-ch05-5.2-ex1-three-speed-comparison-maxwell', 'phys-ch05-5.2-ex2-soap-bubble-pressure-work', 'phys-ch05-5.2-ex3-capillary-height-ratio-two-tubes', 'phys-ch05-5.2-kp2-maxwell-speed-distribution', 'phys-ch05-5.2-kp3-mean-free-path-collision-frequency', 'phys-ch05-5.2-kp4-boltzmann-distribution-atmosphere', 'phys-ch05-5.2-kp5-surface-tension-molecular-origin', 'phys-ch05-5.2-kp6-curved-surface-excess-pressure', 'phys-ch05-5.2-kp7-capillary-rise-contact-angle'], interactiveIds: [] },
    ],
  },
  {
    id: 'ch07',
    title: '静电场',
    type: 'section',
    status: 'done',
    summary: '库仑定律、电场强度、高斯定理、电势、电偶极子。',
    children: [
      { id: '7.1', title: '电荷、库仑定律与电场强度', type: 'section', status: 'done', videoIds: ['phys-ch07-7.1-ex1-finite-line-charge-field', 'phys-ch07-7.1-kp1-electric-field', 'phys-ch07-7.1-kp2-superposition-continuous-charge'], interactiveIds: [] },
      { id: '7.2', title: '电场线、电通量与高斯定理', type: 'section', status: 'done', videoIds: ['phys-ch07-7.2-ex1-cylinder-gauss-surface', 'phys-ch07-7.2-ex2-charged-disk-field', 'phys-ch07-7.2-kp1-electric-flux-gauss-law', 'phys-ch07-7.2-kp2-gauss-law-symmetric-fields'], interactiveIds: [] },
      { id: '7.3', title: '静电场的环路定理、电势与场强关系', type: 'section', status: 'done', videoIds: ['phys-ch07-7.3-ex1-solid-sphere-potential-distribution', 'phys-ch07-7.3-ex2-charged-sphere-capacitor-energy', 'phys-ch07-7.3-kp1-circulation-theorem-electric-potential', 'phys-ch07-7.3-kp2-gradient-field-potential-relation'], interactiveIds: [] },
      { id: '7.4', title: '电偶极子与电偶层', type: 'section', status: 'done', videoIds: ['phys-ch07-7.4-ex1-dipole-circular-path-work', 'phys-ch07-7.4-kp1-electric-dipole-far-field', 'phys-ch07-7.4-kp2-dipole-layer-solid-angle'], interactiveIds: [] },
    ],
  },
  {
    id: 'ch08',
    title: '稳恒磁场',
    type: 'section',
    status: 'done',
    summary: '磁感应强度、毕奥—萨伐尔定律、安培环路定理、洛伦兹力与霍尔效应。',
    children: [
      { id: '8.1', title: '磁场与磁感应强度', type: 'section', status: 'done', videoIds: ['phys-ch08-8.1-ex1-rectangular-surface-magnetic-flux', 'phys-ch08-8.1-kp2-magnetic-flux-gauss-theorem', 'phys-ch08-8.1-kp3-magnetic-field-right-hand-rule'], interactiveIds: [] },
      { id: '8.2', title: '电流的磁场与毕奥—萨伐尔定律', type: 'section', status: 'done', videoIds: ['phys-ch08-8.2-ex1-hydrogen-atom-magnetic-moment', 'phys-ch08-8.2-ex2-arc-straight-wire-combined-field', 'phys-ch08-8.2-kp2-biot-savart-law-derivation', 'phys-ch08-8.2-kp3-circular-loop-axial-field', 'phys-ch08-8.2-kp4-solenoid-interior-field'], interactiveIds: [] },
      { id: '8.3', title: '安培环路定理', type: 'section', status: 'done', videoIds: ['phys-ch08-8.3-ex1-coaxial-cable-b-distribution', 'phys-ch08-8.3-kp2-ampere-law-symmetric-applications', 'phys-ch08-8.3-kp3-ampere-law-vs-gauss-analogy'], interactiveIds: [] },
      { id: '8.4', title: '磁场对运动电荷与载流导线的作用', type: 'section', status: 'done', videoIds: ['phys-ch08-8.4-ex1-ampere-impulse-wire-jump', 'phys-ch08-8.4-ex2-lorentz-force-three-directions', 'phys-ch08-8.4-ex3-hall-effect-blood-velocity', 'phys-ch08-8.4-kp2-lorentz-force-circular-helical-motion', 'phys-ch08-8.4-kp3-ampere-force-current-loop-torque', 'phys-ch08-8.4-kp4-hall-effect-mechanism'], interactiveIds: [] },
    ],
  },
  {
    id: 'ch09',
    title: '电磁感应与电磁波',
    type: 'section',
    status: 'done',
    summary: '法拉第定律、动生与感生电动势、自感互感、麦克斯韦方程组。',
    children: [
      { id: '9.1', title: '法拉第电磁感应定律', type: 'section', status: 'done', videoIds: ['phys-ch09-9.1-kp1-faraday-induction-law', 'phys-ch09-9.1-kp2-lenz-law-direction', 'phys-ch09-9.1-ex1-rotating-coil-ac-emf', 'phys-ch09-9.1-ex2-rectangular-coil-moving-away-wire'], interactiveIds: [] },
      { id: '9.2', title: '动生电动势与感生电动势', type: 'section', status: 'done', videoIds: ['phys-ch09-9.2-kp1-motional-emf-lorentz', 'phys-ch09-9.2-ex2-ab-bar-sliding-motional-emf', 'phys-ch09-9.2-ex1-rotating-rod-emf-integration', 'phys-ch09-9.2-kp2-induced-electric-field-vortex'], interactiveIds: [] },
      { id: '9.3', title: '自感、互感与磁场能量', type: 'section', status: 'done', videoIds: ['phys-ch09-9.3-ex2-mutual-inductance-geometry-mean', 'phys-ch09-9.3-kp1-self-inductance-rl-transient', 'phys-ch09-9.3-ex1-toroidal-inductor-self-inductance', 'phys-ch09-9.3-kp2-magnetic-energy-density'], interactiveIds: [] },
      { id: '9.4', title: '麦克斯韦方程组与电磁波', type: 'section', status: 'done', videoIds: ['phys-ch09-9.4-kp1-displacement-current-maxwell', 'phys-ch09-9.4-kp2-electromagnetic-wave-propagation', 'phys-ch09-9.4-ex1-capacitor-displacement-current', 'phys-ch09-9.4-ex2-em-wave-transverse-properties'], interactiveIds: [] },
    ],
  },
  {
    id: 'ch10',
    title: '几何光学',
    type: 'section',
    status: 'done',
    summary: '球面折射、薄透镜成像、眼的光学、放大镜与显微镜。',
    children: [
      { id: '10.1', title: '几何光学基础与单球面折射', type: 'section', status: 'done', videoIds: ['phys-ch10-10.1-ex1-glass-ball-bubble-position', 'phys-ch10-10.1-ex2-glass-rod-two-surface-imaging', 'phys-ch10-10.1-kp1-spherical-surface-refraction', 'phys-ch10-10.1-kp2-sequential-imaging-coaxial'], interactiveIds: [] },
      { id: '10.2', title: '薄透镜成像与透镜组合', type: 'section', status: 'done', videoIds: ['phys-ch10-10.2-ex1-lens-group-sequential-imaging', 'phys-ch10-10.2-kp1-thin-lens-imaging-formula', 'phys-ch10-10.2-kp2-lens-in-medium-focal-length', 'phys-ch10-10.2-kp3-lens-combination-power'], interactiveIds: [] },
      { id: '10.3', title: '眼的光学结构与调节', type: 'section', status: 'done', videoIds: ['phys-ch10-10.3-ex1-myopia-glasses-diopter', 'phys-ch10-10.3-kp1-eye-accommodation-mechanism', 'phys-ch10-10.3-kp2-ametropia-correction'], interactiveIds: [] },
      { id: '10.4', title: '放大镜与显微镜', type: 'section', status: 'done', videoIds: ['phys-ch10-10.4-ex1-microscope-specimen-placement', 'phys-ch10-10.4-ex2-microscope-na-resolution-comparison', 'phys-ch10-10.4-kp1-magnifier-angular-magnification', 'phys-ch10-10.4-kp2-microscope-magnification-resolution'], interactiveIds: [] },
    ],
  },
  {
    id: 'ch11',
    title: '波动光学',
    type: 'section',
    status: 'done',
    summary: '光的干涉（双缝、薄膜、牛顿环）、衍射（单缝、光栅）、偏振。',
    children: [
      { id: '11.1', title: '光的相干性与干涉', type: 'section', status: 'done', videoIds: ['phys-ch11-11.1-ex1-thin-film-min-thickness', 'phys-ch11-11.1-ex2-newton-ring-wavelength', 'phys-ch11-11.1-kp2-young-double-slit-interference', 'phys-ch11-11.1-kp3-half-wave-loss', 'phys-ch11-11.1-kp4-thin-film-equal-thickness'], interactiveIds: [] },
      { id: '11.2', title: '光的衍射现象', type: 'section', status: 'done', videoIds: ['phys-ch11-11.2-ex1-grating-missing-order-slit-width', 'phys-ch11-11.2-kp2-single-slit-half-wave-zone', 'phys-ch11-11.2-kp3-optical-resolution-airy-disk', 'phys-ch11-11.2-kp4-grating-diffraction-missing-orders'], interactiveIds: [] },
      { id: '11.3', title: '光的偏振现象', type: 'section', status: 'done', videoIds: ['phys-ch11-11.3-ex1-three-polarizer-transmission', 'phys-ch11-11.3-kp2-polarization-types-natural-light', 'phys-ch11-11.3-kp3-malus-law-angle-sweep', 'phys-ch11-11.3-kp4-brewster-angle-polarization'], interactiveIds: [] },
    ],
  },
  {
    id: 'ch12',
    title: '量子力学初步',
    type: 'section',
    status: 'done',
    summary: '黑体辐射、光电效应、玻尔模型、物质波、薛定谔方程。',
    children: [
      { id: '12.1', title: '黑体辐射与能量量子化', type: 'section', status: 'done', videoIds: ['phys-ch12-12.1-ex1-compton-scatter-90deg', 'phys-ch12-12.1-kp2-planck-blackbody-spectrum', 'phys-ch12-12.1-kp3-photoelectric-effect-equation', 'phys-ch12-12.1-kp4-compton-scattering-geometry'], interactiveIds: [] },
      { id: '12.2', title: '氢原子光谱与原子模型', type: 'section', status: 'done', videoIds: ['phys-ch12-12.2-ex1-balmer-series-transition', 'phys-ch12-12.2-kp2-bohr-energy-levels-transitions', 'phys-ch12-12.2-kp3-bohr-orbit-quantization', 'phys-ch12-12.2-kp4-bohr-model-classical-crisis'], interactiveIds: [] },
      { id: '12.3', title: '微观粒子的波粒二象性', type: 'section', status: 'done', videoIds: ['phys-ch12-12.3-ex1-electron-vs-bullet-uncertainty', 'phys-ch12-12.3-kp2-de-broglie-wavelength-dependence', 'phys-ch12-12.3-kp3-single-slit-uncertainty-derivation', 'phys-ch12-12.3-kp4-matter-wave-standing-wave-bohr'], interactiveIds: [] },
      { id: '12.4', title: '波函数与统计解释', type: 'section', status: 'done', videoIds: ['phys-ch12-12.4-ex1-square-well-probability-integral', 'phys-ch12-12.4-kp2-wave-function-probability-density', 'phys-ch12-12.4-kp3-infinite-square-well-quantization', 'phys-ch12-12.4-kp4-tunnel-effect-barrier-penetration'], interactiveIds: [] },
    ],
  },
  {
    id: 'ch13',
    title: '原子核和放射性',
    type: 'section',
    status: 'done',
    summary: '原子核组成、结合能、放射性衰变类型与规律。',
    children: [
      { id: '13.1', title: '原子核的组成与基本性质', type: 'section', status: 'done', videoIds: ['phys-ch13-13.1-ex1-o16-alpha-decay-feasibility', 'phys-ch13-13.1-ex2-deuterium-helium-binding-energy', 'phys-ch13-13.1-kp2-nuclear-radius-scale', 'phys-ch13-13.1-kp3-binding-energy-curve', 'phys-ch13-13.1-kp4-nuclear-spin-nmr'], interactiveIds: [] },
      { id: '13.2', title: '天然放射性与衰变类型', type: 'section', status: 'done', videoIds: ['phys-ch13-13.2-ex1-fe59-effective-half-life', 'phys-ch13-13.2-ex2-carbon14-dating', 'phys-ch13-13.2-ex3-na24-blood-volume', 'phys-ch13-13.2-kp2-three-decay-types', 'phys-ch13-13.2-kp3-radioactive-decay-law', 'phys-ch13-13.2-kp4-half-life-mean-life-effective', 'phys-ch13-13.2-kp5-radioactive-activity'], interactiveIds: [] },
    ],
  },
  {
    id: 'ch14',
    title: 'X射线与激光',
    type: 'section',
    status: 'done',
    summary: 'X射线的产生与性质、激光的发光原理与特点。',
    children: [
      { id: '14.1', title: 'X 射线的产生与性质', type: 'section', status: 'done', videoIds: ['phys-ch14-14.1-ex1-short-wave-limit-voltage-sweep', 'phys-ch14-14.1-ex2-bragg-reflection-wavelength-selection', 'phys-ch14-14.1-ex3-muscle-bone-attenuation-voltage-contrast', 'phys-ch14-14.1-kp1-xray-tube-bremsstrahlung', 'phys-ch14-14.1-kp2-xray-spectrum-short-wave-limit', 'phys-ch14-14.1-kp3-xray-attenuation-lambert-law', 'phys-ch14-14.1-kp4-bragg-diffraction-crystal'], interactiveIds: [] },
      { id: '14.2', title: '激光的特点与发光原理', type: 'section', status: 'done', videoIds: ['phys-ch14-14.2-ex1-three-level-laser-pump-wavelength', 'phys-ch14-14.2-kp1-three-radiative-processes', 'phys-ch14-14.2-kp2-population-inversion', 'phys-ch14-14.2-kp3-optical-resonator-laser-output', 'phys-ch14-14.2-kp4-hene-three-level-laser-system'], interactiveIds: [] },
    ],
  },
];
