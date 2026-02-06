import { Canvas, useFrame } from "@react-three/fiber";
import type React from "react";
import { useRef } from "react";
import * as THREE from "three";

interface HelixRingsProps {
  levelsUp?: number;
  levelsDown?: number;
  stepY?: number;
  rotationStep?: number;
}

const HelixRings: React.FC<HelixRingsProps> = ({
  levelsUp = 12,
  levelsDown = 12,
  stepY = 0.6,
  rotationStep = Math.PI / 10,
}) => {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.004;
    }
  });

  const elements = [];
  for (let i = -levelsDown; i <= levelsUp; i++) {
    elements.push({
      id: `helix-ring-${i}`,
      y: i * stepY,
      rotation: i * rotationStep,
    });
  }

  return (
    <group
      position={[3, 0, 0]}
      ref={groupRef}
      rotation={[0.3, 0, 0.1]}
    >
      {elements.map((el) => (
        <mesh
          key={el.id}
          position={[0, el.y, 0]}
          rotation={[Math.PI / 2, el.rotation, 0]}
        >
          <torusGeometry args={[3, 0.15, 16, 100]} />
          <meshStandardMaterial
            color="#45BFD3"
            metalness={0.3}
            roughness={0.4}
            emissive="#45BFD3"
            emissiveIntensity={0.1}
          />
        </mesh>
      ))}
    </group>
  );
};

const Scene: React.FC = () => {
  return (
    <Canvas
      camera={{
        fov: 45,
        position: [0, 0, 20],
        near: 0.1,
        far: 1000,
      }}
      gl={{ antialias: true }}
      style={{ background: "#ffffff" }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 5]} intensity={1.2} color="#ffffff" />
      <directionalLight position={[-5, -5, -5]} intensity={0.4} color="#45BFD3" />
      <HelixRings />
    </Canvas>
  );
};

interface HeroProps {
  title: string;
  description: string;
  onGetStarted?: () => void;
}

export const Hero: React.FC<HeroProps> = ({ title, description, onGetStarted }) => {
  return (
    <section className="relative h-screen w-full font-sans tracking-tight text-gray-900 bg-white overflow-hidden">
      {/* 3D Helix Background */}
      <div className="absolute inset-0 z-0">
        <Scene />
      </div>

      {/* Content */}
      <div className="absolute bottom-8 left-6 md:bottom-16 md:left-12 z-20 max-w-lg">
        <h1 className="text-4xl md:text-5xl font-light tracking-tight mb-4 text-gray-900">
          {title}
        </h1>
        <p className="text-gray-600 text-base md:text-lg leading-relaxed font-light tracking-tight mb-6">
          {description}
        </p>

        {onGetStarted && (
          <button
            onClick={onGetStarted}
            className="px-8 py-3 bg-[#45BFD3] hover:bg-[#3aa8ba] text-white font-medium rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl hover:-translate-y-0.5"
          >
            Get Started
          </button>
        )}
      </div>

      {/* Top blur gradient */}
      <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-white/80 to-transparent z-10" />

      {/* Bottom blur gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-white/90 to-transparent z-10" />
    </section>
  );
};

export default Hero;
