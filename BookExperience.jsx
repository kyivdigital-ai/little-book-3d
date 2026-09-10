import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import * as THREE from 'three'

import frontUrl from './front.png'
import backUrl from './back.png'
import spineUrl from './spine.png'
import grainUrl from './paper-grain.png'
import pageEdgeUrl from './page-edge.png'

const clamp = THREE.MathUtils.clamp

// Real book proportions: 148 × 210 mm, spine 30.5 mm.
const BOOK = {
  width: 2.819,
  height: 4,
  depth: 0.581,
  coverThickness: 0.034,
  overhang: 0.025,
  pageInset: 0.045,
}

function prepareTexture(texture, renderer, options = {}) {
  const { repeat = false, isColor = true } = options

  if (isColor) texture.colorSpace = THREE.SRGBColorSpace

  texture.anisotropy = Math.min(
    16,
    renderer.capabilities.getMaxAnisotropy(),
  )
  texture.wrapS = repeat
    ? THREE.RepeatWrapping
    : THREE.ClampToEdgeWrapping
  texture.wrapT = repeat
    ? THREE.RepeatWrapping
    : THREE.ClampToEdgeWrapping
  texture.needsUpdate = true
}

function Book() {
  const book = useRef(null)
  const pointer = useRef({ x: 0, y: 0 })
  const drag = useRef({
    active: false,
    lastX: 0,
    lastY: 0,
    rotationX: 0,
    rotationY: 0,
  })
  const hovered = useRef(false)
  const { gl, viewport } = useThree()

  const [front, back, spine, grain, pageEdge] = useLoader(
    THREE.TextureLoader,
    [frontUrl, backUrl, spineUrl, grainUrl, pageEdgeUrl],
  )

  const isDesktop = viewport.width >= 5.2
  const baseScale = isDesktop
    ? Math.min(0.68, viewport.width / 5.9)
    : Math.min(0.62, viewport.width / 4.7)
  const baseX = isDesktop ? -0.85 : 0
  const baseY = isDesktop ? 0 : 0.12

  const pageWidth = BOOK.width - BOOK.pageInset * 2
  const pageHeight = BOOK.height - BOOK.pageInset * 2
  const pageDepth = BOOK.depth - BOOK.coverThickness * 2
  const coverWidth = BOOK.width + BOOK.overhang * 2
  const coverHeight = BOOK.height + BOOK.overhang * 2
  const frontZ = BOOK.depth / 2 + BOOK.coverThickness / 2

  const pageMaterials = useMemo(() => {
    const edge = new THREE.MeshStandardMaterial({
      color: '#eee8df',
      map: pageEdge,
      roughness: 1,
      metalness: 0,
    })
    const paper = new THREE.MeshStandardMaterial({
      color: '#f3eee7',
      roughness: 1,
      metalness: 0,
    })

    return [edge, edge, edge, edge, paper, paper]
  }, [pageEdge])

  useEffect(() => {
    prepareTexture(front, gl)
    prepareTexture(back, gl)
    prepareTexture(spine, gl)
    prepareTexture(grain, gl, { repeat: true, isColor: false })
    prepareTexture(pageEdge, gl, { repeat: true })

    grain.repeat.set(7, 10)
    pageEdge.repeat.set(1, 5)

    return () => {
      pageMaterials.forEach((material) => material.dispose())
    }
  }, [back, front, gl, grain, pageEdge, pageMaterials, spine])

  useEffect(() => {
    const onPointerMove = (event) => {
      pointer.current.x = (event.clientX / window.innerWidth) * 2 - 1
      pointer.current.y = (event.clientY / window.innerHeight) * 2 - 1

      if (!drag.current.active) return

      const dx = event.clientX - drag.current.lastX
      const dy = event.clientY - drag.current.lastY

      drag.current.rotationY += dx * 0.007
      drag.current.rotationX = clamp(
        drag.current.rotationX + dy * 0.004,
        -0.45,
        0.45,
      )

      drag.current.lastX = event.clientX
      drag.current.lastY = event.clientY
    }

    const stopDrag = () => {
      drag.current.active = false
      document.body.style.cursor = hovered.current ? 'grab' : ''
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('pointerup', stopDrag)
    window.addEventListener('pointercancel', stopDrag)

    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', stopDrag)
      window.removeEventListener('pointercancel', stopDrag)
      document.body.style.cursor = ''
    }
  }, [])

  const startDrag = (event) => {
    event.stopPropagation()
    drag.current.active = true
    drag.current.lastX = event.clientX
    drag.current.lastY = event.clientY
    document.body.style.cursor = 'grabbing'
  }

  useFrame((state, delta) => {
    if (!book.current) return

    const autoRotation = state.clock.getElapsedTime() * 0.12
    const targetRotationX = -pointer.current.y * 0.025 + drag.current.rotationX
    const targetRotationY = autoRotation + pointer.current.x * 0.04 + drag.current.rotationY
    const targetRotationZ = 0

    book.current.rotation.x = THREE.MathUtils.damp(book.current.rotation.x, targetRotationX, 7, delta)
    book.current.rotation.y = THREE.MathUtils.damp(book.current.rotation.y, targetRotationY, 7, delta)
    book.current.rotation.z = THREE.MathUtils.damp(book.current.rotation.z, targetRotationZ, 7, delta)

    book.current.position.x = THREE.MathUtils.damp(
      book.current.position.x,
      baseX + pointer.current.x * 0.025,
      7,
      delta,
    )
    book.current.position.y = THREE.MathUtils.damp(
      book.current.position.y,
      baseY - pointer.current.y * 0.018,
      7,
      delta,
    )
  })

  const coverBaseMaterial = {
    roughness: 0.88,
    metalness: 0,
    clearcoat: 0.025,
    clearcoatRoughness: 0.82,
    bumpScale: 0.009,
  }

  return (
    <group
      ref={book}
      position={[baseX, baseY, 0]}
      rotation={[0, 0, 0]}
      scale={baseScale}
      onPointerDown={startDrag}
      onPointerOver={(event) => {
        event.stopPropagation()
        hovered.current = true
        document.body.style.cursor = drag.current.active ? 'grabbing' : 'grab'
      }}
      onPointerOut={() => {
        hovered.current = false
        if (!drag.current.active) document.body.style.cursor = ''
      }}
    >
      <mesh material={pageMaterials} castShadow receiveShadow>
        <boxGeometry args={[pageWidth, pageHeight, pageDepth]} />
      </mesh>

      <mesh position={[0, 0, frontZ]} castShadow receiveShadow>
        <boxGeometry args={[coverWidth, coverHeight, BOOK.coverThickness]} />
        <meshPhysicalMaterial {...coverBaseMaterial} bumpMap={grain} color="#eccdd8" />
      </mesh>

      <mesh position={[0, 0, -frontZ]} castShadow receiveShadow>
        <boxGeometry args={[coverWidth, coverHeight, BOOK.coverThickness]} />
        <meshPhysicalMaterial {...coverBaseMaterial} bumpMap={grain} color="#eccdd8" />
      </mesh>

      <mesh position={[-coverWidth / 2, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[BOOK.coverThickness, coverHeight, BOOK.depth + BOOK.coverThickness]} />
        <meshPhysicalMaterial {...coverBaseMaterial} bumpMap={grain} color="#eccdd8" />
      </mesh>

      <mesh position={[0, 0, frontZ + BOOK.coverThickness / 2 + 0.002]}>
        <planeGeometry args={[coverWidth - 0.02, coverHeight - 0.02]} />
        <meshBasicMaterial map={front} toneMapped={false} />
      </mesh>

      <mesh
        position={[0, 0, -frontZ - BOOK.coverThickness / 2 - 0.002]}
        rotation={[0, Math.PI, 0]}
      >
        <planeGeometry args={[coverWidth - 0.02, coverHeight - 0.02]} />
        <meshBasicMaterial map={back} toneMapped={false} />
      </mesh>

      <mesh
        position={[-coverWidth / 2 - BOOK.coverThickness / 2 - 0.002, 0, 0]}
        rotation={[0, -Math.PI / 2, 0]}
      >
        <planeGeometry args={[BOOK.depth + BOOK.coverThickness - 0.01, coverHeight - 0.02]} />
        <meshBasicMaterial map={spine} toneMapped={false} />
      </mesh>
    </group>
  )
}

function Scene() {
  return (
    <>
      <ambientLight intensity={0.95} />
      <hemisphereLight args={['#fff9fb', '#5a414d', 1.1]} />

      <directionalLight
        position={[4.5, 6, 5.5]}
        intensity={2.8}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.1}
        shadow-camera-far={18}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
        shadow-bias={-0.00012}
      />

      <directionalLight position={[-4, 1, -3]} intensity={0.9} color="#e8d7ff" />

      <Suspense fallback={null}>
        <Book />
      </Suspense>

      <mesh position={[-0.55, -2.18, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[16, 16]} />
        <shadowMaterial transparent opacity={0.18} />
      </mesh>
    </>
  )
}

export default function BookExperience() {
  return (
    <section className="book-experience">
      <Canvas
        shadows
        dpr={[1.5, 3]}
        camera={{
          position: [0, 0.02, 9.1],
          fov: 30,
          near: 0.1,
          far: 50,
        }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
        }}
      >
        <Scene />
      </Canvas>
    </section>
  )
}
