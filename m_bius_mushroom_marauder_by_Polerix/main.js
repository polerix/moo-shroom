import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Game constants
const LOOP_RADIUS = 20;
const LOOP_WIDTH = 8;
const TRAIN_SPEED = 0.0005;
const ENERGY_TO_UPGRADE = 100;

// Game state
let energy = 0;
let trainCars = 1;
let playerHealth = 1; // tied to train cars

// DOM Elements
const energyDisplay = document.getElementById('energy-display');
const trainCarsDisplay = document.getElementById('train-cars-display');
const upgradeButton = document.getElementById('upgrade-button');

// Audio context for sound effects
const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const soundBuffers = {};

async function loadSound(name, url) {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    soundBuffers[name] = audioBuffer;
}

function playSound(name) {
    if (!soundBuffers[name]) return;
    const source = audioContext.createBufferSource();
    source.buffer = soundBuffers[name];
    source.connect(audioContext.destination);
    source.start(0);
}


// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
scene.fog = new THREE.FogExp2(0x000000, 0.015);

// Lighting
const ambientLight = new THREE.AmbientLight(0x404040, 2);
scene.add(ambientLight);
const pointLight = new THREE.PointLight(0xffffff, 2, 200);
scene.add(pointLight);

// Textures
const textureLoader = new THREE.TextureLoader();
const spaceTexture = textureLoader.load('space.png');
scene.background = spaceTexture;
const metalTexture = textureLoader.load('robot_metal.png');
metalTexture.wrapS = metalTexture.wrapT = THREE.RepeatWrapping;
const mushroomTexture = textureLoader.load('mushroom.png');


// Möbius strip geometry
function createMobiusGeometry(radius, width) {
    const path = new THREE.CatmullRomCurve3(
        Array.from({ length: 128 }, (_, i) => {
            const t = (i / 127) * Math.PI * 2;
            const x = Math.cos(t) * (radius + (width / 2) * Math.cos(t / 2));
            const y = Math.sin(t) * (radius + (width / 2) * Math.cos(t / 2));
            const z = (width / 2) * Math.sin(t / 2);
            return new THREE.Vector3(x, y, z);
        }),
        true
    );

    const geometry = new THREE.TubeGeometry(path, 256, 1, 8, true);
    return { geometry, path };
}

const { geometry: mobiusGeometry, path: mobiusPath } = createMobiusGeometry(LOOP_RADIUS, LOOP_WIDTH);
const mobiusMaterial = new THREE.MeshStandardMaterial({
    map: metalTexture,
    color: 0x553333,
    side: THREE.DoubleSide
});
const mobiusStrip = new THREE.Mesh(mobiusGeometry, mobiusMaterial);
scene.add(mobiusStrip);

// Player setup
const player = new THREE.Group();
scene.add(player);
const playerTurret = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0x00ff00, map: metalTexture })
);
playerTurret.position.y = 1.5;
player.add(playerTurret);
const turretCannon = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.2, 1),
    new THREE.MeshStandardMaterial({ color: 0xffffff, map: metalTexture })
);
turretCannon.position.z = 0.5;
playerTurret.add(turretCannon);

const train = new THREE.Group();
player.add(train);
function addTrainCar(position) {
    const car = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 1, 2.5),
        new THREE.MeshStandardMaterial({ color: 0x888888, map: metalTexture })
    );
    car.position.copy(position);
    train.add(car);
    return car;
}
const mainCar = addTrainCar(new THREE.Vector3(0,0,0));
playerTurret.position.y = 1;
mainCar.add(playerTurret);

let trainSegments = [
    { u: 0, object: mainCar, turret: playerTurret, isPlayer: true }
];

// Enemies
const enemies = [];
const enemyGeometry = new THREE.SphereGeometry(0.4, 8, 8);
const enemyMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, map: metalTexture });

function spawnEnemy() {
    if (enemies.length > 20) return;
    const enemy = new THREE.Mesh(enemyGeometry, enemyMaterial);
    const enemyObj = {
        mesh: enemy,
        u: (playerProgress + 0.2 + Math.random() * 0.6) % 1.0,
        offset: new THREE.Vector3( (Math.random() - 0.5) * LOOP_WIDTH, 1.5, 0),
        health: 3,
        speed: TRAIN_SPEED * (0.5 + Math.random() * 0.5)
    };
    scene.add(enemy.mesh);
    enemies.push(enemyObj);
}

