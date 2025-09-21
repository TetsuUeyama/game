'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface ThreeJSCharacterProps {
  imageSrc: string;
  alt: string;
  width?: number;
  height?: number;
  rotationX?: number;
  rotationY?: number;
  enableShadow?: boolean;
  animateHover?: boolean;
}

export default function ThreeJSCharacter({
  imageSrc,
  alt,
  width = 50,
  height = 50,
  rotationX = -0.1,
  rotationY = 0.1,
  enableShadow = true,
  animateHover = false
}: ThreeJSCharacterProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    mesh: THREE.Mesh;
    animationId: number;
  } | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    // クリーンアップが確実に実行されるようにする
    const currentMount = mountRef.current;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });

    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    currentMount.appendChild(renderer.domElement);

    const loader = new THREE.TextureLoader();
    loader.load(
      imageSrc,
      (texture) => {
        const geometry = new THREE.PlaneGeometry(2, 2);
        const material = new THREE.MeshLambertMaterial({
          map: texture,
          transparent: true,
          side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(geometry, material);

        // 3D効果のためのライト設定
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(1, 1, 1);
        scene.add(directionalLight);

        // メッシュの位置と角度を調整（3D感を出すため）
        mesh.rotation.x = rotationX;
        mesh.rotation.y = rotationY;
        mesh.position.z = 0;

        // シャドウ設定
        if (enableShadow) {
          renderer.shadowMap.enabled = true;
          renderer.shadowMap.type = THREE.PCFSoftShadowMap;
          directionalLight.castShadow = true;
          mesh.receiveShadow = true;
        }

        scene.add(mesh);
        camera.position.set(0, 0, 3);
        camera.lookAt(0, 0, 0);

        renderer.render(scene, camera);

        sceneRef.current = {
          scene,
          camera,
          renderer,
          mesh,
          animationId: 0
        };
      },
      undefined,
      (error) => {
        console.error('Error loading texture:', error);
      }
    );

    return () => {
      // より確実なクリーンアップ
      if (renderer.domElement && currentMount.contains(renderer.domElement)) {
        currentMount.removeChild(renderer.domElement);
      }
      renderer.dispose();
      scene.clear();
      if (sceneRef.current) {
        sceneRef.current = null;
      }
    };
  }, [imageSrc, width, height]);

  return (
    <div
      ref={mountRef}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center'
      }}
      aria-label={alt}
    />
  );
}