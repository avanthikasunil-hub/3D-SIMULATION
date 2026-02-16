import React, { useState, useEffect, useMemo, useRef, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  useCursor,
  useTexture,
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
      // 3. FALL & LAND PERMANENTLY
      if (rollRef.current.position.y > 0.6) {
        rollRef.current.position.y -= fallSpeed;
      } else {
        // STAY HERE instead of resetting immediately
        if (!rollRef.current.landed) {
          rollRef.current.landed = true;
          if (onRollLanded) onRollLanded(cycle); // Pass cycle so parent knows which pallet filled

          // Small delay before advancing next roll cycle, but THIS roll stays
          setTimeout(() => {
            setPhase(3);
          }, 500);
        }
      }
    }
    else if (phase === 3) {
      // 4. PREPARE NEXT ROLL (This roll group is already landed, parent should handle persistent rendering)
      stopperGroupRef.current.position.x += slideSpeed;
      if (stopperGroupRef.current.position.x >= -14) {
        stopperGroupRef.current.position.x = -14;
        rollRef.current.position.set(...truckStartPos);
        rollRef.current.position.y = truckStartPos[1];
        rollRef.current.landed = false;
        setPhase(0);
        onReset();
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

const FloatingLabel = ({ text, position = [0, 3, 0], bgColor = "#fbbf24", textColor = "#000000", scale = 1.0 }) => {
  const spriteRef = useRef();

  // Create texture once or when text changes
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    const fontSize = 100;
    const lineHeight = 120;
    const padding = 80;
    const maxWidth = 1200; // Increased width to fit full text comfortably

    ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`;

    // Wrap text into lines
    const words = text.toUpperCase().split(" ");
    const lines = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      const width = ctx.measureText(currentLine + " " + word).width;
      if (width < maxWidth) {
        currentLine += " " + word;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    lines.push(currentLine);

    // Limit to max 3 lines strictly
    // No truncation - allow full text to display
    // lines.length will determine height automatically
    // Use the actual number of lines to size the box.

    // Calculate canvas dimensions
    let maxMeasuredWidth = 0;
    lines.forEach(line => {
      maxMeasuredWidth = Math.max(maxMeasuredWidth, ctx.measureText(line).width);
    });

    // Ensure a minimum width for short text so it doesn't look too thin vertically
    const canvasWidth = Math.max(maxMeasuredWidth, 200) + padding * 2;
    const canvasHeight = lines.length * lineHeight + padding * 1.5;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    // Draw background
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.fillStyle = bgColor;
    ctx.shadowColor = "rgba(0,0,0,0.3)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 5;

    const radius = 30; // Curved edges
    ctx.beginPath();
    ctx.roundRect(0, 0, canvasWidth, canvasHeight, radius);
    ctx.fill();

    // Draw text
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = textColor;
    ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    lines.forEach((line, index) => {
      // Vertically center the block of text
      const totalTextHeight = (lines.length - 1) * lineHeight;
      const startY = (canvasHeight - totalTextHeight) / 2;
      const y = startY + index * lineHeight;

      // Fine-tune Y to center perfectly (middle baseline can be tricky with multiple lines)
      // Alternative: Use center of canvas and offset
      const yOffset = (canvasHeight / 2) - ((lines.length - 1) * lineHeight / 2) + (index * lineHeight);
      ctx.fillText(line, canvasWidth / 2, yOffset);
    });

    return new THREE.CanvasTexture(canvas);
  }, [text, bgColor, textColor]);

  const aspect = texture.image.width / texture.image.height;

  useFrame((state) => {
    if (!spriteRef.current) return;
    const t = state.clock.getElapsedTime();

    // 1. Floating motion
    spriteRef.current.position.y = position[1] + Math.sin(t * 1.5) * 0.1;

    // 2. Camera-distance based scaling to prevent labels from being too big when zoomed in
    const dist = state.camera.position.distanceTo(spriteRef.current.position);
    // Base height of 1.1 at ~55 units distance
    const scaleFactor = THREE.MathUtils.clamp(dist / 55, 0.45, 2.0);

    const h = scale * scaleFactor;
    const w = h * aspect;
    spriteRef.current.scale.set(w, h, 1);
  });

  return (
    <sprite ref={spriteRef} position={position}>
      <spriteMaterial map={texture} depthTest={false} transparent opacity={0.95} />
    </sprite>
  );
};

/* ───── 3. CINEMATIC PROCESS LABELS (Step-by-Step Narration) ───── */
const CinematicProcessLabels = ({
  rollRef, agv1Ref, agv2Ref,
  palletPicked, palletDropped, palletPicked2,
  palletDropped2, pickedFromQ, returnedToInspection,
  showScannerFocus, cycle
}) => {
  const [activeLabel, setActiveLabel] = useState("");
  const [labelPos, setLabelPos] = useState([0, 0, 0]);
  const [secLabel, setSecLabel] = useState("");
  const [secPos, setSecPos] = useState([0, 0, 0]);
  const [transitLabel, setTransitLabel] = useState("");
  const [transitPos, setTransitPos] = useState([0, 0, 0]);
  const labelStartTimeRef = useRef(0);
  const lastLabelRef = useRef("");
  const hasReachedInspectionRef = useRef(false);

  useFrame((state) => {
    let nextLabel = "";
    let nextPos = [0, 0, 0];
    let nextTransitLabel = "";
    let nextTransitPos = [0, 0, 0];

    // Track inspection arrival
    if (agv2Ref.current && agv2Ref.current.position.z > 50) {
      hasReachedInspectionRef.current = true;
    }
    // Reset if cycle restarts (approximate check)
    if (!pickedFromQ && !palletPicked2) {
      hasReachedInspectionRef.current = false;
    }

    // Determine the high-level phase string for timing transitions
    let cp = "INIT";

    if (palletPicked2 && !palletDropped2 && pickedFromQ) {
      // Carrying Pallet (Prioritize this over "Returned" status)
      // Could be Going to Inspection OR Returning from it
      const z = agv2Ref.current ? agv2Ref.current.position.z : 0;

      if (hasReachedInspectionRef.current) {
        if (z < 49) cp = "TRANSIT_TO_RACK";
        else cp = "AT_INSPECTION_PROG";
      } else {
        cp = "RETRIEVING_FROM_Q"; // Going towards inspection
        // If close to inspection, maybe show arrival?
        if (z > 45) cp = "AT_INSPECTION";
      }
    }
    else if (returnedToInspection) {
      cp = "RETURN_HOME";
    }
    else if (palletDropped2 && !returnedToInspection) {
      // Post-drop behavior: Returning to rack is the "Transfer" phase
      cp = "TRANSIT_TO_RACK";
    }
    else if (pickedFromQ && !palletDropped2) cp = "RETRIEVING_FROM_Q";
    else if (palletPicked2 && !palletDropped2 && !pickedFromQ) cp = "AT_INSPECTION";
    else if (palletDropped && !palletPicked2) cp = "STORED_IN_Q";
    else if (palletPicked && !palletDropped) cp = "AGV1_TRANSFER";
    else if (rollRef.current && !palletPicked) cp = "ROLL";

    const agvPos = new THREE.Vector3();
    if (agv2Ref.current) agv2Ref.current.getWorldPosition(agvPos);

    const agvPos1 = new THREE.Vector3();
    if (agv1Ref.current) agv1Ref.current.getWorldPosition(agvPos1);

    // Priority 1: AGV 2 RETURN JOURNEY - DISABLED
    /*
    if (cp === "RETURN_HOME" && agv2Ref.current) {
      nextLabel = "AGV returning to quarantine area.";
      nextPos = [agvPos.x, agvPos.y + 4.5, agvPos.z];
    }
    */
    // Priority 2: AGV 2 FINAL TRANSIT (Post-Inspection) - MOVED TO SEPARATE CHANNEL BELOW
    // else if (cp === "TRANSIT_TO_RACK" && agv2Ref.current) { ... }

    // Priority 3: INDUSTRY 4.0 INSPECTION AT MACHINE (Processing)
    /*
    else if (cp === "AT_INSPECTION_PROG") {
      nextLabel = "Industry 4.0 inspection in progress...";
      nextPos = [agvPos.x, agvPos.y + 4.5, agvPos.z];
    }

    // Priority 4: INDUSTRY 4.0 INSPECTION AT MACHINE (Arrival)
    else if (cp === "AT_INSPECTION") {
      nextLabel = "Vision based 4.0 inspection";
      nextPos = [10, 6, 51.5];
    }
    */
    // Priority 5: AGV 2 RETRIEVING FROM Q-RACK
    if (cp === "RETRIEVING_FROM_Q" && agv2Ref.current) {
      nextLabel = "AGV collecting pallet for inspection.";
      nextPos = [agvPos.x, agvPos.y + 4.5, agvPos.z];
    }
    // Priority 6: Q-RACK STORAGE & SCAN
    else if (cp === "STORED_IN_Q") {
      if (showScannerFocus) {
        nextLabel = "Pallet scanned in StockGrid system.";
        nextPos = [-14.9, 4.5, 28.65];
      } else {
        nextLabel = "Roll stored in quarantine location.";
        nextPos = [-14.9, 4.5, 28.65];
      }
    }
    // Priority 7: AGV 1 TRANSFER
    else if (cp === "AGV1_TRANSFER" && agv1Ref.current) {
      nextLabel = "AGV transferring roll to quarantine rack.";
      nextPos = [agvPos1.x, agvPos1.y + 4.5, agvPos1.z];
    }
    // Priority 8: CONVEYOR INFEED - Only first cycle
    else if (cp === "ROLL" && cycle === 0) {
      const { x, z } = rollRef.current.position;
      if (z > 73) {
        nextLabel = "Automated Roll Infeed via Conveyor.";
        nextPos = [-14, 4.5, z];
      } else if (z > 68.6) {
        nextLabel = "Operator applying QR label.";
        nextPos = [-11, 6.5, 70.5];
      } else if (z > 65.5) {
        nextLabel = "QR code scanned automatically.";
        nextPos = [-14, 4.5, 67.5];
      } else if (x < -14.2) {
        nextLabel = "Roll transfer via sliding stoppers.";
        nextPos = [x, 4.5, z];
      }
    }

    // Secondary Label: Roll ID Tracking (PRLS/25/12311)
    let nextSecLabel = "";
    let nextSecPos = [0, 0, 0];

    // Show Roll ID "PRLS/25/12311" from Truck to Palette (Conveyor only) - Only for 1st Cycle
    if (cp === "ROLL" && rollRef.current && cycle === 0) {
      nextSecLabel = "PRLS/25/12311";
      // Position slightly above the roll
      nextSecPos = [rollRef.current.position.x, rollRef.current.position.y + 1.2, rollRef.current.position.z];
    }

    // Transit Label Logic (Allow overlapping)
    /*
    if (cp === "TRANSIT_TO_RACK" && agv2Ref.current) {
      nextTransitLabel = "AGV transferring inspected pallet to assigned rack.";
      nextTransitPos = [agvPos.x, agvPos.y + 4.5, agvPos.z];
    }
    */

    setSecLabel(nextSecLabel);
    setSecPos(nextSecPos);
    setTransitLabel(nextTransitLabel);
    setTransitPos(nextTransitPos);

    // Timing & Persistence Logic
    if (nextLabel !== lastLabelRef.current) {
      if (nextLabel !== "") {
        lastLabelRef.current = nextLabel;
        labelStartTimeRef.current = state.clock.elapsedTime;
        setActiveLabel(nextLabel);
        setLabelPos(nextPos);
      } else {
        const elapsed = state.clock.elapsedTime - labelStartTimeRef.current;
        if (elapsed > 4) {
          lastLabelRef.current = "";
          setActiveLabel("");
        }
      }
    } else if (nextLabel !== "") {
      const elapsed = state.clock.elapsedTime - labelStartTimeRef.current;
      if (elapsed > 4) {
        setActiveLabel("");
      } else {
        setLabelPos(nextPos); // Continuous update to follow AGVs/Rolls
      }
    } else {
      setActiveLabel("");
    }
  });

  return (
    <>
      {activeLabel && (
        <FloatingLabel
          text={activeLabel}
          position={labelPos}
          bgColor="#0284c7"
          textColor="#ffffff"
          scale={2.5}
        />
      )}
      {secLabel && (
        <FloatingLabel
          text={secLabel}
          position={secPos}
          bgColor="#1e293b"
          textColor="#ffffff"
          scale={1.2}
        />
      )}
      {transitLabel && (
        <FloatingLabel
          text={transitLabel}
          position={transitPos}
          bgColor="#0284c7"
          textColor="#ffffff"
          scale={2.5}
        />
      )}
    </>
  );
};

/* ───── 3. FABRIC ROLL PALLET (Precision 3x3) ───── */
const FabricRollPallet = ({ position, rotation = [0, 0, 0], rollColor = "#64748b", emptySlot = null }) => {
  const rolls = useMemo(() => {
    const arr = [];
    const mat = new THREE.MeshStandardMaterial({ color: rollColor, roughness: 0.6 });
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const index = r * 3 + c;
        if (index === emptySlot) continue;
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
  const [clicked, setClicked] = useState(false);
  const twinDepth = 2.8;

  const handleClick = (e) => {
    e.stopPropagation();
    setClicked(!clicked);
  };

  return (
    <group position={position} onClick={handleClick}>
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

      {label && clicked && <FloatingLabel text={label} position={[0, SPECS.rackHeight + 0.5, 0]} />}
    </group>
  );
};

/* ───── 5. HYBRID CONVEYOR ───── */
const HybridConveyor = ({ position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1], count = 4, skipStoppers = [], onHover }) => {
  const [clicked, setClicked] = useState(false);
  const palletLength = 1.6;
  const longPartLength = 18;
  const beltY = 1.9;
  return (
    <group
      position={position}
      rotation={rotation}
      scale={scale}
      onClick={(e) => { e.stopPropagation(); setClicked(!clicked); }}
    >
      {clicked && <FloatingLabel text="CONVEYOR" position={[9, 3.5, 0]} />}
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
  const [clicked, setClicked] = useState(false);

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
      onClick={(e) => { e.stopPropagation(); setClicked(!clicked); }}
    >
      {clicked && <FloatingLabel text="TRUCK" position={[0, 4.5, 0]} />}

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
const InspectionMachine = ({ position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1], name = "Inspection Machine", onHover, showLabel = false, labelText = "" }) => {
  const [clicked, setClicked] = useState(false);
  return (
    <group position={position} rotation={rotation}>
      <group
        scale={scale}
        onClick={(e) => { e.stopPropagation(); setClicked(!clicked); }}
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
      {(clicked || showLabel) && (
        <FloatingLabel
          text={showLabel ? labelText : name}
          position={[0, 1.2 * (Array.isArray(scale) ? scale[1] : scale), 0]}
          bgColor={showLabel ? "#0284c7" : "#fbbf24"}
          textColor={showLabel ? "#ffffff" : "#000000"}
          scale={showLabel ? 1.5 : 1.0}
        />
      )}
    </group>
  );
};

/* ───── 8. INDUSTRIAL WORK TABLE ───── */
/* ───── 8. INDUSTRIAL WORK TABLE ───── */
const IndustrialWorkTable = ({ position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1], name = "Work Table", onHover }) => {
  const [clicked, setClicked] = useState(false);
  return (
    <group position={position} rotation={rotation}>
      <group
        scale={scale}
        onClick={(e) => { e.stopPropagation(); setClicked(!clicked); }}
      >
        <mesh position={[0, 0.9, 0]}><boxGeometry args={[3, 0.15, 1.5]} /><meshStandardMaterial color="#b45309" /></mesh>
        {[[-1.4, -0.6], [1.4, -0.6], [-1.4, 0.6], [1.4, 0.6]].map((pos, i) => (
          <mesh key={i} position={[pos[0], 0.45, pos[1]]}><boxGeometry args={[0.12, 0.9, 0.12]} /><meshStandardMaterial color="#334155" /></mesh>
        ))}
        <mesh position={[0, 0.25, 0]}><boxGeometry args={[2.7, 0.05, 1.3]} /><meshStandardMaterial color="#475569" /></mesh>
      </group>
      {clicked && <FloatingLabel text={name} position={[0, 0.6 * (Array.isArray(scale) ? scale[1] : scale), 0]} />}
    </group>
  );
};



/* ───── 10. TASK-DRIVEN AGV ───── */
const PickingAGV = React.forwardRef(({
  startPos, palletPos, targetPos,
  onPick, onDrop, trigger = true,
  name = "AGV", movementType = "normal",
  rollColor, palletRotation, pivot180 = false, cycle = 0
}, ref) => {
  const localRef = useRef();
  const agvRef = ref || localRef;
  const [phase, setPhase] = useState(-1); // -1: Waiting for trigger
  const [hasPallet, setHasPallet] = useState(false);

  useFrame((state, delta) => {
    if (!agvRef.current) return;
    if (phase === -2 || trigger === "STOP") return; // Completely stopped after its round or external stop

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
          const pickStopX = palletPos[0] - (pickDir * 2.8);
          // Soft-landing: slow down as we get very close
          const distToPick = Math.abs(pos.x - pickStopX);
          const approachSpeed = distToPick < 0.5 ? moveStep * 0.4 : moveStep;
          pos.x = moveTowards(pos.x, pickStopX, approachSpeed);
          if (Math.abs(pos.x - pickStopX) < 0.005) {
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
          // Face -X (Standard aisle direction)
          targetAisleRot = Math.PI;
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
          // F2 racks are aligned along negative Z relative to aisle. Rotate -90 (-PI/2)
          dropAngle = -Math.PI / 2;
        } else {
          dropAngle = pivot180 ? (Math.PI - (rackDir_6 * Math.PI / 2)) : (rackDir_6 * Math.PI / 2);
        }

        // Shortest path rotation logic
        let diff6 = (dropAngle - rot.y) % (Math.PI * 2);
        if (diff6 > Math.PI) diff6 -= Math.PI * 2;
        if (diff6 < -Math.PI) diff6 += Math.PI * 2;
        const rotAmt6 = Math.sign(diff6) * Math.min(rotStep, Math.abs(diff6));
        rot.y += rotAmt6;

        if (Math.abs(diff6) < 0.01) {
          rot.y = dropAngle;
          setPhase(7);
        }
        break;

      case 7: { // 7. Drive into Rack Position
        let chassisStop;
        const palletPivotOffset = 2.8;
        if (movementType === "inspection") {
          // Moving towards negative X for F2 racks
          const mouthDir_7 = -1;
          chassisStop = targetPos[0] - (mouthDir_7 * palletPivotOffset);
        } else {
          const mouthDir_7 = startPos[0] < targetPos[0] ? 1 : -1;
          chassisStop = targetPos[0] - (mouthDir_7 * palletPivotOffset);
        }
        // Soft-landing speed
        const distToDrop = Math.abs(pos.x - chassisStop);
        const approachSpeed = distToDrop < 0.5 ? moveStep * 0.4 : moveStep;
        pos.x = moveTowards(pos.x, chassisStop, approachSpeed);
        if (Math.abs(pos.x - chassisStop) < 0.005) {
          setPhase(75); // Start waiting/unlatching phase
        }
        break;
      }

      case 75: { // 75. Wait/Drop Pallet (No Lift)
        if (!agvRef.current.dropTimer) agvRef.current.dropTimer = 0;
        agvRef.current.dropTimer += delta;
        if (agvRef.current.dropTimer > 1.5) {
          agvRef.current.dropTimer = 0;
          if (onDrop) onDrop("RACK"); // Standard rack drop
          setHasPallet(false);
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
        // Face +Z which corresponds to 0 radians in standard orientation if +Z is "forward" relative to world
        // However, based on previous code context, "Face Conveyor" meant facing towards +Z.
        // Let's assume target is 0 (or Math.PI * 2) or whatever aligns with Z axis.
        // Previous code used -Math.PI * 2 which is essentially 0.
        const faceConveyorRot = 0;

        let diff60 = (faceConveyorRot - rot.y) % (Math.PI * 2);
        if (diff60 > Math.PI) diff60 -= Math.PI * 2;
        if (diff60 < -Math.PI) diff60 += Math.PI * 2;

        const rotAmt60 = Math.sign(diff60) * Math.min(rotStep, Math.abs(diff60));
        rot.y += rotAmt60;

        if (Math.abs(diff60) < 0.01) {
          rot.y = faceConveyorRot;
          setPhase(61);
        }
        break;

      case 61: // 61. Drive to Conveyor Aisle Z alignment
        // We need to reach a Z position that aligns with the "RTI" / Q-Rack row.
        // Q-Rack row is at Z ~ 28.65.
        // Previously: targetPos[2] + 8 (where targetPos was old INT-R1 at 28.65 => 36.65).
        // Let's aim for Z = 36.65 to be consistent with the clear path logic.
        const driveTargetZ = 36.65;
        pos.z = moveTowards(pos.z, driveTargetZ, moveStep);
        if (Math.abs(pos.z - driveTargetZ) < 0.01) setPhase(62);
        break;

      case 62: // 62. Turn to face "RTI" racks at the end (-X direction)
        const faceRTIRot = -Math.PI / 2; // Facing -X is -90 degrees (or 270 degrees)

        let diff62 = (faceRTIRot - rot.y) % (Math.PI * 2);
        if (diff62 > Math.PI) diff62 -= Math.PI * 2;
        if (diff62 < -Math.PI) diff62 += Math.PI * 2;

        const rotAmt62 = Math.sign(diff62) * Math.min(rotStep, Math.abs(diff62));
        rot.y += rotAmt62;

        if (Math.abs(diff62) < 0.01) {
          rot.y = faceRTIRot;
          setPhase(63);
        }
        break;

      case 63: // 63. Move 19.5 units in that direction
        const lateralTargetX = 2 - 21;
        pos.x = moveTowards(pos.x, lateralTargetX, moveStep);
        if (Math.abs(pos.x - lateralTargetX) < 0.01) setPhase(70);
        break;

      case 70: // 70. Turn to face QR1 Row (-Z direction, easy 90 deg)
        // Back towards -Z is Math.PI or -Math.PI. Let's use Math.PI
        const faceQR1Z = Math.PI;

        let diff70 = (faceQR1Z - rot.y) % (Math.PI * 2);
        if (diff70 > Math.PI) diff70 -= Math.PI * 2;
        if (diff70 < -Math.PI) diff70 += Math.PI * 2;

        const rotAmt70 = Math.sign(diff70) * Math.min(rotStep, Math.abs(diff70));
        rot.y += rotAmt70;

        if (Math.abs(diff70) < 0.01) {
          rot.y = faceQR1Z;
          setPhase(71);
        }
        break;

      case 71: // 71. Move Z to align with QR1 (Z=28.65)
        const approachZ = 28.65;
        pos.z = moveTowards(pos.z, approachZ, moveStep);
        if (Math.abs(pos.z - approachZ) < 0.01) setPhase(72);
        break;

      case 72: // 72. Turn again towards QR1 (+X direction, easy 90 deg)
        // Previous value was -Math.PI * 3.5 = -630 deg = 90 deg = Math.PI/2
        const faceQR1X = Math.PI / 2; // +X direction

        let diff72 = (faceQR1X - rot.y) % (Math.PI * 2);
        if (diff72 > Math.PI) diff72 -= Math.PI * 2;
        if (diff72 < -Math.PI) diff72 += Math.PI * 2;

        const rotAmt72 = Math.sign(diff72) * Math.min(rotStep, Math.abs(diff72));
        rot.y += rotAmt72;

        if (Math.abs(diff72) < 0.01) {
          rot.y = faceQR1X;
          setPhase(73);
        }
        break;

      case 73: // 73. Take the blue-roll pallet
        const qStopX_73 = -14.9 - 2.8;
        const distToQ = Math.abs(pos.x - qStopX_73);
        const approachSpeedQ = distToQ < 0.5 ? moveStep * 0.4 : moveStep;
        pos.x = moveTowards(pos.x, qStopX_73, approachSpeedQ);
        if (Math.abs(pos.x - qStopX_73) < 0.005) {
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
        const machineTargetX = 8.0 - 1.4; // 8.0 is machine center, return offset adjusted for 2.8 pallet spread
        const distToMachine = Math.abs(pos.x - machineTargetX);
        const approachSpeedM = distToMachine < 0.5 ? moveStep * 0.4 : moveStep;
        pos.x = moveTowards(pos.x, machineTargetX, approachSpeedM);
        if (Math.abs(pos.x - machineTargetX) < 0.005) {
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

  const [clicked, setClicked] = useState(false);
  const [showTransferLabel, setShowTransferLabel] = useState(false);

  useEffect(() => {
    // Trigger when entering Phase 3 (Start of transfer movement) - Only first cycle
    // DISABLED: User requested "Collecting" to be final text
    if (movementType === "inspection" && phase === 3 && cycle === 0) {
      setShowTransferLabel(true);
    }
  }, [phase, movementType, cycle]);

  useEffect(() => {
    // Auto-hide after 5 seconds
    if (showTransferLabel) {
      const timer = setTimeout(() => setShowTransferLabel(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [showTransferLabel]);

  return (
    <group
      ref={agvRef}
      position={startPos}
      onClick={(e) => { e.stopPropagation(); setClicked(!clicked); }}
    >
      <group scale={[2, 2, 2]}>
        <AccurateAGV position={[0, 0, 0]} rotation={[0, 0, 0]} />
        {hasPallet && (
          <group position={[0, 0, 1.4]} rotation={[0, palletRotation, 0]} scale={[0.5, 0.5, 0.5]}>
            <FabricRollPallet rollColor={rollColor} />
          </group>
        )}
      </group>
      {clicked && <FloatingLabel text={name} position={[0, 3.2, 0]} />}

      {/* Explicit Transfer Text REMOVED as per user request */}
      {showTransferLabel && (
        <FloatingLabel
          text="Inspected rolls are kept in assigned rack"
          position={[0, 4.5, 0]}
          bgColor="#0284c7"
          textColor="#ffffff"
          scale={1.5}
        />
      )}
    </group>
  );
});

/* ───── 11. CAMERA TRACKING DIRECTOR (Cinematic Follow) ───── */
const CameraDirector = ({ rollRef, agv1Ref, agv2Ref, scanner1Ref, scanner2Ref, agvTrigger, palletDropped, returnedToInspection, palletDropped2, showScannerFocus, setShowScannerFocus }) => {
  const { camera } = useThree();
  const targetV = useMemo(() => new THREE.Vector3(), []);
  const tempV = useMemo(() => new THREE.Vector3(), []);
  const currentOffset = useMemo(() => new THREE.Vector3(35, 35, 35), []);
  const [isFinished, setIsFinished] = useState(false);
  const scannerFocusStartRef = useRef(0);
  const zoomCompleteRef = useRef(false);

  useEffect(() => {
    if (palletDropped && !palletDropped2) {
      setShowScannerFocus(true);
      // The total sequence is 6 seconds based on user request for AGV delay
      const timer = setTimeout(() => setShowScannerFocus(false), 6000);
      return () => clearTimeout(timer);
    }
  }, [palletDropped, palletDropped2]);

  useEffect(() => {
    if (palletDropped2) {
      const timer = setTimeout(() => setIsFinished(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [palletDropped2]);

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
        const rollZ = rollRef.current.position.z;
        rollRef.current.getWorldPosition(targetWorldPos);

        if (rollZ > 75) {
          // PHASE 1a: Initial Roll Motion - Start from Truck Side
          const cinematicTime = Math.min(state.clock.elapsedTime * 0.3, 1);

          // Start: Close behind the truck (0, 5, 15)
          // End: Isometric side view (15, 20, 15)
          const xOff = THREE.MathUtils.lerp(0, 15, cinematicTime);
          const yOff = THREE.MathUtils.lerp(5, 20, cinematicTime);
          const zOff = THREE.MathUtils.lerp(15, 15, cinematicTime);

          currentOffset.set(xOff, yOff, zOff);
        } else if (rollZ > 65) {
          // PHASE 1b: Focus on QR Station Operator
          if (scanner1Ref.current) {
            scanner1Ref.current.getWorldPosition(targetWorldPos);
            currentOffset.set(12, 12, 12);
          }
        } else if (rollZ > 40) {
          // PHASE 1c: Back to follow roll to pallets
          currentOffset.set(15, 18, 15);
        } else {
          // PHASE 1d: Focus on Aisle Scanner Operator
          if (scanner2Ref.current) {
            scanner2Ref.current.getWorldPosition(targetWorldPos);
            currentOffset.set(14, 14, 14);
          }
        }
        hasTarget = true;
      }
    } else if (!palletDropped) {
      if (agv1Ref.current) {
        agv1Ref.current.getWorldPosition(targetWorldPos);
        currentOffset.set(18, 12, 18);
        hasTarget = true;
      }
    } else if (showScannerFocus) {
      // PHASE 3: Cinematic Crane/Jib focusing on scanner operator
      if (scanner2Ref.current) {
        if (scannerFocusStartRef.current === 0) scannerFocusStartRef.current = state.clock.elapsedTime;
        const elapsed = state.clock.elapsedTime - scannerFocusStartRef.current;
        const duration = 6;
        const progress = Math.min(elapsed / duration, 1);

        scanner2Ref.current.getWorldPosition(targetWorldPos);

        // Cinematic Path: Close-up Front-Side Dolly
        const altitude = THREE.MathUtils.lerp(6, 4.5, progress);
        const radius = THREE.MathUtils.lerp(10, 8, progress);
        const orbitAngle = Math.PI * 0.15;

        currentOffset.set(
          Math.cos(orbitAngle) * radius,
          altitude,
          Math.sin(orbitAngle) * radius
        );
        hasTarget = true;
      }
    } else if (!palletDropped2) {
      // Reset focus start time for next cycle if needed
      scannerFocusStartRef.current = 0;
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
        if (palletDropped2) {
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

/* ───── 12. QR WORKSTATION (With Click) ───── */
const QRWorkstation = React.forwardRef(({ rollRef, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1], onHover, stopped }, ref) => {
  const [clicked, setClicked] = useState(false);
  const maroonMat = "#800000";
  const tableTopMat = "#475569";
  const frameMat = "#1e293b";

  const leftArmRef = useRef();
  const rightArmRef = useRef();
  const stickerRef = useRef();
  const operatorGroupRef = useRef();
  const localRef = useRef();
  const workstationGroupRef = ref || localRef;

  // ... (useFrame remains the same)

  useFrame((state) => {
    if (stopped || !rollRef || !rollRef.current || !leftArmRef.current || !rightArmRef.current || !operatorGroupRef.current) return;

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

  return (
    <group ref={workstationGroupRef} position={position} rotation={rotation} onClick={() => setClicked(!clicked)}>
      <group
        scale={scale}
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
      {clicked && <FloatingLabel text="QR STICKER STATION" position={[0, 1.2 * (Array.isArray(scale) ? scale[1] : scale), 0]} />}
    </group>
  );
});

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

/* ───── 13b. HANDHELD SCANNER COMPONENT ───── */
const HandheldScanner = ({ position, rotation, isScanning }) => (
  <group position={position} rotation={rotation}>
    {/* Scanner Body */}
    <mesh position={[0, 0.15, 0.05]} rotation={[0.2, 0, 0]}>
      <boxGeometry args={[0.12, 0.1, 0.2]} />
      <meshStandardMaterial color="#222" />
    </mesh>
    {/* Laser Window */}
    <mesh position={[0, 0.16, 0.15]}>
      <boxGeometry args={[0.08, 0.04, 0.01]} />
      <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={2} />
    </mesh>
    {/* Visual Laser Beam */}
    {isScanning && (
      <mesh position={[0, 0.16, 2.15]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.005, 0.015, 4, 8]} />
        <meshBasicMaterial color="#ff0000" transparent opacity={0.6} />
      </mesh>
    )}
    {/* Handle */}
    <mesh position={[0, 0, 0]} rotation={[-0.4, 0, 0]}>
      <boxGeometry args={[0.07, 0.25, 0.07]} />
      <meshStandardMaterial color="#333" />
    </mesh>
  </group>
);


/* ───── 13c. SCANNER OPERATOR (HOLDING SCANNER) ───── */
const ScannerOperator = React.forwardRef(({ position, rotation = [0, 0, 0], stopped }, ref) => {
  const localRef = useRef();
  const operatorRootRef = ref || localRef;
  const groupRef = useRef();
  const armRef = useRef();

  useFrame((state) => {
    if (stopped) return;
    const t = state.clock.elapsedTime * 0.35; // Slow, high-precision pace

    // Highly deliberate roll-by-roll scanning (8s per cycle)
    const rollPeriod = 8;
    const rollIndex = Math.floor(t / rollPeriod) % 3;
    const cycleTime = t % rollPeriod;

    // 1. Torso Targeting (Horizontal) - Slow and structured
    if (groupRef.current) {
      const targetY = (rollIndex - 1) * 0.45;
      groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, targetY, 0.035);
    }

    // 2. Arm Precision Sweep (Vertical) 
    const isScanning = cycleTime > 2.0 && cycleTime < 6.0;
    if (armRef.current) {
      // Pattern: Pause to aim (0-2s), Slow Scan (2-6s), Transition (6-8s)
      if (isScanning) {
        const scanProgress = (cycleTime - 2.0) / 4.0;
        // Realistic 'scan' feel: slight vibration + slow vertical arc
        const scanJitter = Math.sin(state.clock.elapsedTime * 15) * 0.005;
        const scanAngle = Math.sin(scanProgress * Math.PI) * 0.45 + scanJitter;
        armRef.current.rotation.x = -Math.PI / 2.5 + scanAngle;
      } else {
        // Steady aim between rolls
        armRef.current.rotation.x = THREE.MathUtils.lerp(armRef.current.rotation.x, -Math.PI / 2.5, 0.04);
      }
    }

    // but here we render it directly in the return
    if (groupRef.current) groupRef.current.isScanning = isScanning;
  });

  return (
    <group ref={operatorRootRef} position={position} rotation={rotation}>
      <group ref={groupRef} scale={[2, 2, 2]}>
        {/* Legs & Torso */}
        <mesh position={[0, 0.375, 0]}>
          <boxGeometry args={[0.35, 0.75, 0.25]} />
          <meshStandardMaterial color="#800000" />
        </mesh>
        <mesh position={[0, 1.025, 0]}>
          <boxGeometry args={[0.4, 0.55, 0.3]} />
          <meshStandardMaterial color="#800000" />
        </mesh>

        {/* Head & Hair */}
        <mesh position={[0, 1.45, 0]}>
          <sphereGeometry args={[0.13, 16, 16]} />
          <meshStandardMaterial color="#ffdbac" />
        </mesh>
        <mesh position={[0, 1.52, -0.02]} scale={[1, 0.5, 1]}>
          <sphereGeometry args={[0.135, 16, 16]} />
          <meshStandardMaterial color="#4b2c20" />
        </mesh>

        {/* Left Arm */}
        <mesh position={[-0.22, 1.1, 0.25]} rotation={[-Math.PI / 3, 0, -0.1]}>
          <boxGeometry args={[0.1, 0.55, 0.1]} />
          <meshStandardMaterial color="#800000" />
        </mesh>

        {/* Right Arm (Holding Scanner) */}
        <group ref={armRef} position={[0.22, 1.1, 0.25]} rotation={[-Math.PI / 2.5, 0, 0.1]}>
          <mesh position={[0, -0.2, 0]}>
            <boxGeometry args={[0.1, 0.55, 0.1]} />
            <meshStandardMaterial color="#800000" />
          </mesh>

          {/* The Scanner is placed at the end of the arm (the hand position) */}
          <HandheldScanner
            position={[0, -0.45, 0.05]}
            rotation={[Math.PI / 2, 0, 0]}
            isScanning={groupRef.current?.isScanning}
          />
        </group>
      </group>
    </group>
  );
});

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
        <Suspense fallback={
          <mesh position={[0, 0.7, 0.41]} rotation={[-0.2, 0, 0]}>
            <planeGeometry args={[0.6, 0.5]} />
            <meshStandardMaterial color={screenMat} emissive="#111111" roughness={0.1} />
          </mesh>
        }>
          <ScreenContent position={[0, 0.7, 0.41]} rotation={[-0.2, 0, 0]} />
        </Suspense>

        {/* Slot/Light */}
        <mesh position={[0, 0.3, 0.4]}>
          <boxGeometry args={[0.5, 0.1, 0.1]} />
          <meshBasicMaterial color="#00ffff" />
        </mesh>
      </group>
    </group>
  );
};

const ScreenContent = ({ position, rotation }) => {
  const texture = useTexture("/logo512.png");
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[0.6, 0.5]} />
      <meshStandardMaterial map={texture} emissive="#ffffff" emissiveIntensity={0.1} />
    </mesh>
  );
};
/* ───── 16. FABRIC SQUARE (For Tables) ───── */
const FabricSquare = ({ position, color }) => (
  <mesh position={position} castShadow>
    <boxGeometry args={[0.8, 0.1, 0.8]} />
    <meshStandardMaterial color={color} roughness={0.8} />
  </mesh>
);

/* ───── 13d. AUTO SCANNER SHED (Downstream) ───── */
const ScanningLine = () => {
  const lineRef = useRef();
  useFrame((state) => {
    if (lineRef.current) {
      lineRef.current.position.y = 1.7 + Math.sin(state.clock.elapsedTime * 8) * 1.5;
    }
  });
  return (
    <mesh ref={lineRef} position={[0, 1.7, 0.05]}>
      <boxGeometry args={[1.4, 0.04, 0.02]} />
      <meshBasicMaterial color="#00f2ff" transparent opacity={0.9} />
    </mesh>
  );
};

const AutoScannerShed = ({ rollRef, position }) => {
  const [active, setActive] = useState(false);
  const [clicked, setClicked] = useState(false);

  useFrame((state) => {
    if (!rollRef || !rollRef.current) return;
    const rollZ = rollRef.current.position.z;
    // Trigger as roll passes through the center of the shed
    const inRange = rollZ > position[2] - 1.2 && rollZ < position[2] + 1.2;
    setActive(inRange);
  });

  return (
    <group
      position={position}
      onClick={(e) => { e.stopPropagation(); setClicked(!clicked); }}
    >
      {/* Modern Industrial Archway Frame */}
      <mesh position={[0.8, 1.7, 0]}>
        <boxGeometry args={[0.2, 3.4, 0.8]} />
        <meshStandardMaterial color="#1e293b" metalness={0.9} roughness={0.1} />
      </mesh>
      <mesh position={[-0.8, 1.7, 0]}>
        <boxGeometry args={[0.2, 3.4, 0.8]} />
        <meshStandardMaterial color="#1e293b" metalness={0.9} roughness={0.1} />
      </mesh>
      <mesh position={[0, 3.4, 0]}>
        <boxGeometry args={[1.8, 0.2, 0.8]} />
        <meshStandardMaterial color="#1e293b" metalness={0.9} roughness={0.1} />
      </mesh>

      {/* Internal Tech & Emissive Lights */}
      <mesh position={[0, 3.25, 0]}>
        <boxGeometry args={[1.4, 0.1, 0.4]} />
        <meshStandardMaterial color="#000" emissive={active ? "#00f2ff" : "#000"} emissiveIntensity={3} />
      </mesh>

      {/* Laser Scanning Curtain Effect */}
      {active && (
        <group>
          <mesh position={[0, 1.7, 0]}>
            <planeGeometry args={[1.4, 3.2]} />
            <meshBasicMaterial color="#00f2ff" transparent opacity={0.15} side={THREE.DoubleSide} />
          </mesh>
          <ScanningLine />
        </group>
      )}

      {/* External Status Indicators */}
      <mesh position={[0.6, 3.55, 0]}>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshStandardMaterial color={active ? "#22c55e" : "#ef4444"} emissive={active ? "#22c55e" : "#ef4444"} emissiveIntensity={active ? 2 : 0.5} />
      </mesh>
      <mesh position={[-0.6, 3.55, 0]}>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshStandardMaterial color={active ? "#22c55e" : "#ef4444"} emissive={active ? "#22c55e" : "#ef4444"} emissiveIntensity={active ? 2 : 0.5} />
      </mesh>

      {clicked && <FloatingLabel text="AUTO QR SCANNER" position={[0, 4.2, 0]} />}
    </group>
  );
};

/* ───── 15. MONITORING TV STAND ───── */
const MonitoringScreen = ({ image }) => {
  const texture = useTexture(image);
  return (
    <mesh position={[0, 0, 0.07]}>
      <planeGeometry args={[1.7, 1.0]} />
      <meshBasicMaterial map={texture} />
    </mesh>
  );
};

const MonitoringTV = ({ position, rotation = [0, 0, 0], scale = [1, 1, 1], image }) => {
  const [clicked, setClicked] = useState(false);
  return (
    <group
      position={position}
      rotation={rotation}
      scale={scale}
      onClick={(e) => { e.stopPropagation(); setClicked(!clicked); }}
    >
      {/* Heavy Steel Base */}
      <mesh position={[0, 0.05, 0]} castShadow>
        <boxGeometry args={[0.8, 0.1, 0.8]} />
        <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.2} />
      </mesh>
      {/* Vertical Brushed Pole */}
      <mesh position={[0, 1.2, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.04, 2.4, 16]} />
        <meshStandardMaterial color="#475569" metalness={0.9} roughness={0.1} />
      </mesh>
      {/* TV Screen Unit */}
      <group position={[0, 2.4, 0.05]}>
        {/* Frame */}
        <mesh castShadow>
          <boxGeometry args={[1.8, 1.1, 0.1]} />
          <meshStandardMaterial color="#0f172a" roughness={0.5} />
        </mesh>
        {/* Glowing Screen Dashboard */}
        {image ? (
          <MonitoringScreen image={image} />
        ) : (
          <mesh position={[0, 0, 0.07]}>
            <planeGeometry args={[1.7, 1.0]} />
            <meshStandardMaterial
              color="#ffffff"
              emissive="#0284c7"
              emissiveIntensity={0.5}
              roughness={0.2}
            />
          </mesh>
        )}
        {/* Bezel Detail */}
        <mesh position={[0, 0, 0.055]}>
          <boxGeometry args={[1.75, 1.05, 0.01]} />
          <meshStandardMaterial color="#000" />
        </mesh>
      </group>
      {clicked && <FloatingLabel text="MONITORING DASHBOARD" position={[0, 3.5, 0]} />}
    </group>
  );
};

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
  const [agv2DelayedStart, setAgv2DelayedStart] = useState(false);
  const [showScannerFocus, setShowScannerFocus] = useState(false);
  const [landedRolls, setLandedRolls] = useState([]); // Track which conveyor pallets are filled
  const scanner1Ref = useRef();
  const scanner2Ref = useRef();
  const [agvTrigger2, setAgvTrigger2] = useState(false);
  const rollRef = useRef();
  const agv1Ref = useRef();
  const agv2Ref = useRef();
  const [hoveredItem, setHoveredItem] = useState(null);
  const [showInspectionText, setShowInspectionText] = useState(false);

  useEffect(() => {
    if (palletDropped && !palletDropped2) {
      const timer = setTimeout(() => setAgv2DelayedStart(true), 6000);
      return () => clearTimeout(timer);
    }
  }, [palletDropped, palletDropped2]);

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
            scanner1Ref={scanner1Ref}
            scanner2Ref={scanner2Ref}
            agvTrigger={agvTrigger}
            palletDropped={palletDropped}
            returnedToInspection={returnedToInspection}
            palletDropped2={palletDropped2}
            showScannerFocus={showScannerFocus}
            setShowScannerFocus={setShowScannerFocus}
          />

          {/* Process Narration Labels */}
          <CinematicProcessLabels
            rollRef={rollRef}
            agv1Ref={agv1Ref}
            agv2Ref={agv2Ref}
            palletPicked={palletPicked}
            palletDropped={palletDropped}
            palletPicked2={palletPicked2}
            palletDropped2={palletDropped2}
            pickedFromQ={pickedFromQ}
            returnedToInspection={returnedToInspection}
            showScannerFocus={showScannerFocus}
            cycle={cycle}
          />
          <ambientLight intensity={0.8} />
          <directionalLight position={[40, 60, 20]} intensity={1.5} />
          <Environment preset="warehouse" />
          <OrbitControls makeDefault dampingFactor={0.1} enableDamping maxPolarAngle={Math.PI / 2.1} />

          {/* Floor */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 10]}>
            <planeGeometry args={[180, 180]} />
            <meshStandardMaterial color="#fdf5e6" opacity={0.6} transparent />
          </mesh>

          {/* 1. ANIMATION LAYER */}
          <AnimatedFlow
            rollRef={rollRef}
            cycle={cycle}
            onReset={() => setCycle((prev) => (prev < 3 ? prev + 1 : 4))}
            onRollLanded={(c) => {
              if (c === 0) setAgvTrigger(true);
              setLandedRolls((prev) => [...prev, c]);
            }}
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
                r.id === "Q-R1" ? (palletDropped && !pickedFromQ ? [] : [0]) :
                  r.id === "F2-R2" ? (returnedToInspection ? [] : [1]) : []
              }
            />
          ))}

          {/* Inspection Machines */}
          <InspectionMachine position={[17, 0, 52]} rotation={[-Math.PI / 2, Math.PI, Math.PI / 2]} scale={[2, 2, 2]} name="Inspection Machine 1" />
          <InspectionMachine
            position={[10, 0, 51.5]}
            rotation={[-Math.PI / 2, Math.PI, -Math.PI / 2]}
            scale={[2, 2, 2]}
            name="Inspection Machine 2"
            showLabel={showInspectionText}
            labelText="Vision based inspection 4.0"
          />
          <FabricRollPallet position={[22, 0, 45]} rollColor={PALETTE[5]} rotation={[0, 0, 0]} />
          {(!palletPicked2 || (palletDropped2 && !returnedToInspection)) && (
            <FabricRollPallet
              position={[8, 0, 45]}
              rollColor={palletDropped2 ? PALETTE[13] : PALETTE[8]}
              rotation={[0, 0, 0]}
            />
          )}

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
          <StandingOperator position={[12, 0, 59]} rotation={[0, Math.PI / 2, 0]} />
          <ScannerOperator position={[-12, 0, 31]} rotation={[0, Math.PI, 0]} stopped={palletDropped2} ref={scanner2Ref} />
          <QRScannerStation position={[14, 0, 59]} rotation={[0, -Math.PI / 2, 0]} scale={[1.2, 1.2, 1.2]} />
          <MonitoringTV position={[5, 0, 63]} rotation={[0, Math.PI, 0]} scale={[1.4, 1.4, 1.4]} image="/models/tv1.jpeg" />
          <MonitoringTV position={[-9, 0, 62]} rotation={[0, Math.PI / 2, 0]} scale={[1.4, 1.4, 1.4]} image="/models/tv2.jpeg" />


          {/* Accurate AGVs */}
          {/* Task AGV: Pick up first pallet */}
          <PickingAGV
            ref={agv1Ref}
            startPos={[-21.5, 0, 55]}
            palletPos={[-15.5, 0, 64.1]}
            targetPos={[-14.9, 0, 28.65]}
            onPick={() => setPalletPicked(true)}
            onDrop={() => setPalletDropped(true)}
            name="AGV 1"
            rollColor={PALETTE[13]}
            palletRotation={Math.PI / 2}
            pivot180={true}
            trigger={agvTrigger && !palletDropped2 ? true : (palletDropped2 ? "STOP" : false)}
            cycle={cycle}
          />
          <PickingAGV
            ref={agv2Ref}
            startPos={[14, 0, 40]}
            palletPos={[8, 0, 45]}
            targetPos={[-5.1, 0, 8.65]}   // Dropped pallet center for F2-R2 (Right-Front Bottom)
            onPick={(type) => {
              if (type === "Q-FETCH") {
                setPickedFromQ(true);
              } else {
                setPalletPicked2(true);
                setPalletDropped2(false); // Clear drop flag to allow transit phase
                setShowInspectionText(true);
                setTimeout(() => setShowInspectionText(false), 5000);
              }
            }}
            onDrop={(type) => {
              if (type === "RETURNED") setPalletDropped2(true);
              else setReturnedToInspection(true);
            }}
            trigger={agv2DelayedStart}
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
                  cycle === 2 ? [0, 1] :
                    cycle === 3 ? [-1, 0] : []
            }
          />
          <QRWorkstation rollRef={rollRef} position={[-11.0, 0, 70]} rotation={[0, -Math.PI / 2, 0]} scale={[2, 2, 2]} stopped={palletDropped2} ref={scanner1Ref} />
          <AutoScannerShed rollRef={rollRef} position={[-14.0, 0, 67.5]} />
          {/* STANDALONE PALLETS WITH UNIQUE COLORS */}
          <group position={[-15.5, 0, 59.3]} rotation={[0, -Math.PI / 2, 0]}>
            {[0, 1, 2, 3].map((i) => {
              // i=3 is the first pallet from the truck side
              if (i === 3 && palletPicked) return null;
              return (
                <FabricRollPallet
                  key={`truck-pal-${i}`}
                  position={[i * 1.6, 0, 0]}
                  rotation={[0, Math.PI / 2, 0]}
                  rollColor={PALETTE[(i + 10) % PALETTE.length]}
                  emptySlot={landedRolls.includes(3 - i) ? null : 7} // Slot 7 fills up when roll lands
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
            <group position={[8.0, 0, 45]} rotation={[0, Math.PI, 0]} scale={[1, 1, 1]}>
              <FabricRollPallet rollColor={PALETTE[13]} />
            </group>
          )}
          {returnedToInspection && (
            <group position={[-5.1, 0, 8.65]} rotation={[0, 0, 0]} scale={[1, 1, 1]}>
              <FabricRollPallet rollColor={PALETTE[8]} />
            </group>
          )}

          {/* Truck */}
          <Truck position={[-14, 0, 90]} />
        </Suspense>
      </Canvas>
    </Wrapper>
  );
}