import React, { useState, useEffect, useMemo, useRef, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  Text,
  Billboard,
  Environment,
  useGLTF,
  useCursor,
  RoundedBox,
} from "@react-three/drei";
import { collection, query, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import styled from "styled-components";
import * as THREE from "three";

const moveTowards = (current, target, step) => {
  if (Math.abs(target - current) < step) return target;
  return current + Math.sign(target - current) * step;
};

const AnimatedFlow = ({ rollRef, truckStartPos, onReset, onRollLanded, cycle, finalX }) => {
  const stopperGroupRef = useRef();
  const [phase, setPhase] = useState(0);

  // Calculate targets for 4 cycles (filling pallets 1, 2, 3, 4 sequentially)
  const targets = useMemo(() => [
    { s1: 64.9, s2: 63.3, col: PALETTE[13] }, // Pallet 1 (Truck side)
    { s1: 63.3, s2: 61.7, col: PALETTE[12] }, // Pallet 2
    { s1: 61.7, s2: 60.1, col: PALETTE[11] }, // Pallet 3
    { s1: 60.1, s2: 58.5, col: PALETTE[10] }  // Pallet 4
  ], []);

  const { s1: stopper1Z, s2: stopper2Z, col: activeColor } = targets[cycle % 4];
  const triggerZ = (stopper1Z + stopper2Z) / 2;

  // Use the calculated color for the material
  const animatedRollMat = useMemo(() => new THREE.MeshStandardMaterial({ color: activeColor, roughness: 0.6 }), [activeColor]);

  const [waiting, setWaiting] = useState(false);

  useFrame((state, delta) => {
    if (!rollRef.current || !stopperGroupRef.current) return;

    const rollSpeed = 2.0 * delta;
    const slideSpeed = 1.0 * delta;
    const fallSpeed = 4.0 * delta;

    if (phase === 0) {
      // 1. TRAVEL
      if (!waiting) {
        rollRef.current.position.z -= rollSpeed;
        if (rollRef.current.position.z <= triggerZ) {
          // Snap to exact stopping position to prevent drift during pause
          rollRef.current.position.z = triggerZ;
          setWaiting(true);
          setTimeout(() => {
            setPhase(1);
            setWaiting(false);
          }, 1000); // 1-second static pause
        }
      }
    }
    else if (phase === 1) {
      // 2. SLIDE
      rollRef.current.position.x -= slideSpeed;
      stopperGroupRef.current.position.x -= slideSpeed;

      if (rollRef.current.position.x <= finalX) {
        setPhase(2);
      }
    }
    else if (phase === 2) {
      // 3. FALL
      if (rollRef.current.position.y > 1.25) {
        rollRef.current.position.y -= fallSpeed;
      } else {
        if (!rollRef.current.resetting) {
          rollRef.current.resetting = true;
          if (cycle === 0 && onRollLanded) onRollLanded();
          setTimeout(() => {
            setPhase(3);
            rollRef.current.resetting = false;
          }, 800);
        }
      }
    }
    else if (phase === 3) {
      // 4. RESET: Slide back at same speed
      stopperGroupRef.current.position.x += slideSpeed;

      if (stopperGroupRef.current.position.x >= -14) {
        stopperGroupRef.current.position.x = -14;
        rollRef.current.position.set(...truckStartPos);
        rollRef.current.position.y = truckStartPos[1];
        setPhase(0);
        onReset(); // Advances to next pallet cycle
      }
    }
  });

  if (cycle >= 4) return null;

  return (
    <>
      <group ref={rollRef} position={truckStartPos}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow geometry={rollGeom} material={animatedRollMat} />
        <mesh rotation={[Math.PI / 2, 0, 0]} geometry={tubeGeom} material={tubeMat} />
      </group>

      <group ref={stopperGroupRef} position={[-14, 2.0, 0]}>
        <mesh position={[0, 0, stopper1Z]}>
          <boxGeometry args={[1.2, 0.2, 0.05]} />
          <meshStandardMaterial color="#eab308" emissive="#713f12" />
        </mesh>
        <mesh position={[0, 0, stopper2Z]}>
          <boxGeometry args={[1.2, 0.2, 0.05]} />
          <meshStandardMaterial color="#eab308" emissive="#713f12" />
        </mesh>
      </group>
    </>
  );
};

/* ───── 1. OPTIMIZED GEOMETRY & MATERIALS ───── */
const rollGeom = new THREE.CylinderGeometry(0.16, 0.16, 1.25, 12);
const tubeGeom = new THREE.CylinderGeometry(0.05, 0.05, 1.27, 8);
const rollMat = new THREE.MeshStandardMaterial({ color: "#64748b", roughness: 0.6 });
const tubeMat = new THREE.MeshStandardMaterial({ color: "#cbd5e1" });

const SPECS = {
  rackHeight: 5.2,
  rackDepth: 1.5,
  bayWidth: 2.8,
  levels: [0.6, 2.2, 3.8],
  postColor: "#001f3f",   // Dark Blue Uprights
  beamColor: "#c2410c",   // Orange Beams
};

/* ───── 2. POSITION HELPERS ───── */
const getStandardPositions = (x, z) => [[x - 3.5, 0, z + 3], [x + 3.5, 0, z + 3], [x - 3.5, 0, z - 3], [x + 3.5, 0, z - 3]];
const getRTIPositions = (x, z) => [
  [x - 3.5, 0, z + 12], [x + 3.5, 0, z + 12], [x - 3.5, 0, z + 6], [x + 3.5, 0, z + 6],
  [x - 3.5, 0, z], [x + 3.5, 0, z], [x - 3.5, 0, z - 6], [x + 3.5, 0, z - 6], [x - 3.5, 0, z - 12], [x + 3.5, 0, z - 12]
];
const getWidePositions = (x, z) => [
  [x - 10.5, 0, z + 3], [x - 3.5, 0, z + 3], [x + 3.5, 0, z + 3], [x + 10.5, 0, z + 3],
  [x - 10.5, 0, z - 3], [x - 3.5, 0, z - 3], [x + 3.5, 0, z - 3], [x + 10.5, 0, z - 3]
];
const getInterliningPositions = (x, z) => [
  [x - 10.5, 0, z + 3], [x - 3.5, 0, z + 3], [x + 3.5, 0, z + 3],
  [x - 10.5, 0, z - 3], [x - 3.5, 0, z - 3], [x + 3.5, 0, z - 3], [x + 10.5, 0, z - 3]
];

const ZONE_LAYOUT = {
  RTI: { positions: getRTIPositions(-30, 35) },
  F1: { positions: getStandardPositions(-30, 5) },
  F3: { positions: getStandardPositions(-30, -10) },
  F5: { positions: getStandardPositions(-30, -25) },
  F7: { positions: getStandardPositions(-30, -40) },
  Q: { positions: getStandardPositions(-10, 25) },
  F2: { positions: getStandardPositions(-10, 5) },
  F4: { positions: getStandardPositions(-10, -10) },
  F6: { positions: getStandardPositions(-10, -25) },
  F8: { positions: getStandardPositions(-10, -40) },
  INT: { positions: getInterliningPositions(25, 25) },
  F9: { positions: getWidePositions(25, 5) },
  F10: { positions: getWidePositions(25, -10) },
  F11: { positions: getWidePositions(25, -25) },
  F12: { positions: getWidePositions(25, -40) },
};

const PALETTE = [
  "#1a1a1a", "#0f172a", "#334155", "#475569", "#2c2c2c", "#1e293b", "#52525b", "#3f3f46",
  "#171717", "#1e1b4b", "#262626", "#404040", "#1e3a8a", "#1e40af", "#111827", "#1f2937",
  "#282c34", "#21252b", "#2d3436", "#353b48", "#1c1c1c", "#101010", "#0a0a0a", "#121212",
  "#2f3640", "#353b48", "#192a56", "#273c75", "#2d3436", "#636e72", "#2d3e50", "#1a252f",
  "#222f3e", "#2c3e50", "#2c2c54", "#40407a", "#2f3542", "#57606f", "#2f3640", "#333333",
  "#3d3d3d", "#23272e", "#0e1111", "#232b2b", "#353839", "#3b444b", "#242124", "#1b1d1e",
  "#212121", "#333333", "#343434", "#3b3b3b", "#3d3d3b", "#414a4c", "#434b4d", "#464544",
  "#4d4d4d", "#536872", "#536878", "#555555", "#5a5a5a", "#5e5e5e", "#626262", "#666362",
  "#2c3e50", "#34495e", "#2c2c2c", "#3d3d3d", "#2c2c54", "#30336b", "#130f40", "#1e272e",
  "#485460", "#2d3436", "#34495e", "#2c3e50", "#2d3436", "#1e272e", "#000000", "#121212"
];

const FloatingLabel = ({ text, position = [0, 3, 0] }) => {
  const groupRef = useRef();
  const innerRef = useRef();

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.getElapsedTime();
    groupRef.current.position.y = position[1] + Math.sin(t * 1.5) * 0.1;
    if (innerRef.current) {
      innerRef.current.position.y = THREE.MathUtils.lerp(innerRef.current.position.y, 0, 0.45);
      innerRef.current.scale.lerp(new THREE.Vector3(1, 1, 1), 0.55);
    }
  });

  if (!text || typeof text !== "string") return null;
  const width = text.length * 0.4 + 1.2;

  return (
    <Billboard position={[position[0], position[1], position[2]]}>
      <group ref={groupRef} raycast={() => null}>
        <group ref={innerRef} scale={[0, 0, 0]} position={[0, -0.6, 0]}>

          {/* Unified Solid Amber Background */}
          <RoundedBox args={[width, 1.0, 0.05]} radius={0.15} smoothness={4}>
            <meshStandardMaterial color="#fbbf24" depthTest={false} />
          </RoundedBox>

          {/* High-Contrast Black Text */}
          <Text
            fontSize={0.7}
            color="#000000"
            anchorX="center"
            anchorY="middle"
            position={[0, 0, 0.06]}
            depthTest={false}
            renderOrder={100}
            fontWeight="900"
          >
            {text.toUpperCase()}
          </Text>
        </group>
      </group>
    </Billboard>
  );
};

