import * as THREE from 'three';

// --- Constants for intro timings ---
const INTRO_FADE_OUT_OVERLAY_DELAY = 500;
const INTRO_FADE_IN_TEXT_DELAY = 1000;
const INTRO_TEXT_VISIBLE_DURATION = 3000;
const INTRO_FADE_OUT_TEXT_DELAY = INTRO_FADE_IN_TEXT_DELAY + INTRO_TEXT_VISIBLE_DURATION;
const INTRO_END_DELAY = INTRO_FADE_OUT_TEXT_DELAY + 1000; // The time when you can hide the elements

// --- Getting intro elements ---
const introOverlay = document.getElementById('intro-overlay');
const introText = document.getElementById('intro-text');
const introAudio = document.getElementById('intro-audio');

// --- Other global variables ---
let scene, camera, renderer;
let glassCube;
let smokeSystem;
let lightTrails = [];
const clock = new THREE.Clock();

const TRAIL_MAX_POINTS = 150;
const FADE_DURATION = 1.5;
const BASE_LIGHT_HEIGHT = 18;

const lightSources = [
    { color: new THREE.Color(0x6a0dad), orbit: { ampX: 25, ampY: 5, ampZ: 20, freqX: 1.0, freqY: 1.5, freqZ: 1.2, phaseX: 0, phaseY: Math.PI / 2, phaseZ: 0, speed: 0.25, offsetZ: 0 }, trailColorStart: new THREE.Color(0x8a2be2), trailColorEnd: new THREE.Color(0x4b0082) },
    { color: new THREE.Color(0x00ff00), orbit: { ampX: 18, ampY: 6, ampZ: 15, freqX: 1.3, freqY: 1.0, freqZ: 1.8, phaseX: Math.PI / 3, phaseY: 0, phaseZ: Math.PI, speed: 0.35, offsetZ: 2 }, trailColorStart: new THREE.Color(0x32cd32), trailColorEnd: new THREE.Color(0x006400) },
    { color: new THREE.Color(0xff0000), orbit: { ampX: 12, ampY: 4, ampZ: 10, freqX: 2.0, freqY: 2.5, freqZ: 1.0, phaseX: Math.PI, phaseY: Math.PI / 4, phaseZ: Math.PI / 2, speed: 0.45, offsetZ: -3 }, trailColorStart: new THREE.Color(0xff4500), trailColorEnd: new THREE.Color(0x8b0000) },
    { color: new THREE.Color(0xff00ff), orbit: { ampX: 10, ampY: 5, ampZ: 10, freqX: 1.0, freqY: 1.0, freqZ: 2.2, phaseX: 0, phaseY: Math.PI, phaseZ: Math.PI / 3, speed: 0.5, offsetZ: -5 }, trailColorStart: new THREE.Color(0xff1493), trailColorEnd: new THREE.Color(0x8a2be2) }
];

const textureLoader = new THREE.TextureLoader();
let flareTexture = null;

// --- Starting initialization, intro, and animation ---
init();
startIntro(); // Starting the control of intro
animate();    // Starting the animation cycle Three.js

// --- Intro start function ---
function startIntro() {
    // This function now only controls the intro DOM elements

    // 1. Start the audio and start darkening the overlay
    setTimeout(() => {
        if (introOverlay) introOverlay.style.opacity = '0';
        if (introAudio) {
            introAudio.play().catch(error => {
                console.warn("Audio playback failed.", error);
            });
        }
    }, INTRO_FADE_OUT_OVERLAY_DELAY);

    // 2. The appearance of the text
    setTimeout(() => {
        if (introText) introText.classList.add('visible');
    }, INTRO_FADE_IN_TEXT_DELAY);

    // 3. Text disappearing
    setTimeout(() => {
        if (introText) introText.classList.remove('visible');
    }, INTRO_FADE_OUT_TEXT_DELAY);

    // 4. Completion of the intro - just hide the elements
    setTimeout(() => {
        if (introOverlay) introOverlay.style.display = 'none';
        if (introText) introText.style.display = 'none';
        console.log("Intro elements hidden.");
    }, INTRO_END_DELAY);
}

