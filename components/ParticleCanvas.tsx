"use client";

import { useRef, useEffect, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { GRID_SIZE } from "@/lib/pixelUtils";

interface Particle {
  x: number; y: number;
  vx: number; vy: number; vz: number;
  life: number; maxLife: number;
  type: "birth" | "death";
}

function ParticleSystem({
  addedPixels, removedPixels, active,
}: { addedPixels: number[]; removedPixels: number[]; active: boolean }) {
  const pointsRef = useRef<THREE.Points>(null);
  const particlesRef = useRef<Particle[]>([]);

  useEffect(() => {
    if (!active) return;
    const next: Particle[] = [
      ...addedPixels.slice(0, 150).map((idx) => ({
        x: (idx % GRID_SIZE) / GRID_SIZE - 0.5,
        y: 0.5 - Math.floor(idx / GRID_SIZE) / GRID_SIZE,
        vx: (Math.random() - 0.5) * 0.015,
        vy: Math.random() * 0.02 + 0.005,
        vz: Math.random() * 0.03,
        life: 1, maxLife: 0.6 + Math.random() * 0.5, type: "birth" as const,
      })),
      ...removedPixels.slice(0, 150).map((idx) => ({
        x: (idx % GRID_SIZE) / GRID_SIZE - 0.5,
        y: 0.5 - Math.floor(idx / GRID_SIZE) / GRID_SIZE,
        vx: (Math.random() - 0.5) * 0.015,
        vy: -(Math.random() * 0.02 + 0.005),
        vz: Math.random() * 0.03,
        life: 1, maxLife: 0.6 + Math.random() * 0.5, type: "death" as const,
      })),
    ];
    particlesRef.current = [...particlesRef.current, ...next];
  }, [addedPixels, removedPixels, active]);

  const MAX = 400;
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
    geo.setAttribute("color",    new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
    geo.setAttribute("size",     new THREE.BufferAttribute(new Float32Array(MAX), 1));
    return geo;
  }, []);

  const material = useMemo(() => new THREE.PointsMaterial({
    size: 0.018, vertexColors: true, transparent: true,
    blending: THREE.NormalBlending, depthWrite: false, sizeAttenuation: true,
  }), []);

  useFrame((_, delta) => {
    if (!pointsRef.current || particlesRef.current.length === 0) return;
    particlesRef.current = particlesRef.current.filter((p) => p.life > 0);
    const pos = geometry.attributes.position.array as Float32Array;
    const col = geometry.attributes.color.array as Float32Array;
    const siz = geometry.attributes.size.array as Float32Array;

    for (let i = 0; i < Math.min(particlesRef.current.length, MAX); i++) {
      const p = particlesRef.current[i];
      p.life -= delta / p.maxLife;
      p.x += p.vx; p.y += p.vy;
      pos[i*3]=p.x; pos[i*3+1]=p.y; pos[i*3+2]=p.vz;
      const a = Math.max(0, p.life);
      // Birth: dark gray. Death: mid gray. (monochrome matching normies palette)
      const brightness = p.type === "birth" ? 0.28 * a : 0.55 * a;
      col[i*3]=brightness; col[i*3+1]=brightness; col[i*3+2]=brightness;
      siz[i] = a * 6;
    }
    for (let i = particlesRef.current.length; i < MAX; i++) siz[i] = 0;
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    geometry.attributes.size.needsUpdate = true;
  });

  return <points ref={pointsRef} geometry={geometry} material={material} />;
}

interface ParticleCanvasProps {
  addedPixels: number[]; removedPixels: number[];
  active: boolean; className?: string;
}

export default function ParticleCanvas({ addedPixels, removedPixels, active, className="" }: ParticleCanvasProps) {
  return (
    <div className={`absolute inset-0 pointer-events-none ${className}`}>
      <Canvas
        camera={{ position: [0, 0, 1.5], fov: 60 }}
        gl={{ alpha: true, antialias: false }}
        style={{ background: "transparent" }}
      >
        <ParticleSystem addedPixels={addedPixels} removedPixels={removedPixels} active={active} />
      </Canvas>
    </div>
  );
}