/* ───── 3. FABRIC ROLL PALLET (Precision 3x3) ───── */
const FabricRollPallet = ({ position, rotation = [0, 0, 0], rollColor = "#64748b" }) => {
  const rolls = useMemo(() => {
    const arr = [];
    const mat = new THREE.MeshStandardMaterial({ color: rollColor, roughness: 0.6 });
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        arr.push(
          <group key={`${r}-${c}`} position={[(c * 0.42) - 0.42, (r * 0.35) + 0.25, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <mesh castShadow geometry={rollGeom} material={mat} />
            <mesh geometry={tubeGeom} material={tubeMat} />
          </group>
        );
      }
    }
    return arr;
  }, [rollColor]);

  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0.05, 0]} receiveShadow>
        <boxGeometry args={[1.5, 0.1, 1.4]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
      {[0.73, -0.73].map((x, i) => (
        <mesh key={i} position={[x, 0.6, 0]}>
          <boxGeometry args={[0.04, 1.2, 1.4]} />
          <meshStandardMaterial color="#334155" wireframe />
        </mesh>
      ))}
      {rolls}
    </group>
  );
};

/* ───── 4. TWIN DOUBLE RACK (Restructured structure) ───── */
const DoubleRack = ({ position, label, rollColor, emptySlots = [], onHover }) => {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const twinDepth = 2.8;

  const handlePointerOver = (e) => {
    e.stopPropagation();
    setHovered(true);
    if (onHover) onHover(label);
  };

  const handlePointerOut = () => {
    setHovered(false);
    if (onHover) onHover(null);
  };

  return (
    <group position={position} onPointerOver={handlePointerOver} onPointerOut={handlePointerOut}>
      {/* 6 Upright Posts (Twin structure) */}
      {[-SPECS.bayWidth, 0, SPECS.bayWidth].map((x, i) => (
        <group key={i} position={[x, SPECS.rackHeight / 2, 0]}>
          <mesh position={[0, 0, twinDepth / 2]} castShadow>
            <boxGeometry args={[0.15, SPECS.rackHeight, 0.15]} />
            <meshStandardMaterial color={SPECS.postColor} />
          </mesh>
          <mesh position={[0, 0, -twinDepth / 2]} castShadow>
            <boxGeometry args={[0.15, SPECS.rackHeight, 0.15]} />
            <meshStandardMaterial color={SPECS.postColor} />
          </mesh>
          {/* Internal cross bracing for Twin Rack */}
          {[1, 2.5, 4].map((y) => (
            <mesh key={y} position={[0, y - SPECS.rackHeight / 2, 0]}>
              <boxGeometry args={[0.1, 0.05, twinDepth]} />
              <meshStandardMaterial color={SPECS.postColor} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Levels with Beams and 4 Pallets (2 Front, 2 Back) */}
      {SPECS.levels.map((y, idx) => (
        <group key={idx} position={[0, y, 0]}>
          {/* Front and Back Orange Beams */}
          {[twinDepth / 2 - 0.1, -(twinDepth / 2 - 0.1)].map((z, j) => (
            <mesh key={j} position={[0, -0.7, z]}>
              <boxGeometry args={[SPECS.bayWidth * 2.1, 0.2, 0.1]} />
              <meshStandardMaterial color={SPECS.beamColor} />
            </mesh>
          ))}
          {/* 4 Pallets per level (can skip one if it's the target slot) */}
          {idx === 0 && Array.isArray(emptySlots) && emptySlots.includes(0) ? null : <FabricRollPallet position={[-SPECS.bayWidth / 2, -0.6, 0.65]} rollColor={rollColor} />}
          {idx === 0 && Array.isArray(emptySlots) && emptySlots.includes(1) ? null : <FabricRollPallet position={[SPECS.bayWidth / 2, -0.6, 0.65]} rollColor={rollColor} />}
          {idx === 0 && Array.isArray(emptySlots) && emptySlots.includes(2) ? null : <FabricRollPallet position={[-SPECS.bayWidth / 2, -0.6, -0.65]} rollColor={rollColor} />}
          {idx === 0 && Array.isArray(emptySlots) && emptySlots.includes(3) ? null : <FabricRollPallet position={[SPECS.bayWidth / 2, -0.6, -0.65]} rollColor={rollColor} />}
          {idx > 0 && (
            <>
              <FabricRollPallet position={[-SPECS.bayWidth / 2, -0.6, 0.65]} rollColor={rollColor} />
              <FabricRollPallet position={[SPECS.bayWidth / 2, -0.6, 0.65]} rollColor={rollColor} />
              <FabricRollPallet position={[-SPECS.bayWidth / 2, -0.6, -0.65]} rollColor={rollColor} />
              <FabricRollPallet position={[SPECS.bayWidth / 2, -0.6, -0.65]} rollColor={rollColor} />
            </>
          )}
        </group>
      ))}

      {label && hovered && <FloatingLabel text={label} position={[0, SPECS.rackHeight + 2.5, 0]} />}
    </group>
  );
};

/* ───── 5. HYBRID CONVEYOR ───── */
const HybridConveyor = ({ position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1], count = 4, skipStoppers = [], onHover }) => {
  const [hovered, setHovered] = useState(false);
  const palletLength = 1.6;
  const longPartLength = 18;
  const beltY = 1.9;
  return (
    <group
      position={position}
      rotation={rotation}
      scale={scale}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); onHover && onHover("Conveyor"); }}
      onPointerOut={() => { setHovered(false); onHover && onHover(null); }}
    >
      {hovered && <FloatingLabel text="CONVEYOR" position={[9, 6, 0]} />}
      <group position={[longPartLength / 2 + (count * palletLength), 0, 0]}>
        <mesh position={[0, beltY, 0]} receiveShadow>
          <boxGeometry args={[longPartLength, 0.12, 1.3]} />
          <meshStandardMaterial color="#111827" metalness={0.9} />
        </mesh>
        {/* End stopper (Truck side entrance) */}
        <mesh position={[longPartLength / 2, beltY + 0.1, 0]}>
          <boxGeometry args={[0.05, 0.2, 1.2]} />
          <meshStandardMaterial color="#eab308" emissive="#713f12" />
        </mesh>
        {[-0.68, 0.68].map((z, j) => (
          <mesh key={j} position={[0, beltY + 0.08, z]}>
            <boxGeometry args={[longPartLength, 0.15, 0.05]} />
            <meshStandardMaterial color="#94a3b8" metalness={1} />
          </mesh>
        ))}
      </group>

      {/* Visual background for segments */}
      <mesh position={[(count * palletLength) / 2, beltY - 0.05, 0]} receiveShadow>
        <boxGeometry args={[count * palletLength, 0.12, 1.3]} />
        <meshStandardMaterial color="#111827" />
      </mesh>

      {/* Start stopper (Far end entrance) */}
      {!skipStoppers.includes(-1) && (
        <mesh position={[0, beltY + 0.1, 0]}>
          <boxGeometry args={[0.05, 0.2, 1.2]} />
          <meshStandardMaterial color="#eab308" emissive="#713f12" />
        </mesh>
      )}

      {Array.from({ length: count }).map((_, i) => (
        <group key={i} position={[i * palletLength, 0, 0]}>
          {/* Stoppers at the end of each segment */}
          {!skipStoppers.includes(i) && (
            <mesh position={[palletLength, beltY + 0.1, 0]}>
              <boxGeometry args={[0.05, 0.2, 1.2]} />
              <meshStandardMaterial color="#eab308" emissive="#713f12" />
            </mesh>
          )}
          {/* Legs */}
          <mesh position={[palletLength / 2, beltY / 2, 0]}>
            <boxGeometry args={[0.1, beltY, 1.1]} />
            <meshStandardMaterial color="#475569" />
          </mesh>
        </group>
      ))}
    </group>
  );
};

/* ───── 6. REALISTIC MAROON TRUCK ───── */
const Truck = ({ position, rotation = [0, 0, 0], onHover }) => {
  const [hovered, setHovered] = useState(false);

  // Materials for high realism
  const maroonPaint = (
    <meshStandardMaterial
      color="#4a0404"
      metalness={0.1}
      roughness={0.9}
    />
  );
  const tireMat = <meshStandardMaterial color="#111111" roughness={0.9} />;
  const glassMat = <meshPhysicalMaterial color="#0f172a" metalness={1} roughness={0.1} opacity={0.6} transparent />;

  return (
    <group
      position={position}
      rotation={rotation}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); onHover && onHover("Truck"); }}
      onPointerOut={() => { setHovered(false); onHover && onHover(null); }}
    >
      {hovered && <FloatingLabel text="TRUCK" position={[0, 5.5, 0]} />}

      {/* 1. The Trailer (Long Box) */}
      <mesh position={[0, 2.5, -2]} castShadow>
        <boxGeometry args={[4, 4.2, 14]} />
        {maroonPaint}
      </mesh>

      {/* 2. The Cab (Front Part) */}
      <mesh position={[0, 1.9, 7.2]} castShadow>
        <boxGeometry args={[3.6, 3.8, 4.4]} />
        {maroonPaint}
      </mesh>

      {/* 3. The Windshield */}
      <mesh position={[0, 2.8, 9.42]}>
        <boxGeometry args={[3.2, 1.8, 0.05]} />
        {glassMat}
      </mesh>

      {/* 4. Side Windows */}
      {[1.81, -1.81].map((x, i) => (
        <mesh key={i} position={[x, 2.8, 7.8]}>
          <boxGeometry args={[0.02, 1.6, 2.2]} />
          {glassMat}
        </mesh>
      ))}

      {/* 5. Wheels (8 Total) */}
      {[
        [1.8, 8.2], [-1.8, 8.2],   // Front Cab Wheels
        [1.8, -5.5], [-1.8, -5.5], // Rear Trailer Wheels Axle 1
        [1.8, -7.5], [-1.8, -7.5], // Rear Trailer Wheels Axle 2
        [1.8, 3.5], [-1.8, 3.5]    // Mid Chassis Wheels
      ].map((pos, i) => (
        <mesh key={i} position={[pos[0], 0.6, pos[1]]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.6, 0.6, 0.5, 32]} />
          {tireMat}
        </mesh>
      ))}

      {/* 6. Chassis Bed */}
      <mesh position={[0, 0.8, -0.5]}>
        <boxGeometry args={[3.0, 0.4, 18]} />
        <meshStandardMaterial color="#111827" metalness={0.8} />
      </mesh>
    </group>
  );
};

