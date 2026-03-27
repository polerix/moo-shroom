import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Game constants
const LOOP_RADIUS = 20;
const LOOP_WIDTH = 10;
const TRAIN_SPEED = 0.0015; // Increased speed
const ENERGY_TO_UPGRADE = 100;
const MUSHROOM_EXPLOSION_RADIUS = 5;

// Game state
let energy = 0;
let trainCars = 1;
let playerHealth = 1; // tied to train cars
let gameIsOver = false;

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
    if (!soundBuffers[name] || !audioContext) return;
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
scene.fog = new THREE.FogExp2(0x000000, 0.025); // Adjusted fog

// Lighting
const ambientLight = new THREE.AmbientLight(0x606080, 2);
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
const mobiusFunction = (u, v, target) => {
    // u goes from 0 to 2*PI, v goes from -1 to 1
    u *= Math.PI * 2;
    v *= LOOP_WIDTH / 2;

    const x = (LOOP_RADIUS + v * Math.cos(u / 2)) * Math.cos(u);
    const y = (LOOP_RADIUS + v * Math.cos(u / 2)) * Math.sin(u);
    const z = v * Math.sin(u / 2);

    target.set(x, y, z);
};

const mobiusGeometry = new THREE.ParametricGeometry(mobiusFunction, 128, 16);
const mobiusMaterial = new THREE.MeshStandardMaterial({
    map: metalTexture,
    color: 0x553333,
    side: THREE.DoubleSide
});
const mobiusStrip = new THREE.Mesh(mobiusGeometry, mobiusMaterial);
scene.add(mobiusStrip);

// Path for the train (center line of the strip)
const mobiusPath = new THREE.CatmullRomCurve3(
    Array.from({ length: 256 }, (_, i) => {
        const u = i / 255;
        const vec = new THREE.Vector3();
        mobiusFunction(u, 0, vec);
        return vec;
    }),
    true
);


// Player setup
const player = new THREE.Group();
scene.add(player);
const playerTurret = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0x00ff00, map: metalTexture })
);
playerTurret.position.y = 1;
// player.add(playerTurret) is done via mainCar

function createCannon(offsetX) {
    const cannon = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.2, 1),
        new THREE.MeshStandardMaterial({ color: 0xffffff, map: metalTexture })
    );
    cannon.position.set(offsetX, 0, 0.5);
    return cannon;
}
const mainCannon1 = createCannon(-0.3);
const mainCannon2 = createCannon(0.3);
playerTurret.add(mainCannon1, mainCannon2);


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
    if (enemies.length > 30) return;
    const enemy = new THREE.Mesh(enemyGeometry, enemyMaterial);

    const u = (playerProgress + 0.2 + Math.random() * 0.6) % 1.0;
    const v = (Math.random() - 0.5) * 2; // from -1 to 1

    const enemyObj = {
        mesh: enemy,
        u: u,
        v: v,
        health: 3,
        speed: TRAIN_SPEED * (0.5 + Math.random() * 0.5)
    };
    scene.add(enemy.mesh);
    enemies.push(enemyObj);
}

// Mushrooms
const mushrooms = [];
const mushroomGeometry = new THREE.CylinderGeometry(0.1, 0.3, 0.8, 8);
const wireframeMaterial = new THREE.MeshStandardMaterial({
    color: 0xffaaff,
    emissive: 0xffaaff,
    emissiveIntensity: 1,
    wireframe: true
});
const explosiveMaterial = new THREE.MeshStandardMaterial({
    color: 0xff0000,
    emissive: 0xff4444,
    emissiveIntensity: 2
});

function spawnMushroom() {
    const isExplosive = Math.random() > 0.5; // New mushrooms can be explosive type
    
    const mushroom = new THREE.Mesh(mushroomGeometry, wireframeMaterial.clone());
    
    const u = Math.random();
    const v = (Math.random() - 0.5) * 1.8; // -0.9 to 0.9, keep them off the very edge

    const mushroomObj = {
        mesh: mushroom,
        u: u,
        v: v,
        isEnergy: !isExplosive,
        isExplosive: isExplosive,
        growth: 0, // 0 to 1
    };
    
    scene.add(mushroom.mesh);
    mushrooms.push(mushroomObj);
}

