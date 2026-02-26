"use client";

import { useRef, useEffect, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { GRID_SIZE } from "@/lib/pixelUtils";

interface Particle {
  x: number; y: number;
  vx: number; vy: number; vz: number;
  life: number;      // 0..1, counts down
  maxLife: number;   // seconds
  type: "birth" | "death";
}

const MAX_PARTICLES = 500;

function ParticleSystem({
  addedPixels, removedPixels, active,
}: { addedPixels: number[]; removedPixels: number[]; active: boolean }) {
  const pointsRef = useRef<THREE.Points>(null);
  const particlesRef = useRef<Particle[]>([]);

  // Spawn particles when pixel sets change
  useEffect(() => {
    if (!active || (addedPixels.length === 0 && removedPixels.length === 0)) return;

    const toWorld = (idx: number) => ({
      x: (idx % GRID_SIZE) / GRID_SIZE - 0.5,
      y: 0.5 - Math.floor(idx / GRID_SIZE) / GRID_SIZE,
    });

    const newParticles: Particle[] = [
      ...addedPixels.slice(0, 200).map((idx) => {
        const { x, y } = toWorld(idx);
        return {
          x, y,
          vx: (Math.random() - 0.5) * 0.012,
          vy: Math.random() * 0.018 + 0.004,
          vz: (Math.random() - 0.5) * 0.008,
          life: 1,
          maxLife: 0.5 + Math.random() * 0.6,
          type: "birth" as const,
        };
      }),
      ...removedPixels.slice(0, 200).map((idx) => {
        const { x, y } = toWorld(idx);
        return {
          x, y,
          vx: (Math.random() - 0.5) * 0.012,
          vy: -(Math.random() * 0.018 + 0.004),
          vz: (Math.random() - 0.5) * 0.008,
          life: 1,
          maxLife: 0.5 + Math.random() * 0.6,
          type: "death" as const,
        };
      }),
    ];

    // Cap total particles
    particlesRef.current = [...particlesRef.current, ...newParticles].slice(-MAX_PARTICLES);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addedPixels, removedPixels, active]);

  // Pre-allocate geometry buffers
  const { geometry, material } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(MAX_PARTICLES * 3);
    const colors    = new Float32Array(MAX_PARTICLES * 3);
    const sizes     = new Float32Array(MAX_PARTICLES);

    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color",    new THREE.BufferAttribute(colors, 3));
    geo.setAttribute("size",     new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: `
        attribute float size;
        attribute vec3 color;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mvPos.z);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          // Circular point shape
          vec2 uv = gl_PointCoord - vec2(0.5);
          float d = dot(uv, uv);
          if (d > 0.25) discard;
          float alpha = (1.0 - d * 4.0) * vColor.r; // use R channel as combined alpha*brightness
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    return { geometry: geo, material: mat };
  }, []);

  useFrame((_, delta) => {
    if (!pointsRef.current) return;

    const alive: Particle[] = [];
    const pos = geometry.attributes.position.array as Float32Array;
    const col = geometry.attributes.color.array as Float32Array;
    const siz = geometry.attributes.size.array as Float32Array;

    let count = 0;
    for (const p of particlesRef.current) {
      p.life -= delta / p.maxLife;
      if (p.life <= 0) continue;

      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.97;
      p.vy *= 0.97;

      const a = Math.max(0, p.life);
      const i = count;

      pos[i * 3]     = p.x;
      pos[i * 3 + 1] = p.y;
      pos[i * 3 + 2] = p.vz;

      // Birth = darker gray (#48494b-ish), death = lighter gray
      const bright = p.type === "birth" ? 0.28 * a : 0.62 * a;
      col[i * 3]     = bright;
      col[i * 3 + 1] = bright;
      col[i * 3 + 2] = bright;

      siz[i] = a * 0.025;

      alive.push(p);
      count++;
      if (count >= MAX_PARTICLES) break;
    }

    // Zero out unused slots
    for (let i = count; i < MAX_PARTICLES; i++) {
      siz[i] = 0;
    }

    particlesRef.current = alive;

    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    geometry.attributes.size.needsUpdate = true;
    geometry.setDrawRange(0, count);
  });

  return (
    <points ref={pointsRef} geometry={geometry} material={material} />
  );
}

interface ParticleCanvasProps {
  addedPixels: number[];
  removedPixels: number[];
  active: boolean;
  className?: string;
}

export default function ParticleCanvas({
  addedPixels, removedPixels, active, className = "",
}: ParticleCanvasProps) {
  return (
    <div className={`absolute inset-0 pointer-events-none ${className}`}>
      <Canvas
        camera={{ position: [0, 0, 1.4], fov: 55 }}
        gl={{ alpha: true, antialias: false, premultipliedAlpha: false }}
        style={{ background: "transparent" }}
      >
        <ParticleSystem
          addedPixels={addedPixels}
          removedPixels={removedPixels}
          active={active}
        />
      </Canvas>
    </div>
  );
}