// --- Initialization function Three.js ---
function init() {
    // --- Scene, Fog, Camera ---
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.FogExp2(0x0a0a2a, 0.015);
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 60, 0);
    camera.lookAt(scene.position);

    // --- Renderer ---
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement); // Adding canvas to body

    // --- Lighting ---
    const ambientLight = new THREE.AmbientLight(0xaaaaaa, 1.5);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 50, 10);
    directionalLight.target = scene;
    scene.add(directionalLight);

    // --- Glass cube ---
    const cubeGeometry = new THREE.BoxGeometry(5, 5, 5);
    const cubeMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xffffff, reflectivity: 0.5, roughness: 0.1,
        transmission: 0.99, thickness: 2.5, ior: 1.25, clearcoat: 0, envMapIntensity: 1.5,
        side: THREE.DoubleSide
    });
    glassCube = new THREE.Mesh(cubeGeometry, cubeMaterial);
    glassCube.position.set(-5, 25, 10);
    scene.add(glassCube);

    // --- Columns ---
    const columnMaterial = new THREE.MeshStandardMaterial({
        roughness: 1, metalness: 0.1, vertexColors: true
    });
    const columnGroup = new THREE.Group();
    const numColumns = 100;
    const spreadRadius = 55;
    const columnBottomColor = new THREE.Color(0x202020);
    const columnTopColor = new THREE.Color(0xffffff);

    const placedColumnsData = []; // Array for storing data about placed columns ({x, z, radius})
    const MIN_DISTANCE_BETWEEN_COLUMNS = 3; // Minimum distance between *column centers*. Select the value.
    // Must be greater than the maximum column radius (maxSize / 2) + the desired clearance.
    // maxSize = 3, maxRadius = 1.5. Therefore, 3.5 will give at least 0.5 of the gap between the edges of the largest columns.
    const MAX_PLACEMENT_ATTEMPTS = 100; // Maximum number of attempts to find a place for one column (fuse)

    for (let i = 0; i < numColumns; i++) {
        let attempts = 0;
        let positionFound = false;

        // --- A CYCLE OF ATTEMPTS TO PLACE ONE COLUMN ---
        while (!positionFound && attempts < MAX_PLACEMENT_ATTEMPTS) {
            attempts++;

            // Generating parameters
            const height = Math.random() * 15 + 1;
            const size = Math.random() * 2 + 1;
            const currentRadius = size / 2; // Radius of the base of the current column
            const angle = Math.random() * Math.PI * 2;
            // Generating the radius so that the edge of the column does not extend beyond the spread Radius
            const maxPlacementRadius = spreadRadius - currentRadius;
            const radius = Math.random() * maxPlacementRadius;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;

            // Check the distance to the already placed columns
            let isOverlapping = false;
            for (const placedData of placedColumnsData) {
                const dx = x - placedData.x;
                const dz = z - placedData.z;
                const distanceSq = dx * dx + dz * dz; // Using the square of the distance for performance

                // Calculation of the minimum allowable square of the distance between the centers of THESE TWO columns
                // const minDistanceSq = Math.pow(currentRadius + placedData.radius + 0.5, 2); // 0.5 - minimum gap between the edges

                // OR a simpler check with a constant (less accurate)
                if (distanceSq < MIN_DISTANCE_BETWEEN_COLUMNS * MIN_DISTANCE_BETWEEN_COLUMNS) {
                    isOverlapping = true;
                    break; // Found an overlap, it makes no sense to check further
                }
            }

            // If the place is free
            if (!isOverlapping) {
                // --- Creating the geometry and mesh of the column ---
                const columnGeometry = new THREE.BoxGeometry(size, height, size);
                const positionAttribute = columnGeometry.attributes.position;
                const colors = [];
                const localYMin = -height / 2;
                const localYMax = height / 2;
                for (let j = 0; j < positionAttribute.count; j++) {
                    const y = positionAttribute.getY(j);
                    const normalizedY = (y - localYMin) / (localYMax - localYMin);
                    const vertexColor = columnBottomColor.clone().lerp(columnTopColor, normalizedY);
                    colors.push(vertexColor.r, vertexColor.g, vertexColor.b);
                }
                columnGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
                const column = new THREE.Mesh(columnGeometry, columnMaterial);
                // --- Column placement ---
                column.position.set(x, height / 2, z);
                columnGroup.add(column);

                // --- Saving the data about the placed column ---
                placedColumnsData.push({ x: x, z: z, radius: currentRadius });

                positionFound = true; // Position found, exit the while loop
            }
            // If is Overlapping = true, the while loop will repeat with new random coordinates
        }

        if (!positionFound) {
            console.warn(`Failed to place column ${i + 1} after ${MAX_PLACEMENT_ATTEMPTS} attempts. Perhaps the area is too densely filled or the MIN_DISTANCE_BETWEEN_COLUMNS is too large.`);
        }

    }

    scene.add(columnGroup);

    // --- Blue Smoke ---
    let smokeTexture = null;
    try { smokeTexture = textureLoader.load('smoke.png'); } catch (e) { console.warn("Load error: smoke.png"); }
    const smokeGeometry = new THREE.BufferGeometry();
    const smokeParticles = []; const numSmokeParticles = 250;
    const smokeSpread = spreadRadius;
    for (let i = 0; i < numSmokeParticles; i++) {
        const x = (Math.random() - 0.5) * smokeSpread * 2;
        const y = Math.random() * 12 + 1;
        const z = (Math.random() - 0.5) * smokeSpread * 2;
        smokeParticles.push(x, y, z);
    }
    smokeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(smokeParticles, 3));
    const smokeMaterial = new THREE.PointsMaterial({
        color: 0x3366aa, map: smokeTexture, size: 30,
        transparent: true, opacity: 0.2,
        blending: THREE.NormalBlending, depthWrite: false, sizeAttenuation: true
    });
    smokeSystem = new THREE.Points(smokeGeometry, smokeMaterial);
    scene.add(smokeSystem);

    // --- Loading textures for ray heads ---
    try {
        flareTexture = textureLoader.load('flare.png');
        console.log("Flare texture loaded successfully.");
    } catch (e) {
        console.warn("Load error: flare.png");
    }

    // --- Glowing dots and tails ---
    lightSources.forEach(source => {
        const pointGeometry = new THREE.BufferGeometry();
        pointGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
        const pointMaterial = new THREE.PointsMaterial({
            color: source.color, map: flareTexture, size: 2.5,
            blending: THREE.AdditiveBlending, transparent: true, opacity: 1,
            depthWrite: false, sizeAttenuation: true
        });
        const lightHead = new THREE.Points(pointGeometry, pointMaterial);
        lightHead.position.set(source.orbit.ampX, BASE_LIGHT_HEIGHT, source.orbit.offsetZ);
        scene.add(lightHead);

        const trailGeometry = new THREE.BufferGeometry();
        const positions = new Float32Array(TRAIL_MAX_POINTS * 3);
        const colors = new Float32Array(TRAIL_MAX_POINTS * 3);
        trailGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        trailGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        const trailMaterial = new THREE.LineBasicMaterial({
            vertexColors: true, transparent: true, opacity: 1, linewidth: 2
        });
        const trailLine = new THREE.Line(trailGeometry, trailMaterial);
        scene.add(trailLine);

        lightTrails.push({
            source: source, mesh: lightHead, trail: trailLine,
            points: [], ages: [],
            headColor: source.trailColorStart || source.color,
            tailColor: source.trailColorEnd || new THREE.Color(0x000000)
        });
    });

    // --- Window resizing handler ---
    window.addEventListener('resize', onWindowResize, false);
}