// Mushrooms
const mushrooms = [];
const mushroomGeometry = new THREE.CylinderGeometry(0.1, 0.3, 0.8, 8);
function spawnMushroom() {
    const isEnergy = Math.random() > 0.8;
    const mushroomMaterial = new THREE.MeshStandardMaterial({
        map: mushroomTexture,
        color: isEnergy ? 0xffff00 : 0xffaaff,
        emissive: isEnergy ? 0xffff00 : 0x000000,
        emissiveIntensity: 2
    });
    const mushroom = new THREE.Mesh(mushroomGeometry, mushroomMaterial);
    const mushroomObj = {
        mesh: mushroom,
        u: Math.random(),
        isEnergy: isEnergy,
        offset: new THREE.Vector3((Math.random() - 0.5) * LOOP_WIDTH * 1.5, 0.4, 0)
    };
    
    const pos = mobiusPath.getPointAt(mushroomObj.u);
    const tangent = mobiusPath.getTangentAt(mushroomObj.u);
    const up = new THREE.Vector3(0, 1, 0).applyAxisAngle(tangent.normalize(), Math.PI/2); // crude up vector
    const posOnSurface = pos.clone().add(up.multiplyScalar(0.5));
    mushroom.position.copy(posOnSurface);
    mushroom.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), up);

    scene.add(mushroom.mesh);
    mushrooms.push(mushroomObj);
}

for(let i=0; i<50; i++) spawnMushroom();

// Bullets
const bullets = [];
const bulletGeometry = new THREE.SphereGeometry(0.15, 8, 8);
const bulletMaterial = new THREE.MeshLambertMaterial({ color: 0x00ffff, emissive: 0x00ffff });

function fireBullet() {
    playSound('shoot');
    const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
    const direction = new THREE.Vector3();
    turretCannon.getWorldDirection(direction);
    bullet.position.copy(turretCannon.getWorldPosition(new THREE.Vector3()));
    
    const bulletObj = {
        mesh: bullet,
        velocity: direction.multiplyScalar(1.5),
        life: 0
    };
    bullets.push(bulletObj);
    scene.add(bullet);
}

// Input handling
const mouse = new THREE.Vector2();
window.addEventListener('mousemove', (event) => {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
});

window.addEventListener('click', fireBullet);

upgradeButton.addEventListener('click', () => {
    if (energy >= ENERGY_TO_UPGRADE) {
        energy -= ENERGY_TO_UPGRADE;
        trainCars++;
        playerHealth = trainCars;
        
        const newCarU = (trainSegments[trainSegments.length-1].u - 0.02 + 1.0) % 1.0;
        const newCarObj = addTrainCar(new THREE.Vector3(0,0,0));
        
        // Add auto turret
        const autoTurret = new THREE.Mesh(
            new THREE.SphereGeometry(0.4, 12, 12),
            new THREE.MeshStandardMaterial({color: 0x00ffff, map: metalTexture})
        );
        autoTurret.position.y = 1;
        newCarObj.add(autoTurret);
        
        const autoCannon = new THREE.Mesh(
            new THREE.BoxGeometry(0.15, 0.15, 0.8),
            new THREE.MeshStandardMaterial({color: 0xffffff, map: metalTexture})
        );
        autoCannon.position.z = 0.4;
        autoTurret.add(autoCannon);

        trainSegments.push({
            u: newCarU,
            object: newCarObj,
            turret: autoTurret,
            isPlayer: false,
            fireCooldown: 0
        });
        playSound('powerup');
        updateUI();
    }
});


// Game logic updates
function updateUI() {
    energyDisplay.textContent = `Energy: ${Math.floor(energy)}`;
    trainCarsDisplay.textContent = `Health (Cars): ${trainCars}`;
    if (energy >= ENERGY_TO_UPGRADE) {
        upgradeButton.style.display = 'block';
    } else {
        upgradeButton.style.display = 'none';
    }
}

function takeDamage() {
    if (trainCars > 1) {
        trainCars--;
        playerHealth = trainCars;
        const removedSegment = trainSegments.pop();
        train.remove(removedSegment.object);
        playSound('damage');
    } else {
        // Game Over logic
        console.log("Game Over");
        // For now, just reset
        location.reload();
    }
    updateUI();
}


