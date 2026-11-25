import { IUniform, Material, Matrix4, MeshStandardMaterial } from 'three';

/** Shared by all patched materials; the scene updates the values every frame. */
export interface SceneUniforms {
  /** world space -> the space of the surroundings, where textures do not move */
  readonly uToLocal: IUniform<Matrix4>;
  /** 0 day, 1 night */
  readonly uNight: IUniform<number>;
  readonly uFacades: IUniform<number>;
  readonly uAsphalt: IUniform<number>;
}

export function sceneUniforms(): SceneUniforms {
  return {
    uToLocal: { value: new Matrix4() },
    uNight: { value: 0 },
    uFacades: { value: 1 },
    uAsphalt: { value: 1 },
  };
}

const HASH = `
float cdmHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float cdmNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(cdmHash(i), cdmHash(i + vec2(1, 0)), f.x),
             mix(cdmHash(i + vec2(0, 1)), cdmHash(i + vec2(1, 1)), f.x), f.y);
}`;

/**
 * Draws a material as if it were nearer to the camera, at the same place on
 * screen. Keeps roads above bumpy terrain without lifting them.
 */
export function towardsCamera<T extends Material>(material: T, metres: number): T {
  const before = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
       mvPosition.xyz *= 1.0 - min(0.5, ${metres.toFixed(2)} / max(0.1, length(mvPosition.xyz)));
       gl_Position = projectionMatrix * mvPosition;`,
    );
  };
  material.customProgramCacheKey = () => key + '-near-' + metres;
  return material;
}

function patch(
  material: Material,
  uniforms: SceneUniforms,
  key: string,
  declarations: string,
  color: string,
  emissive: string,
  gloss: string,
  vertex = '',
  vertexDeclarations = '',
): void {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nuniform mat4 uToLocal;\nvarying vec3 vLocal;\nvarying vec3 vLocalNormal;\n${vertexDeclarations}`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>\nvLocal = (uToLocal * modelMatrix * vec4(transformed, 1.0)).xyz;\nvLocalNormal = mat3(uToLocal * modelMatrix) * normal;\n${vertex}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec3 vLocal;\nvarying vec3 vLocalNormal;\n${HASH}\n${declarations}`,
      )
      .replace('#include <color_fragment>', `#include <color_fragment>\n${color}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${gloss}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${emissive}`);
  };
  material.customProgramCacheKey = () => key;
}

/**
 * Walls with windows, lit at night, and tinted roofs, computed from the
 * position alone: works for any building geometry without textures.
 */
export function facadeMaterial(
  uniforms: SceneUniforms,
  perBuilding: boolean,
): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ roughness: 0.85 });
  // Every tile that goes would free the shared program.
  if (perBuilding) material.dispose = () => undefined;
  patch(
    material,
    uniforms,
    'cdm-facade-' + perBuilding,
    `uniform float uNight; uniform float uFacades;
     ${perBuilding ? 'varying float vBuilding;' : ''}
     float cdmWindow = 0.0; vec2 cdmCell = vec2(0.0);`,
    `{
      vec3 n = normalize(vLocalNormal);
      float wall = 1.0 - smoothstep(0.2, 0.4, abs(n.y));
      ${
        perBuilding
          ? `float tone = cdmHash(vec2(vBuilding, 3.0));
             float hue = cdmHash(vec2(vBuilding, 5.0));
             vec3 tint = hue < 0.3 ? vec3(0.72, 0.64, 0.5) : hue < 0.5 ? vec3(0.66, 0.56, 0.4)
               : hue < 0.65 ? vec3(0.62, 0.5, 0.44) : hue < 0.8 ? vec3(0.55, 0.57, 0.56) : vec3(0.74, 0.71, 0.65);
             vec3 wallColor = tint * (0.82 + 0.25 * tone);
             vec3 roofColor = mix(vec3(0.3, 0.12, 0.075), vec3(0.17, 0.165, 0.17), step(0.65, cdmHash(vec2(vBuilding, 8.0))))
               * (0.85 + 0.3 * tone);
             diffuseColor.rgb = mix(roofColor, wallColor, wall);`
          : ''
      }
      vec2 t = normalize(vec2(-n.z, n.x) + vec2(1e-5));
      vec2 cell = vec2(dot(vLocal.xz, t) / 2.8, vLocal.y / 3.1);
      vec2 f = fract(cell);
      vec2 width = fwidth(cell);
      float window = step(0.28, f.x) * step(f.x, 0.72) * step(0.26, f.y) * step(f.y, 0.76);
      window *= wall * uFacades * (1.0 - smoothstep(0.2, 0.5, max(width.x, width.y)));
      // Frame around the glass, with a bar in the middle and a sill below.
      float frame = step(0.24, f.x) * step(f.x, 0.76) * step(0.2, f.y) * step(f.y, 0.8);
      float bar = 1.0 - step(0.015, abs(f.x - 0.5));
      float near = wall * uFacades * (1.0 - smoothstep(0.06, 0.16, max(width.x, width.y)));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8, 0.79, 0.76), frame * near);
      cdmWindow = window * (1.0 - bar * near); cdmCell = floor(cell);
      vec3 glass = mix(vec3(0.05, 0.07, 0.09), vec3(0.4, 0.38, 0.34), step(0.8, cdmHash(cdmCell + 4.0)) * step(0.5, f.y));
      diffuseColor.rgb = mix(diffuseColor.rgb, glass, cdmWindow * 0.9);
      // Rows of tiles on the roof.
      float row = vLocal.y * 6.0;
      float tiles = (1.0 - wall) * step(0.02, 1.0 - abs(n.y)) * (1.0 - smoothstep(0.2, 0.6, fwidth(row)));
      diffuseColor.rgb *= 1.0 - 0.28 * tiles * smoothstep(0.6, 1.0, fract(row));
      float dirt = cdmNoise(vLocal.xz * 0.35 + vLocal.y * 0.35);
      diffuseColor.rgb *= 0.88 + 0.2 * dirt;
    }`,
    `totalEmissiveRadiance += cdmWindow * uNight * step(0.6, cdmHash(cdmCell)) * vec3(0.95, 0.68, 0.36) * 0.8;`,
    `roughnessFactor = mix(roughnessFactor, 0.12, cdmWindow);`,
    perBuilding ? 'vBuilding = _batchid;' : '',
    perBuilding ? 'attribute float _batchid;\nvarying float vBuilding;' : '',
  );
  return material;
}

/** Roads with the grain and wear of asphalt. */
export function asphaltMaterial(uniforms: SceneUniforms): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ roughness: 0.92 });
  patch(
    material,
    uniforms,
    'cdm-asphalt',
    'uniform float uAsphalt;',
    `{
      float fine = cdmNoise(vLocal.xz * 22.0) * (1.0 - smoothstep(0.2, 1.0, fwidth(vLocal.x * 22.0)));
      float wear = cdmNoise(vLocal.xz * 0.45) * 0.6 + cdmNoise(vLocal.xz * 2.1) * 0.4;
      diffuseColor.rgb *= mix(1.0, 0.8 + 0.22 * fine + 0.24 * wear, uAsphalt);
    }`,
    '',
    '',
  );
  return material;
}