// --- Resize ---
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- Light Trails Update ---
function updateLightTrails(deltaTime) {
    const time = clock.getElapsedTime();

    lightTrails.forEach(trailData => {
        const { source, mesh, trail, points, ages, headColor, tailColor } = trailData;
        const orbit = source.orbit;
        const currentTime = time * orbit.speed; // Time to calculate the orbit
        const x = orbit.ampX * Math.sin(orbit.freqX * currentTime + orbit.phaseX);
        const yOscillation = orbit.ampY * Math.sin(orbit.freqY * currentTime + orbit.phaseY);
        const z = orbit.ampZ * Math.cos(orbit.freqZ * currentTime + orbit.phaseZ) + orbit.offsetZ;
        const finalY = BASE_LIGHT_HEIGHT + yOscillation;
        mesh.position.set(x, finalY, z);

        points.unshift(mesh.position.clone());
        ages.unshift(0);
        while (points.length > TRAIL_MAX_POINTS) { points.pop(); ages.pop(); }

        const positionAttribute = trail.geometry.getAttribute('position');
        const colorAttribute = trail.geometry.getAttribute('color');
        let currentPointIndex = 0;
        for (let i = 0; i < points.length; i++) {
            ages[i] += deltaTime;
            if (ages[i] < FADE_DURATION) {
                positionAttribute.setXYZ(currentPointIndex, points[i].x, points[i].y, points[i].z);
                const lifeRatio = Math.max(0, 1.0 - ages[i] / FADE_DURATION);
                const currentColor = headColor.clone().lerp(tailColor, 1.0 - lifeRatio);
                colorAttribute.setXYZ(currentPointIndex, currentColor.r, currentColor.g, currentColor.b);
                currentPointIndex++;
            }
        }
        trail.geometry.setDrawRange(0, currentPointIndex);
        positionAttribute.needsUpdate = true;
        colorAttribute.needsUpdate = true;
        trail.geometry.computeBoundingSphere();
    });
}

// --- Animation ---
function animate() {
    requestAnimationFrame(animate);

    // --- Animation Logic ---
    const deltaTime = clock.getDelta(); // Getting the time
    const elapsedTime = clock.getElapsedTime(); // Get the total time since the beginning

    // Camera rotation
    const cameraRotationSpeed = 0.04;
    const cameraRadius = 10;
    camera.position.x = Math.cos(elapsedTime * cameraRotationSpeed) * cameraRadius;
    camera.position.z = Math.sin(elapsedTime * cameraRotationSpeed) * cameraRadius;
    camera.lookAt(scene.position);

    // Rotation of the glass cube
    if (glassCube) {
        glassCube.rotation.x += 0.005;
        glassCube.rotation.y += 0.008;
    }

    // Updating the glowing dots and their tails
    updateLightTrails(deltaTime);

    // --- Render ---
    renderer.render(scene, camera);
}