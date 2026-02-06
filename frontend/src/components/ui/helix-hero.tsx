import { Canvas, useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { KernelSize } from "postprocessing";
import type React from "react";
import { useMemo, useRef } from "react";
import * as THREE from "three";

interface HelixRingsProps {
  levelsUp?: number;
  levelsDown?: number;
  stepY?: number;
  rotationStep?: number;
}

const HelixRings: React.FC<HelixRingsProps> = ({
  levelsUp = 10,
  levelsDown = 10,
  stepY = 0.85,
  rotationStep = Math.PI / 16,
}) => {
  const groupRef = useRef<THREE.Group>(new THREE.Group());

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.005;
    }
  });

  const ringGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    const radius = 0.35;
    shape.absarc(0, 0, radius, 0, Math.PI * 2, false);

    const depth = 10;
    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.05,
      bevelSegments: 4,
      curveSegments: 64,
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geometry.translate(0, 0, -depth / 2);

    return geometry;
  }, []);

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
      scale={1}
      position={[5, 0, 0]}
      ref={groupRef}
      rotation={[0, 0, 0]}
    >
      {elements.map((el) => (
        <mesh
          key={el.id}
          geometry={ringGeometry}
          position={[0, el.y, 0]}
          rotation={[0, Math.PI / 2 + el.rotation, 0]}
          castShadow
        >
          <meshPhysicalMaterial
            color="#45BFD3"
            metalness={0.7}
            roughness={0.5}
            clearcoat={0}
            clearcoatRoughness={0.15}
            reflectivity={0}
            iridescence={0.96}
            iridescenceIOR={1.5}
            iridescenceThicknessRange={[100, 400]}
          />
        </mesh>
      ))}
    </group>
  );
};

const Scene: React.FC = () => {
  return (
    <Canvas
      className="h-full w-full"
      orthographic
      shadows
      camera={{
        zoom: 70,
        position: [0, 0, 7],
        near: 0.1,
        far: 1000,
      }}
      gl={{ antialias: true }}
      style={{ background: "#ffffff" }}
    >
      <hemisphereLight
        color={"#cfe8ff"}
        groundColor={"#ffffff"}
        intensity={2}
      />

      <directionalLight
        position={[10, 10, 5]}
        intensity={2}
        castShadow
        color={"#ffeedd"}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />

      <HelixRings />

      <EffectComposer multisampling={8}>
        <Bloom
          kernelSize={3}
          luminanceThreshold={0}
          luminanceSmoothing={0.4}
          intensity={0.6}
        />
        <Bloom
          kernelSize={KernelSize.HUGE}
          luminanceThreshold={0}
          luminanceSmoothing={0}
          intensity={0.5}
        />
      </EffectComposer>
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