for(let i=0; i<80; i++) spawnMushroom();

// Bullets
const bullets = [];
const bulletGeometry = new THREE.SphereGeometry(0.15, 8, 8);
const bulletMaterial = new THREE.MeshLambertMaterial({ color: 0x00ffff, emissive: 0x00ffff });

function fireBulletFromCannon(cannon) {
    const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
    const direction = new THREE.Vector3();
    cannon.getWorldDirection(direction);
    bullet.position.copy(cannon.getWorldPosition(new THREE.Vector3()));
    
    const bulletObj = {
        mesh: bullet,
        velocity: direction.multiplyScalar(1.5),
        life: 0
    };
    bullets.push(bulletObj);
    scene.add(bullet);
}

function fireBullet() {
    playSound('shoot');
    fireBulletFromCannon(mainCannon1);
    fireBulletFromCannon(mainCannon2);
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
    if (gameIsOver) return;
    if (trainCars > 1) {
        trainCars--;
        playerHealth = trainCars;
        const removedSegment = trainSegments.pop();
        train.remove(removedSegment.object);
        playSound('damage');
    } else {
        // Game Over logic
        gameIsOver = true;
        document.getElementById('info').innerHTML = "GAME OVER<br>Refresh to restart";
        playSound('damage');
        playSound('explode');
        // Simple explosion effect for player
        player.traverse(child => {
            if(child.material) child.material.color.set(0xff0000);
        });
    }
    updateUI();
}