// Animation loop
let playerProgress = 0;
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    // Move player along the path
    playerProgress = (playerProgress + TRAIN_SPEED) % 1.0;
    
    trainSegments[0].u = playerProgress;
    for (let i = 1; i < trainSegments.length; i++) {
        const leaderU = trainSegments[i-1].u;
        const followerU = trainSegments[i].u;
        const diff = (leaderU - followerU + 1.5) % 1.0 - 0.5; // handle wraparound
        if (Math.abs(diff) > 0.021) {
             trainSegments[i].u = (trainSegments[i].u + diff * 0.1) % 1.0;
        }
    }

    trainSegments.forEach(segment => {
        const pos = mobiusPath.getPointAt(segment.u);
        const tangent = mobiusPath.getTangentAt(segment.u);
        segment.object.position.copy(pos);
        segment.object.lookAt(pos.clone().add(tangent));
        segment.object.position.y -= 0.5; // sit on the track
    });
    
    // The main player group follows the first car
    player.position.copy(trainSegments[0].object.position);
    player.quaternion.copy(trainSegments[0].object.quaternion);
    
    // Aim player turret
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    player.getWorldQuaternion(plane.normal);
    plane.constant = -player.position.dot(plane.normal);
    const intersectPoint = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, intersectPoint);
    if (intersectPoint) {
        playerTurret.lookAt(intersectPoint);
    }

    // Update auto-turrets
    trainSegments.forEach(segment => {
        if (!segment.isPlayer && enemies.length > 0) {
            segment.fireCooldown -= delta;
            
            let closestEnemy = null;
            let minDistance = 50;
            enemies.forEach(enemy => {
                const dist = segment.turret.getWorldPosition(new THREE.Vector3()).distanceTo(enemy.mesh.position);
                if (dist < minDistance) {
                    minDistance = dist;
                    closestEnemy = enemy;
                }
            });

            if (closestEnemy) {
                segment.turret.lookAt(closestEnemy.mesh.position);
                if(segment.fireCooldown <= 0) {
                    // fire bullet from auto turret
                    playSound('shoot_auto');
                    const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
                    const direction = new THREE.Vector3();
                    segment.turret.children[0].getWorldDirection(direction);
                    bullet.position.copy(segment.turret.children[0].getWorldPosition(new THREE.Vector3()));
                    
                    const bulletObj = {
                        mesh: bullet,
                        velocity: direction.multiplyScalar(1),
                        life: 0
                    };
                    bullets.push(bulletObj);
                    scene.add(bullet);
                    segment.fireCooldown = 0.5; // Cooldown for auto turret
                }
            }
        }
    });

    // Update bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        bullet.mesh.position.add(bullet.velocity.clone().multiplyScalar(delta * 60));
        bullet.life += delta;

        if (bullet.life > 5) {
            scene.remove(bullet.mesh);
            bullets.splice(i, 1);
            continue;
        }

        // Bullet-enemy collision
        for (let j = enemies.length - 1; j >= 0; j--) {
            const enemy = enemies[j];
            if (bullet.mesh.position.distanceTo(enemy.mesh.position) < 0.8) {
                playSound('hit');
                scene.remove(bullet.mesh);
                bullets.splice(i, 1);
                enemy.health--;
                if (enemy.health <= 0) {
                    playSound('explode');
                    scene.remove(enemy.mesh);
                    enemies.splice(j, 1);
                }
                break; // a bullet can only hit one enemy
            }
        }
    }

    // Update enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        enemy.u = (enemy.u + enemy.speed) % 1.0;
        
        const pos = mobiusPath.getPointAt(enemy.u);
        const tangent = mobiusPath.getTangentAt(enemy.u);
        const normal = new THREE.Vector3(0,0,1).applyQuaternion(mobiusStrip.quaternion);

        enemy.mesh.position.copy(pos).add(enemy.offset);
        enemy.mesh.lookAt(player.position);

        // Enemy-player collision
        if(enemy.mesh.position.distanceTo(player.position) < 2.0) {
            takeDamage();
            scene.remove(enemy.mesh);
            enemies.splice(i, 1);
        }
    }

    // Player-mushroom collision
    for (let i = mushrooms.length - 1; i >= 0; i--) {
        const mushroom = mushrooms[i];
        if (player.position.distanceTo(mushroom.mesh.position) < 2.0) {
            if(mushroom.isEnergy) {
                energy += 25;
                playSound('collect');
                updateUI();
            }
            scene.remove(mushroom.mesh);
            mushrooms.splice(i, 1);
        }
    }


    // Spawn new enemies periodically
    if (Math.random() < 0.01) {
        spawnEnemy();
    }

    // Camera follow
    const idealOffset = new THREE.Vector3(0, 5, -12);
    idealOffset.applyQuaternion(player.quaternion);
    const idealLookat = player.position.clone();
    idealLookat.y += 2;
    
    const cameraTargetPosition = player.position.clone().add(idealOffset);
    camera.position.lerp(cameraTargetPosition, 0.05);
    camera.lookAt(idealLookat);
    pointLight.position.copy(camera.position);

    renderer.render(scene, camera);
}


// Load all sounds then start the game
Promise.all([
    loadSound('shoot', 'shoot.mp3'),
    loadSound('shoot_auto', 'shoot_auto.mp3'),
    loadSound('hit', 'hit.mp3'),
    loadSound('explode', 'explode.mp3'),
    loadSound('damage', 'damage.mp3'),
    loadSound('collect', 'collect.mp3'),
    loadSound('powerup', 'powerup.mp3')
]).then(() => {
    updateUI();
    animate();
});

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