/* ───── 7. INSPECTION MACHINE ───── */
const InspectionMachine = ({ position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1], name = "Inspection Machine", onHover }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <group position={position} rotation={rotation}>
      <group
        scale={scale}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
        onPointerOut={() => { setHovered(false); }}
      >
        <mesh position={[-1.4, 1, 0]}><boxGeometry args={[0.3, 2, 2.2]} /><meshStandardMaterial color="#1d4ed8" metalness={0.5} /></mesh>
        <mesh position={[1.4, 1, 0]}><boxGeometry args={[0.3, 2, 2.2]} /><meshStandardMaterial color="#1d4ed8" metalness={0.5} /></mesh>
        <group position={[0, 1.5, 0.2]} rotation={[-Math.PI / 6, 0, 0]}>
          <mesh><boxGeometry args={[2.5, 1.6, 0.1]} /><meshStandardMaterial color="#334155" /></mesh>
          <mesh position={[0, 0, 0.06]}><boxGeometry args={[2.3, 1.4, 0.02]} /><meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.8} /></mesh>
        </group>
        {[0.4, 2.4].map((y, i) => (
          <mesh key={i} position={[0, y, 0.8]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.08, 0.08, 2.6, 16]} /><meshStandardMaterial color="#cbd5e1" metalness={0.8} /></mesh>
        ))}
        <mesh position={[0, 0.05, 0]}><boxGeometry args={[3.2, 0.1, 2.4]} /><meshStandardMaterial color="#1e293b" /></mesh>
      </group>
      {hovered && <FloatingLabel text={name} position={[0, 2.5 * (Array.isArray(scale) ? scale[1] : scale), 0]} />}
    </group>
  );
};

/* ───── 8. INDUSTRIAL WORK TABLE ───── */
const IndustrialWorkTable = ({ position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1], name = "Work Table", onHover }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <group position={position} rotation={rotation}>
      <group
        scale={scale}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
        onPointerOut={() => { setHovered(false); }}
      >
        <mesh position={[0, 0.9, 0]}><boxGeometry args={[3, 0.15, 1.5]} /><meshStandardMaterial color="#b45309" /></mesh>
        {[[-1.4, -0.6], [1.4, -0.6], [-1.4, 0.6], [1.4, 0.6]].map((pos, i) => (
          <mesh key={i} position={[pos[0], 0.45, pos[1]]}><boxGeometry args={[0.12, 0.9, 0.12]} /><meshStandardMaterial color="#334155" /></mesh>
        ))}
        <mesh position={[0, 0.25, 0]}><boxGeometry args={[2.7, 0.05, 1.3]} /><meshStandardMaterial color="#475569" /></mesh>
      </group>
      {hovered && <FloatingLabel text={name} position={[0, 1.1 * (Array.isArray(scale) ? scale[1] : scale), 0]} />}
    </group>
  );
};