// Animation loop
let playerProgress = 0;
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if(gameIsOver) {
        renderer.render(scene, camera);
        return;
    }

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
        
        // Correct orientation on the parametric surface
        const normal = new THREE.Vector3();
        const tempVec = new THREE.Vector3();
        mobiusFunction(segment.u, 0.01, tempVec);
        normal.copy(tempVec).sub(pos).normalize();
        segment.object.up.copy(normal);

        segment.object.lookAt(mobiusPath.getPointAt((segment.u + 0.01) % 1.0));
    });
    
    // The main player group follows the first car
    player.position.copy(trainSegments[0].object.position);
    player.quaternion.copy(trainSegments[0].object.quaternion);
    
    // Aim player turret
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const plane = new THREE.Plane();
    plane.setFromNormalAndCoplanarPoint(
        camera.getWorldDirection(plane.normal),
        playerTurret.getWorldPosition(new THREE.Vector3())
    );
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
                        life: 0,
                        isAuto: true,
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

        let hitSomething = false;

        // Bullet-enemy collision
        for (let j = enemies.length - 1; j >= 0; j--) {
            const enemy = enemies[j];
            if (bullet.mesh.position.distanceTo(enemy.mesh.position) < 0.8) {
                playSound('hit');
                scene.remove(bullet.mesh);
                bullets.splice(i, 1);
                hitSomething = true;
                enemy.health--;
                if (enemy.health <= 0) {
                    playSound('explode');
                    scene.remove(enemy.mesh);
                    enemies.splice(j, 1);
                }
                break; 
            }
        }
        if(hitSomething) continue;

        // Bullet-mushroom collision
        for (let j = mushrooms.length - 1; j >= 0; j--) {
            const mushroom = mushrooms[j];
            if (mushroom.isExplosive && mushroom.growth >= 1 && bullet.mesh.position.distanceTo(mushroom.mesh.position) < 1.0) {
                playSound('mushroom_explode');
                // Explode mushroom
                scene.remove(mushroom.mesh);
                const explosionPos = mushroom.mesh.position.clone();
                mushrooms.splice(j, 1);

                // Find nearby enemies and destroy them
                for (let k = enemies.length - 1; k >= 0; k--) {
                    const enemy = enemies[k];
                    if (enemy.mesh.position.distanceTo(explosionPos) < MUSHROOM_EXPLOSION_RADIUS) {
                         playSound('explode');
                         scene.remove(enemy.mesh);
                         enemies.splice(k, 1);
                    }
                }
                
                scene.remove(bullet.mesh);
                bullets.splice(i, 1);
                hitSomething = true;
                break;
            }
        }
    }

    // Update enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        enemy.u = (enemy.u + enemy.speed * delta * 100) % 1.0;
        
        mobiusFunction(enemy.u, enemy.v, enemy.mesh.position);
        
        // Make enemy look at player
        const tangent = mobiusPath.getTangentAt(enemy.u);
        const normal = new THREE.Vector3();
        const tempVec = new THREE.Vector3();
        mobiusFunction(enemy.u, enemy.v + 0.01, tempVec);
        normal.copy(tempVec).sub(enemy.mesh.position).normalize();
        enemy.mesh.up.copy(normal);
        enemy.mesh.lookAt(player.position);


        // Enemy-player collision
        if(enemy.mesh.position.distanceTo(player.position) < 2.0) {
            takeDamage();
            scene.remove(enemy.mesh);
            enemies.splice(i, 1);
        }
    }

    // Update and check player-mushroom collision
    for (let i = mushrooms.length - 1; i >= 0; i--) {
        const mushroom = mushrooms[i];

        // Growth logic
        if (mushroom.growth < 1) {
            mushroom.growth += delta * 0.1; // Takes 10 seconds to grow fully
            const scale = 0.5 + mushroom.growth * 0.5;
            mushroom.mesh.scale.set(scale, scale, scale);

            if (mushroom.growth >= 1) {
                mushroom.growth = 1;
                if(mushroom.isExplosive) {
                    mushroom.mesh.material = explosiveMaterial;
                } else {
                    mushroom.mesh.material = new THREE.MeshStandardMaterial({
                        map: mushroomTexture,
                        color: 0xffff00,
                        emissive: 0xffff00,
                        emissiveIntensity: 2,
                        wireframe: false
                    });
                }
            }
        }

        mobiusFunction(mushroom.u, mushroom.v, mushroom.mesh.position);
        
        const tangent = mobiusPath.getTangentAt(mushroom.u);
        const normal = new THREE.Vector3();
        const tempVec = new THREE.Vector3();
        mobiusFunction(mushroom.u, mushroom.v + 0.01, tempVec);
        normal.copy(tempVec).sub(mushroom.mesh.position).normalize();
        mushroom.mesh.up.copy(normal);
        mushroom.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), normal);


        if (player.position.distanceTo(mushroom.mesh.position) < 2.0) {
            if(mushroom.isEnergy && mushroom.growth >= 1) {
                energy += 25;
                playSound('collect');
                updateUI();
                scene.remove(mushroom.mesh);
                mushrooms.splice(i, 1);
            } else if (mushroom.isExplosive && mushroom.growth >= 1) {
                // Player hitting an explosive mushroom
                takeDamage();
                playSound('mushroom_explode');
                scene.remove(mushroom.mesh);
                mushrooms.splice(i, 1);
            }
        }
    }


    // Spawn new enemies periodically
    if (Math.random() < 0.015 && enemies.length < 50) {
        spawnEnemy();
    }
    // Spawn new mushrooms periodically
    if (Math.random() < 0.01 && mushrooms.length < 100) {
        spawnMushroom();
    }


    // Camera follow
    const idealOffset = new THREE.Vector3(0, 4, -15);
    const playerQuaternion = player.quaternion.clone();
    idealOffset.applyQuaternion(playerQuaternion);
    const idealLookat = player.position.clone();
    
    const cameraTargetPosition = player.position.clone().add(idealOffset);
    camera.position.lerp(cameraTargetPosition, 0.08);

    const lookAtTarget = new THREE.Vector3();
    lookAtTarget.copy(mobiusPath.getPointAt((playerProgress + 0.1) % 1.0)); // Look ahead on the track
    lookAtTarget.lerp(idealLookat, 0.2); // Blend with player position slightly
    camera.lookAt(lookAtTarget);
    
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
    loadSound('powerup', 'powerup.mp3'),
    loadSound('mushroom_explode', 'mushroom_explode.mp3')
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