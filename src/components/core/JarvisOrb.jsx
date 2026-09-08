import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'

/**
 * JarvisOrb
 * 1:1 Clone of the official Jarvis 3D WebGL particle sphere from ethanplusai/jarvis.
 * Renders 2,000 holographic cyan particles in a floating sphere with dynamic line
 * interconnects, traveling electrons during thought/processing, and audio responsiveness.
 */
export default function JarvisOrb({
  status = 'idle',
  intensity = 0,
  className = '',
  size = 540
}) {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const stateRef = useRef(status)
  const intensityRef = useRef(intensity)

  useEffect(() => {
    stateRef.current = status
  }, [status])

  useEffect(() => {
    intensityRef.current = intensity
  }, [intensity])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let destroyed = false
    const N = 2000

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(size, size)
    renderer.setClearColor(0x000000, 0)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 1, 1, 1000)
    camera.position.z = 75

    // Particles
    const geo = new THREE.BufferGeometry()
    const pos = new Float32Array(N * 3)
    const vel = new Float32Array(N * 3)
    const phase = new Float32Array(N)

    for (let i = 0; i < N; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = Math.pow(Math.random(), 0.5) * 25
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      pos[i * 3 + 2] = r * Math.cos(phi)
      phase[i] = Math.random() * 1000
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))

    const mat = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.52,
      transparent: true,
      opacity: 0.8,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })

    const points = new THREE.Points(geo, mat)
    scene.add(points)

    // Connection lines
    const MAX_LINES = 8000
    const linePos = new Float32Array(MAX_LINES * 6)
    const lineGeo = new THREE.BufferGeometry()
    lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3))
    lineGeo.setDrawRange(0, 0)

    const lineMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })

    const lines = new THREE.LineSegments(lineGeo, lineMat)
    scene.add(lines)

    // Electrons
    const MAX_ELECTRONS = 200
    const electronGeo = new THREE.BufferGeometry()
    const electronPos = new Float32Array(MAX_ELECTRONS * 3)
    electronGeo.setAttribute('position', new THREE.BufferAttribute(electronPos, 3))
    electronGeo.setDrawRange(0, 0)

    const electronMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.0,
      transparent: true,
      opacity: 1.0,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })

    const electrons = new THREE.Points(electronGeo, electronMat)
    scene.add(electrons)

    const activeElectrons = []
    let electronSpawnRate = 0
    let targetElectronRate = 0
    let lastElectronSpawn = 0
    let activeConnections = []

    let targetRadius = 25
    let currentRadius = 25
    let targetSpeed = 0.3
    let currentSpeed = 0.3
    let targetBright = 0.6
    let currentBright = 0.6
    let targetSize = 0.4
    let currentSize = 0.4
    let lineAmount = 0
    let targetLineAmount = 0
    const lineDistance = 8

    let spinX = 0
    let spinY = 0
    let spinZ = 0
    let transitionEnergy = 0
    let lastState = 'idle'

    let cloudZ = 0
    let cloudZVel = 0

    const startTime = performance.now()

    function animate() {
      if (destroyed) return
      requestAnimationFrame(animate)
      const t = (performance.now() - startTime) * 0.001
      const currentState = stateRef.current || 'idle'
      const curIntensity = intensityRef.current || 0

      switch (currentState) {
        case 'idle':
          targetRadius = 27
          targetSpeed = 0.22
          targetBright = 0.55
          targetSize = 0.38
          targetLineAmount = 0.18
          targetElectronRate = 0
          break
        case 'listening':
          targetRadius = 23
          targetSpeed = 0.32
          targetBright = 0.75
          targetSize = 0.42
          targetLineAmount = 0.45
          targetElectronRate = 0
          break
        case 'thinking':
          targetRadius = 17
          targetSpeed = 0.55
          targetBright = 0.85
          targetSize = 0.32
          targetLineAmount = 1.0
          targetElectronRate = 0.02
          break
        case 'speaking':
          targetRadius = 19 + curIntensity * 6
          targetSpeed = 0.25
          targetBright = 0.8
          targetSize = 0.45
          targetLineAmount = 0.85
          targetElectronRate = 0
          break
        default:
          targetRadius = 25
          targetSpeed = 0.25
          targetBright = 0.6
          targetSize = 0.4
          targetLineAmount = 0.2
          targetElectronRate = 0
          break
      }

      currentRadius += (targetRadius - currentRadius) * 0.03
      currentSpeed += (targetSpeed - currentSpeed) * 0.03
      currentBright += (targetBright - currentBright) * 0.03
      currentSize += (targetSize - currentSize) * 0.03
      lineAmount += (targetLineAmount - lineAmount) * 0.03
      electronSpawnRate += (targetElectronRate - electronSpawnRate) * 0.03

      if (currentState !== lastState) {
        transitionEnergy = 1.0
        lastState = currentState
      }
      transitionEnergy *= 0.985
      if (transitionEnergy > 0.05) {
        spinX += transitionEnergy * 0.012 * Math.sin(t * 1.7)
        spinY += transitionEnergy * 0.015
        spinZ += transitionEnergy * 0.008 * Math.cos(t * 1.3)
      } else {
        spinX += 0.001 * currentSpeed
        spinY += 0.002 * currentSpeed
      }

      const bass = curIntensity * 0.9
      const mid = curIntensity * 0.7

      let zTarget = Math.sin(t * 0.12) * 6
      if (currentState === 'thinking') {
        zTarget = Math.sin(t * 0.3) * 12 + Math.sin(t * 0.9) * 5
      } else if (currentState === 'speaking') {
        zTarget = Math.sin(t * 0.15) * 5 - bass * 8
      }
      cloudZVel += (zTarget - cloudZ) * 0.01
      cloudZVel *= 0.94
      cloudZ += cloudZVel

      points.rotation.x = spinX
      points.rotation.y = spinY
      points.rotation.z = spinZ
      points.position.z = cloudZ

      lines.rotation.x = spinX
      lines.rotation.y = spinY
      lines.rotation.z = spinZ
      lines.position.z = cloudZ

      const p = geo.getAttribute('position')
      const a = p.array

      for (let i = 0; i < N; i++) {
        const i3 = i * 3
        const x = a[i3]
        const y = a[i3 + 1]
        const z = a[i3 + 2]
        const px = phase[i]

        vel[i3] += Math.sin(t * 0.05 + px) * 0.001 * currentSpeed
        vel[i3 + 1] += Math.cos(t * 0.06 + px * 1.3) * 0.001 * currentSpeed
        vel[i3 + 2] += Math.sin(t * 0.055 + px * 0.7) * 0.001 * currentSpeed

        vel[i3] += Math.sin(t * 0.02 + px * 2.1 + y * 0.1) * 0.0008 * currentSpeed
        vel[i3 + 1] += Math.cos(t * 0.025 + px * 1.7 + z * 0.1) * 0.0008 * currentSpeed
        vel[i3 + 2] += Math.sin(t * 0.022 + px * 0.9 + x * 0.1) * 0.0008 * currentSpeed

        const dist = Math.sqrt(x * x + y * y + z * z) || 0.01
        const pull = Math.max(0, dist - currentRadius) * 0.002 + 0.0003
        vel[i3] -= (x / dist) * pull
        vel[i3 + 1] -= (y / dist) * pull
        vel[i3 + 2] -= (z / dist) * pull

        if (bass > 0.05) {
          vel[i3] += (x / dist) * bass * 0.025
          vel[i3 + 1] += (y / dist) * bass * 0.025
          vel[i3 + 2] += (z / dist) * bass * 0.025
        }
        if (currentState === 'speaking' && mid > 0.1) {
          const pulse = Math.sin(t * 8 + px)
          vel[i3] += (x / dist) * mid * 0.015 * pulse
          vel[i3 + 1] += (y / dist) * mid * 0.015 * pulse
        }

        vel[i3] *= 0.992
        vel[i3 + 1] *= 0.992
        vel[i3 + 2] *= 0.992

        a[i3] += vel[i3]
        a[i3 + 1] += vel[i3 + 1]
        a[i3 + 2] += vel[i3 + 2]
      }
      p.needsUpdate = true

      if (lineAmount > 0.01) {
        const lp = lineGeo.getAttribute('position')
        const la = lp.array
        let lineCount = 0
        const maxDist = lineDistance * (1 + bass * 0.4)
        const maxDistSq = maxDist * maxDist
        const step = Math.max(1, Math.floor(N / 500))

        for (let i = 0; i < N && lineCount < MAX_LINES; i += step) {
          const i3 = i * 3
          const x1 = a[i3]
          const y1 = a[i3 + 1]
          const z1 = a[i3 + 2]
          for (let j = i + step; j < N && lineCount < MAX_LINES; j += step) {
            const j3 = j * 3
            const dx = a[j3] - x1
            const dy = a[j3 + 1] - y1
            const dz = a[j3 + 2] - z1
            if (dx * dx + dy * dy + dz * dz < maxDistSq) {
              const idx = lineCount * 6
              la[idx] = x1
              la[idx + 1] = y1
              la[idx + 2] = z1
              la[idx + 3] = a[j3]
              la[idx + 4] = a[j3 + 1]
              la[idx + 5] = a[j3 + 2]
              lineCount++
            }
          }
        }
        lineGeo.setDrawRange(0, lineCount * 2)
        lp.needsUpdate = true
        lineMat.opacity = lineAmount * 0.16

        activeConnections = []
        for (let c = 0; c < Math.min(lineCount, 400); c++) {
          const ci = c * 6
          activeConnections.push({
            x1: la[ci],
            y1: la[ci + 1],
            z1: la[ci + 2],
            x2: la[ci + 3],
            y2: la[ci + 4],
            z2: la[ci + 5]
          })
        }
      } else {
        lineGeo.setDrawRange(0, 0)
        activeConnections = []
      }

      if (activeConnections.length > 0 && electronSpawnRate > 0.005) {
        if (activeElectrons.length < 4 && t - lastElectronSpawn > 0.8) {
          const conn = activeConnections[Math.floor(Math.random() * activeConnections.length)]
          activeElectrons.push({
            sx: conn.x1,
            sy: conn.y1,
            sz: conn.z1,
            ex: conn.x2,
            ey: conn.y2,
            ez: conn.z2,
            t: 0,
            speed: 0.004 + Math.random() * 0.004
          })
          lastElectronSpawn = t
        }
      }

      const ep = electronGeo.getAttribute('position')
      const ea = ep.array
      let aliveCount = 0

      for (let e = activeElectrons.length - 1; e >= 0; e--) {
        const el = activeElectrons[e]
        el.t += el.speed
        if (el.t >= 1) {
          activeElectrons.splice(e, 1)
          continue
        }
        const ei = aliveCount * 3
        ea[ei] = el.sx + (el.ex - el.sx) * el.t
        ea[ei + 1] = el.sy + (el.ey - el.sy) * el.t
        ea[ei + 2] = el.sz + (el.ez - el.sz) * el.t
        aliveCount++
      }

      electronGeo.setDrawRange(0, aliveCount)
      ep.needsUpdate = true

      electrons.rotation.x = spinX
      electrons.rotation.y = spinY
      electrons.rotation.z = spinZ
      electrons.position.z = cloudZ

      mat.opacity = currentBright + bass * 0.1
      mat.size = currentSize + bass * 0.08

      if (currentState === 'thinking') {
        mat.color.lerp(new THREE.Color(0x6ec4ff), 0.02)
        lineMat.color.lerp(new THREE.Color(0x6ec4ff), 0.02)
      } else if (currentState === 'speaking') {
        mat.color.lerp(new THREE.Color(0x5ab8f0), 0.02)
        lineMat.color.lerp(new THREE.Color(0x5ab8f0), 0.02)
      } else if (currentState === 'listening') {
        mat.color.lerp(new THREE.Color(0x38bdf8), 0.02)
        lineMat.color.lerp(new THREE.Color(0x38bdf8), 0.02)
      } else {
        mat.color.lerp(new THREE.Color(0x4ca8e8), 0.02)
        lineMat.color.lerp(new THREE.Color(0x4ca8e8), 0.02)
      }

      camera.position.x = Math.sin(t * 0.02) * 4
      camera.position.y = Math.cos(t * 0.03) * 3
      camera.lookAt(0, 0, cloudZ * 0.2)

      renderer.render(scene, camera)
    }

    animate()

    return () => {
      destroyed = true
      renderer.dispose()
      geo.dispose()
      mat.dispose()
      lineGeo.dispose()
      lineMat.dispose()
      electronGeo.dispose()
      electronMat.dispose()
    }
  }, [size])

  return (
    <div
      ref={containerRef}
      className={`relative flex items-center justify-center select-none ${className}`}
      style={{ width: `${size}px`, height: `${size}px` }}
    >
      <div
        className="absolute rounded-full pointer-events-none transition-opacity duration-700 blur-2xl"
        style={{
          width: `${size * 0.75}px`,
          height: `${size * 0.75}px`,
          backgroundColor:
            status === 'speaking'
              ? 'rgba(56, 189, 248, 0.22)'
              : status === 'listening'
                ? 'rgba(14, 165, 233, 0.18)'
                : status === 'thinking'
                  ? 'rgba(125, 211, 252, 0.25)'
                  : 'rgba(56, 189, 248, 0.08)'
        }}
      />
      <canvas ref={canvasRef} className="relative z-10 w-full h-full cursor-grab active:cursor-grabbing" />
    </div>
  )
}