/* ───── 10. TASK-DRIVEN AGV ───── */
const PickingAGV = React.forwardRef(({ startPos, palletPos, targetPos, onPick, onDrop, trigger, rollColor, pivot180 = false, movementType = "orthogonal", name = "AGV", palletRotation = -Math.PI / 2 }, ref) => {
  const localRef = useRef();
  const agvRef = ref || localRef;
  const [phase, setPhase] = useState(-1); // -1: Waiting for trigger
  const [hasPallet, setHasPallet] = useState(false);

  useFrame((state, delta) => {
    if (!agvRef.current) return;

    if (phase === -2) return; // Completely stopped after its round

    if (phase === -1) {
      if (trigger) setPhase(0);
      return;
    }

    const pos = agvRef.current.position;
    const rot = agvRef.current.rotation;

    // Movement speeds for consistent feel
    const moveStep = 3.2 * delta; // Slower travel (was 5.0)
    const rotStep = 1.5 * delta; // Slower rotation (was 2.5)

    switch (phase) {
      case 0: // 1. Move to Target Z in Aisle
        pos.z = moveTowards(pos.z, palletPos[2], moveStep);
        pos.x = moveTowards(pos.x, startPos[0], moveStep);
        rot.y = moveTowards(rot.y, 0, rotStep);
        if (Math.abs(pos.z - palletPos[2]) < 0.01 && Math.abs(pos.x - startPos[0]) < 0.01) setPhase(1);
        break;

      case 1: // 2. Turn 90 and Pick
        const currentAisleX = startPos[0];
        const pickDir = currentAisleX < palletPos[0] ? 1 : -1;
        const pickAngle = pickDir * Math.PI / 2;
        rot.y = moveTowards(rot.y, pickAngle, rotStep);
        if (Math.abs(rot.y - pickAngle) < 0.01) {
          const pickStopX = palletPos[0] - (pickDir * 2.5);
          pos.x = moveTowards(pos.x, pickStopX, moveStep);
          if (Math.abs(pos.x - pickStopX) < 0.01) {
            setPhase(2); // Start waiting/latching phase
          }
        }
        break;

      case 2: // 2. Wait/Latch Pallet (No Lift)
        if (!agvRef.current.waitTimer) agvRef.current.waitTimer = 0;
        agvRef.current.waitTimer += delta;
        if (agvRef.current.waitTimer > 0.5) {
          agvRef.current.waitTimer = 0;
          setHasPallet(true);
          onPick();
          setPhase(3);
        }
        break;

      case 3: // 3. Continue forward (No Reverse) for Inspection AGV
        if (movementType === "inspection") {
          const currentAisleX3 = startPos[0];
          const pickDir3 = currentAisleX3 < palletPos[0] ? 1 : -1;
          const detourX = palletPos[0] + (pickDir3 * 6); // Move further out by 6 units to clear machine
          pos.x = moveTowards(pos.x, detourX, moveStep);
          if (Math.abs(pos.x - detourX) < 0.01) setPhase(4);
        } else {
          pos.x = moveTowards(pos.x, startPos[0], moveStep);
          if (Math.abs(pos.x - startPos[0]) < 0.01) setPhase(4);
        }
        break;

      case 4: // 4. Pivot after pick-up
        let targetAisleRot;
        if (movementType === "inspection") {
          targetAisleRot = -Math.PI; // Short-way 90-degree turn
        } else {
          // Flip orientation if pivot180 is true so man faces the racks
          targetAisleRot = pivot180 ? Math.PI : 0;
        }

        // Shortest-path rotation
        let diff4 = (targetAisleRot - rot.y) % (Math.PI * 2);
        if (diff4 > Math.PI) diff4 -= Math.PI * 2;
        if (diff4 < -Math.PI) diff4 += Math.PI * 2;
        const rotAmt4 = Math.sign(diff4) * Math.min(rotStep, Math.abs(diff4));
        rot.y += rotAmt4;

        if (Math.abs(diff4) < 0.01) {
          rot.y = targetAisleRot;
          setPhase(5);
        }
        break;

      case 5: // 5. Drive to Rack Row
        pos.z = moveTowards(pos.z, targetPos[2], moveStep);
        if (Math.abs(pos.z - targetPos[2]) < 0.01) setPhase(6);
        break;

      case 6: // 6. Turn 90 to face Rack
        const rackDir_6 = pos.x < targetPos[0] ? 1 : -1;
        let dropAngle;
        if (movementType === "inspection") {
          dropAngle = -Math.PI * 1.5;
        } else {
          dropAngle = pivot180 ? (Math.PI - (rackDir_6 * Math.PI / 2)) : (rackDir_6 * Math.PI / 2);
        }
        rot.y = moveTowards(rot.y, dropAngle, rotStep);
        if (Math.abs(rot.y - dropAngle) < 0.01) setPhase(7);
        break;

      case 7: { // 7. Drive into Rack Position
        let chassisStop;
        const palletPivotOffset = 2.5;
        if (movementType === "inspection") {
          chassisStop = 13.1 - palletPivotOffset;
        } else {
          const mouthDir_7 = startPos[0] < targetPos[0] ? 1 : -1;
          chassisStop = targetPos[0] - (mouthDir_7 * palletPivotOffset);
        }
        pos.x = moveTowards(pos.x, chassisStop, moveStep);
        if (Math.abs(pos.x - chassisStop) < 0.01) {
          setPhase(75); // Start waiting/unlatching phase
        }
        break;
      }

      case 75: { // 75. Wait/Drop Pallet (No Lift)
        if (!agvRef.current.dropTimer) agvRef.current.dropTimer = 0;
        agvRef.current.dropTimer += delta;
        if (agvRef.current.dropTimer > 0.5) {
          agvRef.current.dropTimer = 0;
          setHasPallet(false);
          if (onDrop) onDrop();
          setPhase(76); // Go to post-drop pause
        }
        break;
      }

      case 76: { // 76. Pause after drop-off (empty fork)
        if (!agvRef.current.pauseTimer) agvRef.current.pauseTimer = 0;
        agvRef.current.pauseTimer += delta;
        if (agvRef.current.pauseTimer >= 0.5) {
          agvRef.current.pauseTimer = 0;
          setPhase(8);
        }
        break;
      }

      case 8: // 8. Reverse sequence
        const reverseTarget = movementType === "inspection" ? 2 : startPos[0];
        pos.x = moveTowards(pos.x, reverseTarget, moveStep);
        if (Math.abs(pos.x - reverseTarget) < 0.01) {
          if (movementType === "inspection") setPhase(60);
          else setPhase(9);
        }
        break;

      case 60: // 60. Turn towards Conveyor (Face +Z, short way)
        const faceConveyorRot = -Math.PI * 2;
        rot.y = moveTowards(rot.y, faceConveyorRot, rotStep);
        if (Math.abs(rot.y - faceConveyorRot) < 0.01) setPhase(61);
        break;

      case 61: // 61. Drive 3 units towards Conveyor
        const driveTargetZ = targetPos[2] + 8;
        pos.z = moveTowards(pos.z, driveTargetZ, moveStep);
        if (Math.abs(pos.z - driveTargetZ) < 0.01) setPhase(62);
        break;

      case 62: // 62. Turn to face "RTI" racks at the end (-X direction)
        const faceRTIRot = -Math.PI * 2.5;
        rot.y = moveTowards(rot.y, faceRTIRot, rotStep);
        if (Math.abs(rot.y - faceRTIRot) < 0.01) setPhase(63);
        break;

      case 63: // 63. Move 19.5 units in that direction
        const lateralTargetX = 2 - 21;
        pos.x = moveTowards(pos.x, lateralTargetX, moveStep);
        if (Math.abs(pos.x - lateralTargetX) < 0.01) setPhase(70);
        break;

      case 70: // 70. Turn to face QR1 Row (-Z direction, easy 90 deg)
        const faceQR1Z = -Math.PI * 3;
        rot.y = moveTowards(rot.y, faceQR1Z, rotStep);
        if (Math.abs(rot.y - faceQR1Z) < 0.01) setPhase(71);
        break;

      case 71: // 71. Move 3 units straight (31.65 -> 28.65)
        const approachZ = targetPos[2];
        pos.z = moveTowards(pos.z, approachZ, moveStep);
        if (Math.abs(pos.z - approachZ) < 0.01) setPhase(72);
        break;

      case 72: // 72. Turn again towards QR1 (+X direction, easy 90 deg)
        const faceQR1X = -Math.PI * 3.5;
        rot.y = moveTowards(rot.y, faceQR1X, rotStep);
        if (Math.abs(rot.y - faceQR1X) < 0.01) setPhase(73);
        break;

      case 73: // 73. Take the blue-roll pallet
        const qStopX_73 = -14.9 - 2.8;
        pos.x = moveTowards(pos.x, qStopX_73, moveStep);
        if (Math.abs(pos.x - qStopX_73) < 0.01) {
          setHasPallet(true);
          if (onPick) onPick("Q-FETCH");
          setPhase(74);
        }
        break;

      case 74: // 74. Reverse movement (Go further back into aisle)
        const safeX = -21.0;
        pos.x = moveTowards(pos.x, safeX, moveStep);
        if (Math.abs(pos.x - safeX) < 0.01) setPhase(82); // Shifted numbering to match logic
        break;

      case 82: // 82. Turn towards conveyor (+Z direction)
        const faceConvRot = -Math.PI * 4;
        let diff82 = (faceConvRot - rot.y) % (Math.PI * 2);
        if (diff82 > Math.PI) diff82 -= Math.PI * 2;
        if (diff82 < -Math.PI) diff82 += Math.PI * 2;
        const rotAmt82 = Math.sign(diff82) * Math.min(rotStep, Math.abs(diff82));
        rot.y += rotAmt82;
        if (Math.abs(diff82) < 0.01) {
          rot.y = faceConvRot;
          setPhase(83);
        }
        break;

      case 83: // 83. Move 5 units front (28.65 -> 33.65)
        const returnZ = 28.65 + 5;
        pos.z = moveTowards(pos.z, returnZ, moveStep);
        if (Math.abs(pos.z - returnZ) < 0.01) setPhase(27);
        break;

      case 27: // Drive to row
        pos.z = moveTowards(pos.z, 45, moveStep);
        if (Math.abs(pos.z - 45) < 0.01) setPhase(28);
        break;

      case 28: // Face machine
        const faceMachineRot = Math.PI / 2;
        let diff28 = (faceMachineRot - rot.y) % (Math.PI * 2);
        if (diff28 > Math.PI) diff28 -= Math.PI * 2;
        if (diff28 < -Math.PI) diff28 += Math.PI * 2;
        const rotAmt28 = Math.sign(diff28) * Math.min(rotStep, Math.abs(diff28));
        rot.y += rotAmt28;
        if (Math.abs(diff28) < 0.01) {
          rot.y = faceMachineRot;
          setPhase(29);
        }
        break;

      case 29: // Approach machine
        const machineTargetX = 8 - 1.4;
        pos.x = moveTowards(pos.x, machineTargetX, moveStep);
        if (Math.abs(pos.x - machineTargetX) < 0.01) {
          setPhase(80);
        }
        break;

      case 80: // Drop
        setHasPallet(false);
        if (onDrop) onDrop("RETURNED");
        setPhase(81);
        break;

      case 81: // Finish back-off
        const backOffX = 2.0;
        pos.x = moveTowards(pos.x, backOffX, moveStep);
        if (Math.abs(pos.x - backOffX) < 0.01) setPhase(-2);
        break;

      case 9: // 9. Turn back to facing Home
        const targetRot9 = 0;
        let diff9 = (targetRot9 - rot.y) % (Math.PI * 2);
        if (diff9 > Math.PI) diff9 -= Math.PI * 2;
        if (diff9 < -Math.PI) diff9 += Math.PI * 2;
        const rotAmt9 = Math.sign(diff9) * Math.min(rotStep, Math.abs(diff9));
        rot.y += rotAmt9;
        if (Math.abs(diff9) < 0.01) {
          rot.y = targetRot9;
          setPhase(10);
        }
        break;

      case 10: // 10. Return Home
        pos.z = moveTowards(pos.z, startPos[2], moveStep);
        pos.x = moveTowards(pos.x, startPos[0], moveStep);
        if (Math.abs(pos.z - startPos[2]) < 0.01 && Math.abs(pos.x - startPos[0]) < 0.01) {
          rot.y = 0;
          setPhase(-2); // -2: Final Stop
        }
        break;
    }
  });

  const [hovered, setHovered] = useState(false);

  return (
    <group
      ref={agvRef}
      position={startPos}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => { setHovered(false); }}
    >
      <group scale={[2, 2, 2]}>
        <AccurateAGV position={[0, 0, 0]} rotation={[0, 0, 0]} />
        {hasPallet && (
          <group position={[0, 0, 1.4]} rotation={[0, palletRotation, 0]} scale={[0.5, 0.5, 0.5]}>
            <FabricRollPallet rollColor={rollColor} />
          </group>
        )}
      </group>
      {hovered && <FloatingLabel text={name} position={[0, 4.5, 0]} />}
    </group>
  );
});

