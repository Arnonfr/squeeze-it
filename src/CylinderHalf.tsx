import { useFrame } from '@react-three/fiber';
import { MutableRefObject, useMemo, useRef } from 'react';
import * as THREE from 'three';

interface Props {
  texture: THREE.Texture;
  side: 'front' | 'back';
  scaleX: MutableRefObject<number>;
  rotationY: MutableRefObject<number>;
}

export function CylinderHalf({ texture, side, scaleX, rotationY }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const frontPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, -1), 0), []);
  useFrame(() => {
    if (!groupRef.current) return;
    groupRef.current.scale.set(scaleX.current, 1, 1);
    groupRef.current.rotation.y = rotationY.current;
  });

  return (
    <group rotation={[0, 0, THREE.MathUtils.degToRad(-6)]} position={[0, -0.1, 0]}>
      <group ref={groupRef}>
        <mesh>
          <cylinderGeometry args={[5.05, 5.05, 1.15, 128, 1, true]} />
          <meshBasicMaterial map={texture} transparent alphaTest={0.04} depthWrite={false}
            side={THREE.DoubleSide} clippingPlanes={side === 'front' ? [frontPlane] : []} />
        </mesh>
      </group>
    </group>
  );
}
