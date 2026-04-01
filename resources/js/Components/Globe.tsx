import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

export default function Globe() {
    const mountRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!mountRef.current) return;

        // 1. Setup Scene, Camera, Renderer
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); // alpha allows background to show

        renderer.setSize(window.innerWidth, window.innerHeight);
        mountRef.current.appendChild(renderer.domElement);

        // 2. Create Earth
        const geometry = new THREE.SphereGeometry(5, 32, 32);
        const textureLoader = new THREE.TextureLoader();
        const material = new THREE.MeshStandardMaterial({
            // Using updated valid texture paths
            map: textureLoader.load('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg'),
            bumpScale: 0.05,
        });
        const earth = new THREE.Mesh(geometry, material);
        scene.add(earth);

        // 3. Add Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(10, 10, 10);
        scene.add(ambientLight, directionalLight);

        // 4. Camera Controls
        camera.position.z = 12;
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;

        // 5. Animation Loop
        let animationFrameId: number;
        const animate = () => {
            animationFrameId = requestAnimationFrame(animate);
            earth.rotation.y += 0.001; // Spin effect
            controls.update();
            renderer.render(scene, camera);
        };
        animate();

        // 6. Handle Window Resize
        const handleResize = () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        };
        window.addEventListener('resize', handleResize);

        // 7. Cleanup on Unmount (Crucial for React!)
        return () => {
            window.removeEventListener('resize', handleResize);
            cancelAnimationFrame(animationFrameId);
            if (mountRef.current) {
                mountRef.current.removeChild(renderer.domElement);
            }
            geometry.dispose();
            material.dispose();
            renderer.dispose();
        };
    }, []);

    return <div ref={mountRef} className="absolute inset-0 bg-black -z-10" />;
}