/* ───── 11. CAMERA TRACKING DIRECTOR (Cinematic Follow) ───── */
/* ───── 11. CAMERA TRACKING DIRECTOR (Cinematic Follow) ───── */
const CameraDirector = ({ rollRef, agv1Ref, agv2Ref, agvTrigger, palletDropped, returnedToInspection }) => {
  const { camera } = useThree();
  const targetV = useMemo(() => new THREE.Vector3(), []);
  const tempV = useMemo(() => new THREE.Vector3(), []);
  const currentOffset = useMemo(() => new THREE.Vector3(35, 35, 35), []);
  const [isFinished, setIsFinished] = useState(false);
  const [isDead, setIsDead] = useState(false);
  const zoomCompleteRef = useRef(false);

  useEffect(() => {
    if (returnedToInspection) {
      const timer = setTimeout(() => setIsFinished(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [returnedToInspection]);

  useFrame((state, delta) => {
    const camera = state.camera;
    const controls = state.controls;

    // LOCKED STATE: If zoom finished, release control to user forever
    if (zoomCompleteRef.current) {
      if (controls) controls.update();
      return;
    }

    let targetWorldPos = new THREE.Vector3();
    let hasTarget = false;

    // Determine Phase and Targets
    if (!agvTrigger) {
      if (rollRef.current) {
        rollRef.current.getWorldPosition(targetWorldPos);
        currentOffset.set(28, 18, 28);
        hasTarget = true;
      }
    } else if (!palletDropped) {
      if (agv1Ref.current) {
        agv1Ref.current.getWorldPosition(targetWorldPos);
        currentOffset.set(18, 12, 18);
        hasTarget = true;
      }
    } else if (!returnedToInspection) {
      if (agv2Ref.current) {
        agv2Ref.current.getWorldPosition(targetWorldPos);
        currentOffset.set(22, 25, 22);
        hasTarget = true;
      }
    } else {
      // PHASE 4: Simulation Complete - Zoom Out
      targetWorldPos.set(10, 0, 40); // Center of Inspection/Rack area
      currentOffset.set(40, 60, 40); // High Zoom Out
      hasTarget = true;
    }

    if (hasTarget && controls) {
      // 1. Smoothly move Controls Target (LookAt)
      if (!returnedToInspection || controls.target.distanceTo(targetWorldPos) > 0.1) {
        targetV.lerp(targetWorldPos, 0.05);
        controls.target.lerp(targetV, 0.1);
      }

      // 2. Move Camera Position
      if (!controls.active) {
        const desiredPos = targetV.clone().add(currentOffset);

        // If finished, check if we reached zoom-out, then lock it
        if (returnedToInspection) {
          if (camera.position.distanceTo(desiredPos) < 1.0) {
            zoomCompleteRef.current = true; // Stop automation forever
          } else {
            camera.position.lerp(desiredPos, 0.04);
          }
        } else {
          // Standard tracking
          camera.position.lerp(desiredPos, 0.04);
        }
      }

      controls.update();
    }
  });

  return null;
};
/* ───── 10. ACCURATE AGV ───── */
const AccurateAGV = ({ position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1] }) => {
  const primaryColor = "#d97706"; // Darker Industrial Orange
  const secondaryColor = "#111827"; // Deep Black (Charcoal)
  const maroonMat = "#800000";
  const greyMat = secondaryColor; // Chassis is now Black
  const darkGreyMat = primaryColor; // Accents are now Yellow

  return (
    <group position={position} rotation={rotation} scale={scale}>
      {/* 1. LOWER CHASSIS */}
      <mesh position={[0, 0.15, 0]} castShadow>
        <boxGeometry args={[0.9, 0.3, 1.2]} />
        <meshStandardMaterial color={greyMat} metalness={0.6} />
      </mesh>

      {/* 2. FIXED FORKS (Animated) */}
      <group position={[0, 0, 0.6]}>
        {[0.25, -0.25].map((x, i) => (
          <mesh key={i} position={[x, 0.05, 0.65]} castShadow>
            <boxGeometry args={[0.2, 0.04, 1.3]} />
            <meshStandardMaterial color={darkGreyMat} />
          </mesh>
        ))}
      </group>

      {/* 2. MAIN UPRIGHT BODY (The Box in front of the man) */}
      <mesh position={[0, 0.8, 0.1]} castShadow>
        <boxGeometry args={[0.9, 1.1, 0.6]} />
        <meshStandardMaterial color={greyMat} metalness={0.5} />
      </mesh>

      {/* 3. VERTICAL PROTECTIVE FRAME (The Goalpost/Cage) */}
      <group position={[0, 1.8, 0.4]}>
        {/* Side Pillars */}
        <mesh position={[0.42, 0, 0]}><boxGeometry args={[0.06, 1.0, 0.06]} /><meshStandardMaterial color={darkGreyMat} /></mesh>
        <mesh position={[-0.42, 0, 0]}><boxGeometry args={[0.06, 1.0, 0.06]} /><meshStandardMaterial color={darkGreyMat} /></mesh>
        {/* Top Crossbar */}
        <mesh position={[0, 0.5, 0]}><boxGeometry args={[0.9, 0.06, 0.06]} /><meshStandardMaterial color={darkGreyMat} /></mesh>
      </group>

      {/* 4. STEERING HANDLE */}
      <mesh position={[0, 1.35, 0.35]} rotation={[0.4, 0, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.4]} />
        <meshStandardMaterial color="#000000" />
      </mesh>
      <mesh position={[0, 1.55, 0.45]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.08, 0.02, 8, 16]} />
        <meshStandardMaterial color="#000000" />
      </mesh>

      {/* 5. THE MAN (MAROON DRESS) */}
      <group position={[0, 0.3, -0.45]}>
        {/* Legs */}
        <mesh position={[0, 0.375, 0]}>
          <boxGeometry args={[0.35, 0.75, 0.25]} />
          <meshStandardMaterial color={maroonMat} />
        </mesh>
        {/* Torso */}
        <mesh position={[0, 1.025, 0]}>
          <boxGeometry args={[0.4, 0.55, 0.3]} />
          <meshStandardMaterial color={maroonMat} />
        </mesh>
        {/* Arms reaching for Steering */}
        <mesh position={[0.22, 1.1, 0.25]} rotation={[-Math.PI / 3, 0, 0.1]}>
          <capsuleGeometry args={[0.06, 0.45, 4, 8]} />
          <meshStandardMaterial color={maroonMat} />
        </mesh>
        <mesh position={[-0.22, 1.1, 0.25]} rotation={[-Math.PI / 3, 0, -0.1]}>
          <capsuleGeometry args={[0.06, 0.45, 4, 8]} />
          <meshStandardMaterial color={maroonMat} />
        </mesh>
        {/* Head */}
        <mesh position={[0, 1.45, 0]}>
          <sphereGeometry args={[0.13, 16, 16]} />
          <meshStandardMaterial color="#ffdbac" />
        </mesh>
        {/* Hair */}
        <mesh position={[0, 1.52, -0.02]} scale={[1, 0.5, 1]}>
          <sphereGeometry args={[0.135, 16, 16]} />
          <meshStandardMaterial color="#4b2c20" />
        </mesh>
      </group>
    </group>
  );
};

/* ───── 11. QR WORKSTATION ───── */
const QRWorkstation = ({ rollRef, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1], onHover }) => {
  const maroonMat = "#800000";
  const tableTopMat = "#475569";
  const frameMat = "#1e293b";

  const leftArmRef = useRef();
  const rightArmRef = useRef();
  const stickerRef = useRef();
  const operatorGroupRef = useRef();

  useFrame((state) => {
    if (!rollRef || !rollRef.current || !leftArmRef.current || !rightArmRef.current || !operatorGroupRef.current) return;

    const rollZ = rollRef.current.position.z;
    const t = state.clock.getElapsedTime();

    // 1. REACH FOR PRINTER (Z > 84) - Facing Table
    if (rollZ > 84) {
      operatorGroupRef.current.rotation.y = THREE.MathUtils.lerp(operatorGroupRef.current.rotation.y, Math.PI, 0.1);
      const reach = Math.sin(t * 4) * 0.3 + 1.2; // Fast grabbing motion
      leftArmRef.current.rotation.x = reach;
      rightArmRef.current.rotation.x = reach;
      if (stickerRef.current) stickerRef.current.visible = false;
    }
    // 2. OBTAIN STICKER (80 < Z <= 84) - Still facing table, now has sticker
    else if (rollZ > 80) {
      operatorGroupRef.current.rotation.y = THREE.MathUtils.lerp(operatorGroupRef.current.rotation.y, Math.PI, 0.1);
      leftArmRef.current.rotation.x = 1.0;
      rightArmRef.current.rotation.x = 1.0;
      if (stickerRef.current) {
        stickerRef.current.visible = true;
      }
    }
    // 3. TURN TO CONVEYOR (74 < Z <= 80) - Rotating while holding sticker
    else if (rollZ > 74) {
      operatorGroupRef.current.rotation.y = THREE.MathUtils.lerp(operatorGroupRef.current.rotation.y, 0, 0.1);
      leftArmRef.current.rotation.x = 0.8;
      rightArmRef.current.rotation.x = 0.8;
      if (stickerRef.current) {
        stickerRef.current.visible = true;
      }
    }
    // 4. PASTE ON ROLL (68 < Z <= 74) - Reaching out specifically to paste
    else if (rollZ > 68) {
      operatorGroupRef.current.rotation.y = 0; // Lock face to conveyor
      const reach = 2.2;
      leftArmRef.current.rotation.x = THREE.MathUtils.lerp(leftArmRef.current.rotation.x, reach, 0.2);
      rightArmRef.current.rotation.x = THREE.MathUtils.lerp(rightArmRef.current.rotation.x, reach, 0.2);
      if (stickerRef.current) {
        stickerRef.current.visible = true;
      }
    }
    // 5. TURN BACK TO TABLE (Z <= 68)
    else {
      operatorGroupRef.current.rotation.y = THREE.MathUtils.lerp(operatorGroupRef.current.rotation.y, Math.PI, 0.1);
      leftArmRef.current.rotation.x = THREE.MathUtils.lerp(leftArmRef.current.rotation.x, 1.1, 0.1);
      rightArmRef.current.rotation.x = THREE.MathUtils.lerp(rightArmRef.current.rotation.x, 1.1, 0.1);
      if (stickerRef.current) stickerRef.current.visible = false;
    }
  });

  const [hovered, setHovered] = useState(false);

  return (
    <group position={position} rotation={rotation}>
      <group
        scale={scale}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
        onPointerOut={() => { setHovered(false); }}
      >
        <group scale={[0.8, 0.8, 0.8]}>
          <group position={[0, 0, 0]}>
            <mesh position={[0, 0.8, 0]} receiveShadow>
              <boxGeometry args={[2.5, 0.1, 1.5]} />
              <meshStandardMaterial color={tableTopMat} roughness={0.8} />
            </mesh>
            {[[-1.1, -0.6], [1.1, -0.6], [-1.1, 0.6], [1.1, 0.6]].map((pos, i) => (
              <mesh key={i} position={[pos[0], 0.4, pos[1]]}>
                <boxGeometry args={[0.1, 0.8, 0.1]} />
                <meshStandardMaterial color={frameMat} />
              </mesh>
            ))}
            <mesh position={[0, 0.24, 0]}><boxGeometry args={[2.2, 0.05, 1.2]} wireframe /><meshStandardMaterial color={frameMat} /></mesh>
          </group>

          <group position={[0, 0.85, 0]}>
            <mesh position={[0, 0.15, 0]} castShadow>
              <boxGeometry args={[1.0, 0.3, 0.8]} />
              <meshStandardMaterial color="#334155" metalness={0.5} />
            </mesh>
            <group position={[0, 0.3, 0]}>
              <mesh position={[0, 0.2, 0]} castShadow>
                <boxGeometry args={[0.6, 0.4, 0.5]} />
                <meshStandardMaterial color="#0f172a" />
              </mesh>
              <mesh position={[0, 0.1, 0.3]} rotation={[0.5, 0, 0]}>
                <planeGeometry args={[0.3, 0.2]} />
                <meshStandardMaterial color="white" side={2} />
              </mesh>
            </group>
          </group>
        </group>

        <group ref={operatorGroupRef} position={[0.2, 0, 0.85]} rotation={[0, Math.PI, 0]}>
          <mesh position={[0, 0.375, 0]}>
            <boxGeometry args={[0.35, 0.75, 0.25]} />
            <meshStandardMaterial color={maroonMat} />
          </mesh>
          <mesh position={[0, 1.025, 0]}>
            <boxGeometry args={[0.4, 0.55, 0.3]} />
            <meshStandardMaterial color={maroonMat} />
          </mesh>

          {/* Arms with Refs */}
          <mesh ref={leftArmRef} position={[-0.2, 1.1, 0.15]} rotation={[Math.PI / 2.5, 0, 0.1]}>
            <capsuleGeometry args={[0.06, 0.45, 4, 8]} />
            <meshStandardMaterial color={maroonMat} />
            {/* Sticker handle */}
            <mesh ref={stickerRef} position={[0, -0.25, 0]} visible={false}>
              <planeGeometry args={[0.15, 0.1]} />
              <meshStandardMaterial color="white" side={THREE.DoubleSide} emissive="white" emissiveIntensity={0.5} />
            </mesh>
          </mesh>
          <mesh ref={rightArmRef} position={[0.2, 1.1, 0.15]} rotation={[Math.PI / 2.5, 0, -0.1]}>
            <capsuleGeometry args={[0.06, 0.45, 4, 8]} />
            <meshStandardMaterial color={maroonMat} />
          </mesh>

          <mesh position={[0, 1.45, 0]}>
            <sphereGeometry args={[0.13, 16, 16]} />
            <meshStandardMaterial color="#ffdbac" />
          </mesh>
          <mesh position={[0, 1.52, -0.02]} scale={[1, 0.5, 1]}>
            <sphereGeometry args={[0.135, 16, 16]} />
            <meshStandardMaterial color="#4b2c20" />
          </mesh>
        </group>
      </group>
      {hovered && <FloatingLabel text="QR STICKER STATION" position={[0, 4.5 * (Array.isArray(scale) ? scale[1] : scale), 0]} />}
    </group>
  );
};

/* ───── 13. STANDING OPERATOR ───── */
const StandingOperator = ({ position, rotation = [0, 0, 0] }) => (
  <group position={position} rotation={rotation}>
    <group scale={[2, 2, 2]}>
      {/* Legs (Maroon Pants) */}
      <mesh position={[0, 0.375, 0]}>
        <boxGeometry args={[0.35, 0.75, 0.25]} />
        <meshStandardMaterial color="#800000" />
      </mesh>
      {/* Torso (Maroon Shirt) */}
      <mesh position={[0, 1.025, 0]}>
        <boxGeometry args={[0.4, 0.55, 0.3]} />
        <meshStandardMaterial color="#800000" />
      </mesh>
      {/* Head */}
      <mesh position={[0, 1.45, 0]}>
        <sphereGeometry args={[0.13, 16, 16]} />
        <meshStandardMaterial color="#ffdbac" />
      </mesh>
      {/* Hair */}
      <mesh position={[0, 1.52, -0.02]} scale={[1, 0.5, 1]}>
        <sphereGeometry args={[0.135, 16, 16]} />
        <meshStandardMaterial color="#4b2c20" />
      </mesh>
      {/* Arms (Adjusted to reach table/machine: Reaching Forward) */}
      <mesh position={[0.22, 1.1, 0.25]} rotation={[-Math.PI / 3, 0, 0.1]}>
        <boxGeometry args={[0.1, 0.55, 0.1]} />
        <meshStandardMaterial color="#800000" />
      </mesh>
      <mesh position={[-0.22, 1.1, 0.25]} rotation={[-Math.PI / 3, 0, -0.1]}>
        <boxGeometry args={[0.1, 0.55, 0.1]} />
        <meshStandardMaterial color="#800000" />
      </mesh>
    </group>
  </group>
);

/* ───── 14. QR SCANNER STATION ───── */
const QRScannerStation = ({ position, rotation = [0, 0, 0], scale = [1, 1, 1] }) => {
  const tableMat = "#966F33"; // Wood
  const scannerBodyMat = "#ffffff";
  const screenMat = "#000000";

  return (
    <group position={position} rotation={rotation} scale={scale}>
      {/* Table Top (Matched to QRWorkstation) */}
      <mesh position={[0, 1.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.5, 0.1, 1.5]} />
        <meshStandardMaterial color={tableMat} roughness={0.6} metalness={0.1} />
      </mesh>

      {/* Legs (Matched to QRWorkstation) */}
      <mesh position={[1.1, 0.75, 0.6]} castShadow>
        <boxGeometry args={[0.1, 1.5, 0.1]} />
        <meshStandardMaterial color={tableMat} roughness={0.6} metalness={0.1} />
      </mesh>
      <mesh position={[-1.1, 0.75, 0.6]} castShadow>
        <boxGeometry args={[0.1, 1.5, 0.1]} />
        <meshStandardMaterial color={tableMat} roughness={0.6} metalness={0.1} />
      </mesh>
      <mesh position={[1.1, 0.75, -0.6]} castShadow>
        <boxGeometry args={[0.1, 1.5, 0.1]} />
        <meshStandardMaterial color={tableMat} roughness={0.6} metalness={0.1} />
      </mesh>
      <mesh position={[-1.1, 0.75, -0.6]} castShadow>
        <boxGeometry args={[0.1, 1.5, 0.1]} />
        <meshStandardMaterial color={tableMat} roughness={0.6} metalness={0.1} />
      </mesh>

      {/* SCANNER GROUP (Placed on Table) */}
      <group position={[0, 1.55, 0]} scale={[0.5, 0.5, 0.5]}>
        <mesh position={[0, 0.5, 0]} castShadow>
          <boxGeometry args={[0.8, 1, 0.8]} />
          <meshPhysicalMaterial color={scannerBodyMat} roughness={0.2} clearcoat={1.0} />
        </mesh>

        {/* Screen */}
        <mesh position={[0, 0.7, 0.41]} rotation={[-0.2, 0, 0]}>
          <planeGeometry args={[0.6, 0.5]} />
          <meshStandardMaterial color={screenMat} emissive="#111111" roughness={0.1} />
        </mesh>

        {/* Slot/Light */}
        <mesh position={[0, 0.3, 0.4]}>
          <boxGeometry args={[0.5, 0.1, 0.1]} />
          <meshBasicMaterial color="#00ffff" />
        </mesh>
      </group>
    </group>
  );
};

/* ───── 15. FABRIC SQUARE (For Tables) ───── */
const FabricSquare = ({ position, color }) => (
  <mesh position={position} castShadow>
    <boxGeometry args={[0.8, 0.1, 0.8]} />
    <meshStandardMaterial color={color} roughness={0.8} />
  </mesh>
);

/* ───── 12. MAIN WAREHOUSE LAYOUT ───── */
const Wrapper = styled.div`width: 100%; height: 85vh; background: #f8fafc; border-radius: 12px; overflow: hidden; border: 1px solid #cbd5e1; position: relative;`;
export default function WarehouseLayout() {
  const [racks, setRacks] = useState([]);
  const [cycle, setCycle] = useState(0);
  const [palletPicked, setPalletPicked] = useState(false);
  const [palletDropped, setPalletDropped] = useState(false);
  const [palletPicked2, setPalletPicked2] = useState(false);
  const [palletDropped2, setPalletDropped2] = useState(false);
  const [pickedFromQ, setPickedFromQ] = useState(false);
  const [returnedToInspection, setReturnedToInspection] = useState(false);
  const [agvTrigger, setAgvTrigger] = useState(false);
  const [agvTrigger2, setAgvTrigger2] = useState(false);
  const rollRef = useRef();
  const agv1Ref = useRef();
  const agv2Ref = useRef();
  const [hoveredItem, setHoveredItem] = useState(null);

  useEffect(() => {
    const q = query(collection(db, "locations"));
    const unsub = onSnapshot(q, () => {
      const final = [];
      Object.entries(ZONE_LAYOUT).forEach(([zone, cfg]) => {
        cfg.positions.forEach((pos, i) => {
          final.push({ id: `${zone}-R${i + 1}`, position: pos });
        });
      });
      setRacks(final);
    });
    return unsub;
  }, []);



  return (
    <Wrapper>
      <Canvas shadows camera={{ position: [55, 55, 55], fov: 45 }}>
        <Suspense fallback={null}>
          <CameraDirector
            rollRef={rollRef}
            agv1Ref={agv1Ref}
            agv2Ref={agv2Ref}
            agvTrigger={agvTrigger}
            palletDropped={palletDropped}
            returnedToInspection={returnedToInspection}
          />
          <ambientLight intensity={0.8} />
          <directionalLight position={[40, 60, 20]} intensity={1.5} />
          <Environment preset="warehouse" />
          <OrbitControls makeDefault dampingFactor={0.1} enableDamping maxPolarAngle={Math.PI / 2.1} />

          {/* Floor */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 10]}>
            <planeGeometry args={[180, 180]} />
            <meshStandardMaterial color="#e2e8f0" opacity={0.6} transparent />
          </mesh>

          {/* 1. ANIMATION LAYER */}
          <AnimatedFlow
            rollRef={rollRef}
            cycle={cycle}
            onReset={() => setCycle((prev) => (prev < 3 ? prev + 1 : 4))}
            onRollLanded={() => setAgvTrigger(true)}
            truckStartPos={[-14, 2.15, 85]}
            finalX={-15.5}
          />
          {/* TWIN RACKS (Replacing old single racks) */}
          {racks.map((r, idx) => (
            <DoubleRack
              key={r.id}
              position={r.position}
              label={r.id}
              rollColor={r.id.startsWith("Q") ? PALETTE[13] : PALETTE[idx % PALETTE.length]}
              emptySlots={
                r.id === "INT-R1" ? [0] :
                  r.id === "Q-R1" ? [0] : []
              }
            />
          ))}

          {/* Inspection Machines */}
          <InspectionMachine position={[17, 0, 52]} rotation={[-Math.PI / 2, Math.PI, Math.PI / 2]} scale={[2, 2, 2]} name="Inspection Machine 1" />
          <InspectionMachine position={[10, 0, 51.5]} rotation={[-Math.PI / 2, Math.PI, -Math.PI / 2]} scale={[2, 2, 2]} name="Inspection Machine 2" />
          <FabricRollPallet position={[22, 0, 45]} rollColor={PALETTE[5]} rotation={[0, 0, 0]} />
          {!palletPicked2 && <FabricRollPallet position={[8, 0, 45]} rollColor={PALETTE[8]} rotation={[0, 0, 0]} />}

          {/* Shrinkage Tables */}
          <IndustrialWorkTable position={[40, 0, 52]} rotation={[0, Math.PI / 2, 0]} scale={[2.5, 2.5, 2.5]} name="Table 1" />
          <group position={[40, 1.6, 52]}>
            <FabricSquare position={[0.5, 0, 0.5]} color={PALETTE[2]} />
            <FabricSquare position={[-0.5, 0, -0.5]} color={PALETTE[3]} />
          </group>
          <IndustrialWorkTable position={[31, 0, 52]} rotation={[0, -Math.PI / 2, 0]} scale={[2.5, 2.5, 2.5]} name="Table 2" />
          <group position={[31, 1.6, 52]}>
            <FabricSquare position={[0, 0, 0]} color={PALETTE[7]} />
          </group>

          {/* Standing Operators (Monitoring Machines & Racks) */}
          <StandingOperator position={[5, 0, 51.8]} rotation={[0, Math.PI / 2, 0]} />
          <StandingOperator position={[23, 0, 52]} rotation={[0, -Math.PI / 2, 0]} />
          <StandingOperator position={[42.8, 0, 52]} rotation={[0, -Math.PI / 2, 0]} />
          <StandingOperator position={[34, 0, 52]} rotation={[0, -Math.PI / 2, 0]} />
          <StandingOperator position={[-10, 0, 32]} rotation={[0, Math.PI / 2, 0]} />
          <QRScannerStation position={[-8, 0, 32]} rotation={[0, Math.PI / 2, 0]} scale={[1.2, 1.2, 1.2]} />


          {/* Accurate AGVs */}
          {/* Task AGV: Pick up first pallet */}
          <PickingAGV
            ref={agv1Ref}
            startPos={[-21.5, 0, 55]}
            palletPos={[-15.5, 0, 63.6]}
            targetPos={[-14.9, 0, 28.65]}
            onPick={() => setPalletPicked(true)}
            onDrop={() => setPalletDropped(true)}
            trigger={agvTrigger}
            name="AGV 1"
            rollColor={PALETTE[13]}
            pivot180={true}
            palletRotation={Math.PI / 2}
          />
          <PickingAGV
            ref={agv2Ref}
            startPos={[14, 0, 40]}
            palletPos={[8, 0, 45]}
            targetPos={[13.1, 0, 28.65]}   // Dropped pallet center for INT-R1
            onPick={(type) => {
              if (type === "Q-FETCH") setPickedFromQ(true);
              else setPalletPicked2(true);
            }}
            onDrop={(type) => {
              if (type === "RETURNED") setReturnedToInspection(true);
              else setPalletDropped2(true);
            }}
            trigger={palletDropped}
            name="AGV 2"
            rollColor={pickedFromQ ? PALETTE[13] : PALETTE[8]}
            pivot180={true}
            movementType="inspection"
            palletRotation={Math.PI / 2}
          />







          <HybridConveyor
            position={[-14.0, 0, 58.5]}
            rotation={[0, -Math.PI / 2, 0]}
            count={4}
            skipStoppers={
              cycle === 0 ? [2, 3] :
                cycle === 1 ? [1, 2] :
                  cycle === 2 ? [0, 1] : [-1, 0]
            }
          />
          <QRWorkstation rollRef={rollRef} position={[-11.0, 0, 70]} rotation={[0, -Math.PI / 2, 0]} scale={[2, 2, 2]} />
          {/* STANDALONE PALLETS WITH UNIQUE COLORS */}
          <group position={[-15.5, 0, 58.8]} rotation={[0, -Math.PI / 2, 0]}>
            {[0, 1, 2, 3].map((i) => {
              // i=3 is the first pallet from the truck side
              if (i === 3 && palletPicked) return null;
              return (
                <FabricRollPallet
                  key={`truck-pal-${i}`}
                  position={[i * 1.6, 0, 0]}
                  rotation={[0, Math.PI / 2, 0]}
                  rollColor={PALETTE[(i + 10) % PALETTE.length]}
                />
              );
            })}
          </group>

          {/* Dropped Pallets */}
          {palletDropped && !pickedFromQ && (
            <group position={[-14.9, 0, 28.65]} rotation={[0, 0, 0]} scale={[1, 1, 1]}>
              <FabricRollPallet rollColor={PALETTE[13]} />
            </group>
          )}
          {palletDropped2 && (
            <group position={[13.1, 0, 28.65]} rotation={[0, 0, 0]} scale={[1, 1, 1]}>
              <FabricRollPallet rollColor={PALETTE[8]} />
            </group>
          )}
          {returnedToInspection && (
            <group position={[8, 0, 45]} rotation={[0, 0, 0]} scale={[1, 1, 1]}>
              <FabricRollPallet rollColor={PALETTE[13]} />
            </group>
          )}

          {/* Truck */}
          <Truck position={[-14, 0, 90]} />
        </Suspense>
      </Canvas>
    </Wrapper>
  );
}