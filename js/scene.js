/* =========================================================
   FARIDA WORLD — CINEMATIC 3D SCENE
   galaxy fly-through → Earth approach → floating islands
   ========================================================= */

(function(){

"use strict";

if(!window.THREE) return;

var T = window.THREE;

/* ---------------- runtime state ---------------- */

var state = "idle"; /* idle | loading | cinematic | interactive | panel */

var container, canvas, cssEl;

var renderer, cssRenderer, scene, cssScene, camera;

var galaxy, stars, earth, clouds, atmosphere, sunSprite, islandGroup;

var islands = {};        /* id -> island object */
var islandList = [];     /* ordered */

var raycaster, pointer;

var camAnim = { x:0, y:0, z:0, lx:0, ly:0, lz:0 };
var useCamAnim = false;

/* orbit (interactive mode) */

var orbit = {
    theta:0.4,
    phi:0.32,
    radius:11.4,
    target:{ x:0, y:0.3, z:0 }
};

var drag = {
    active:false,
    startX:0,
    startY:0,
    moved:false,
    maxDist:0,
    theta0:0,
    phi0:0
};

var hoveredIsland = null;
var hoveredPort = null;      /* orbit light-port under the pointer */
var hoveredPlanet = false;
var openIslandId = null;
var visible = true;

var markers = {};            /* id -> planet orbit light-port mesh */

var timeline = null;

/* atmosphere systems */

var fireflies = null;
var dust = null;
var shoot = null;
var shootTimer = 200;

var listeners = {
    ready:[],
    travel:[],
    openPanel:[],
    closePanel:[],
    interactive:[],
    planet:[]
};

function emit(name, arg){
    (listeners[name] || []).forEach(function(fn){
        try{ fn(arg); }catch(err){}
    });
}


/* ---------------- helpers ---------------- */

function makeGlowTexture(inner, outer){

    var c = document.createElement("canvas");

    c.width = c.height = 128;

    var x = c.getContext("2d");

    var g = x.createRadialGradient(64,64,0,64,64,64);

    g.addColorStop(0, inner || "rgba(255,255,255,1)");
    g.addColorStop(0.4, outer || "rgba(255,255,255,.25)");
    g.addColorStop(1, "rgba(255,255,255,0)");

    x.fillStyle = g;
    x.fillRect(0,0,128,128);

    var tex = new T.CanvasTexture(c);

    tex.colorSpace = T.SRGBColorSpace;

    return tex;

}


function makeEmojiTexture(emoji){

    var c = document.createElement("canvas");

    c.width = c.height = 128;

    var x = c.getContext("2d");

    x.font = '86px "Segoe UI Emoji","Noto Color Emoji",sans-serif';

    x.textAlign = "center";
    x.textBaseline = "middle";

    x.fillText(emoji,64,68);

    var tex = new T.CanvasTexture(c);

    tex.colorSpace = T.SRGBColorSpace;

    return tex;

}


function jitterGeometry(geo, amount){

    var pos = geo.attributes.position;

    var v = new T.Vector3();

    for(var i = 0; i < pos.count; i++){

        v.fromBufferAttribute(pos,i);

        v.x += (Math.random() - 0.5) * amount;
        v.y += (Math.random() - 0.5) * amount * 0.6;
        v.z += (Math.random() - 0.5) * amount;

        pos.setXYZ(i,v.x,v.y,v.z);

    }

    geo.computeVertexNormals();

    return geo;

}


/* apparent-size-preserving scale for CSS3D objects */
/* so panels/labels read the same size at any distance */

function fitScale(pxHeight, fraction, distance, fov){

    var fovRad = (fov || camera.fov) * Math.PI / 180;

    var viewH = 2 * distance * Math.tan(fovRad / 2);

    return (viewH * fraction) / pxHeight;

}


/* =========================================================
   GALAXY
   ========================================================= */

function createGalaxy(){

    var COUNT = 3000;

    var R = 30;

    var pos = new Float32Array(COUNT * 3);
    var col = new Float32Array(COUNT * 3);

    var inside = new T.Color(0xf6e3b8);
    var mid = new T.Color(0xe8c98a);
    var outside = new T.Color(0x6a7fd4);

    /* two clean grand-design arms — reads as "designed", not noise */
    var branches = 2;
    var spin = 1.35;
    var spread = 0.16;

    for(var i = 0; i < COUNT; i++){

        var rr = Math.pow(Math.random(),0.8) * R;

        var branchAngle = (i % branches) / branches * Math.PI * 2;

        var spinAngle = rr * spin * 0.12;

        var rx = Math.pow(Math.random(),2) * (Math.random()<.5?1:-1) * spread * rr;
        var ry = Math.pow(Math.random(),2) * (Math.random()<.5?1:-1) * spread * rr * 0.16;
        var rz = Math.pow(Math.random(),2) * (Math.random()<.5?1:-1) * spread * rr;

        pos[i*3]   = Math.cos(branchAngle + spinAngle) * rr + rx;
        pos[i*3+1] = ry;
        pos[i*3+2] = Math.sin(branchAngle + spinAngle) * rr + rz;

        var mix = rr / R;

        var c = new T.Color();

        if(mix < 0.5) c.copy(inside).lerp(mid, mix * 2);
        else c.copy(mid).lerp(outside, (mix - 0.5) * 2);

        var d = 0.45 + Math.random() * 0.55;

        col[i*3]   = c.r * d;
        col[i*3+1] = c.g * d;
        col[i*3+2] = c.b * d;

    }

    var geo = new T.BufferGeometry();

    geo.setAttribute("position",new T.BufferAttribute(pos,3));
    geo.setAttribute("color",new T.BufferAttribute(col,3));

    var mat = new T.PointsMaterial({
        size:0.28,
        map:makeGlowTexture("rgba(255,255,255,1)","rgba(255,240,210,.3)"),
        vertexColors:true,
        transparent:true,
        opacity:0.85,
        depthWrite:false,
        blending:T.AdditiveBlending,
        sizeAttenuation:true
    });

    galaxy = new T.Points(geo,mat);

    galaxy.rotation.x = 0.3;

    scene.add(galaxy);

}


function createStars(){

    var COUNT = 900;

    var pos = new Float32Array(COUNT * 3);
    var col = new Float32Array(COUNT * 3);

    var palette = [
        [1,1,1],
        [1,0.94,0.82],
        [0.72,0.8,1],
        [0.95,0.78,0.84]
    ];

    for(var i = 0; i < COUNT; i++){

        var r = 80 + Math.random() * 95;

        var theta = Math.random() * Math.PI * 2;

        var phi = Math.acos(2 * Math.random() - 1);

        pos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
        pos[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
        pos[i*3+2] = r * Math.cos(phi);

        var c = palette[Math.floor(Math.random() * palette.length)];

        /* a few brighter "diamond" stars for focus */
        var d = (Math.random() < 0.06) ? (0.8 + Math.random() * 0.9) : (0.3 + Math.random() * 0.5);

        col[i*3]   = c[0] * d;
        col[i*3+1] = c[1] * d;
        col[i*3+2] = c[2] * d;

    }

    var geo = new T.BufferGeometry();

    geo.setAttribute("position",new T.BufferAttribute(pos,3));
    geo.setAttribute("color",new T.BufferAttribute(col,3));

    var mat = new T.PointsMaterial({
        size:0.5,
        map:makeGlowTexture(),
        vertexColors:true,
        transparent:true,
        opacity:0.85,
        depthWrite:false,
        blending:T.AdditiveBlending,
        sizeAttenuation:true
    });

    stars = new T.Points(geo,mat);

    scene.add(stars);

}


/* =========================================================
   EARTH + ATMOSPHERE + SUN
   ========================================================= */

/* When the page is opened over file:// (double-click), the browser
   blocks every texture fetch with CORS. So the planet ALWAYS gets a
   pretty procedural texture, and the real 2048 maps are used only
   when served over http(s). */

function makeEarthFallback(){

    var c = document.createElement("canvas");
    c.width = 1024;
    c.height = 512;

    var x = c.getContext("2d");

    var g = x.createLinearGradient(0,0,0,512);

    g.addColorStop(0,"#123a6e");
    g.addColorStop(0.35,"#0e3f86");
    g.addColorStop(0.5,"#114f94");
    g.addColorStop(0.65,"#0e3f86");
    g.addColorStop(1,"#123a6e");

    x.fillStyle = g;
    x.fillRect(0,0,1024,512);

    var land = ["#3f7d4a","#4f8a55","#6c9a5f","#b08d5a","#9a7a4a","#578f5a","#41607c"];

    for(var i = 0; i < 46; i++){

        var cx = Math.random() * 1024;
        var cy = 62 + Math.random() * 388;
        var r  = 15 + Math.random() * 32;
        var col = land[i % land.length];
        var a = 0.4 + Math.random() * 0.4;
        var blobs = 3 + Math.floor(Math.random() * 5);

        for(var b = 0; b < blobs; b++){

            var dx = (Math.random() - 0.5) * r * 1.7;
            var dy = (Math.random() - 0.5) * r * 1.7;
            var rr = r * (0.32 + Math.random() * 0.5);

            var grd = x.createRadialGradient(cx + dx,cy + dy,0,cx + dx,cy + dy,rr);

            grd.addColorStop(0,col);
            grd.addColorStop(1,"rgba(0,0,0,0)");

            x.globalAlpha = a;
            x.fillStyle = grd;
            x.beginPath();
            x.arc(cx + dx,cy + dy,rr,0,Math.PI * 2);
            x.fill();

        }

    }

    /* ice caps */

    for(var p = 0; p < 2; p++){

        var py = p === 0 ? 26 : 486;

        for(var s = 0; s < 30; s++){

            x.globalAlpha = 0.45 / Math.sqrt(s + 1);
            x.fillStyle = "#eef4ff";

            x.beginPath();
            x.arc(
                (s * 42 + Math.random() * 10) % 1024,
                py + (Math.random() - 0.5) * 20,
                14 + Math.random() * 24,
                0,Math.PI * 2
            );
            x.fill();

        }

    }

    x.globalAlpha = 0.05;

    for(var n = 0; n < 4000; n++){

        x.fillStyle = Math.random() < 0.5 ? "#ffffff" : "#ff9d5c";
        x.fillRect(Math.random() * 1024,Math.random() * 512,1.4,1.4);

    }

    x.globalAlpha = 1;

    return c;

}


function makeCloudsFallback(){

    var c = document.createElement("canvas");
    c.width = 1024;
    c.height = 512;

    var x = c.getContext("2d");

    for(var i = 0; i < 150; i++){

        var cx = Math.random() * 1024;
        var cy = 60 + Math.random() * 392;
        var r  = 26 + Math.random() * 60;

        x.globalAlpha = 0.05 + Math.random() * 0.07;
        x.fillStyle = "#ffffff";

        x.beginPath();
        x.arc(cx,cy,r,0,Math.PI * 2);
        x.fill();

    }

    x.globalAlpha = 1;

    return c;

}


function makeFlatNormalFallback(){

    var c = document.createElement("canvas");
    c.width = 2;
    c.height = 2;

    var x = c.getContext("2d");

    x.fillStyle = "rgb(128,128,255)";
    x.fillRect(0,0,2,2);

    return c;

}


function makeSpecFallback(){

    var c = document.createElement("canvas");
    c.width = 2;
    c.height = 2;

    var x = c.getContext("2d");

    x.fillStyle = "rgb(24,28,36)";
    x.fillRect(0,0,2,2);

    return c;

}


function guardedTexture(url, fallbackCanvas, srgb){

    var tex = new T.CanvasTexture(fallbackCanvas);

    tex.colorSpace = srgb ? T.SRGBColorSpace : T.NoColorSpace;

    tex.wrapS = T.RepeatWrapping;
    tex.wrapT = T.ClampToEdgeWrapping;

    /* only attempt the real file on http(s) — on file:// CORS always fails */
    if(location.protocol === "file:" || location.protocol === "") return tex;

    var img = new Image();

    img.crossOrigin = "anonymous";

    img.onload = function(){
        if(img.naturalWidth && img.naturalHeight){
            tex.image = img;
            tex.needsUpdate = true;
        }
    };

    img.onerror = function(){};

    img.src = url;

    return tex;

}


function createEarth(loader, onDone){

    var texDay   = guardedTexture("assets/earth/earth_atmos_2048.jpg", makeEarthFallback(), true);
    var texNorm  = guardedTexture("assets/earth/earth_normal_2048.jpg", makeFlatNormalFallback(), false);
    var texSpec  = guardedTexture("assets/earth/earth_specular_2048.jpg", makeSpecFallback(), false);
    var texCloud = guardedTexture("assets/earth/earth_clouds_1024.png", makeCloudsFallback(), true);

    var geo = new T.SphereGeometry(2,64,48);

    var mat = new T.MeshPhongMaterial({
        map:texDay,
        normalMap:texNorm,
        normalScale:new T.Vector2(0.55,0.55),
        specularMap:texSpec,
        specular:new T.Color(0x3a4a5a),
        shininess:12
    });

    earth = new T.Mesh(geo,mat);

    scene.add(earth);

    /* clouds */

    var cg = new T.SphereGeometry(2.05,48,32);

    var cm = new T.MeshPhongMaterial({
        map:texCloud,
        transparent:true,
        opacity:0.36,
        depthWrite:false
    });

    clouds = new T.Mesh(cg,cm);

    scene.add(clouds);

    /* atmosphere fresnel glow (back side) */

    var ag = new T.SphereGeometry(2.28,48,32);

    var am = new T.ShaderMaterial({

        uniforms:{
            glowColor:{ value:new T.Color(0x6f9bff) }
        },

        vertexShader:[
            "varying vec3 vNormal;",
            "varying vec3 vWorldPos;",
            "void main(){",
            "  vNormal = normalize(normalMatrix * normal);",
            "  vec4 wp = modelMatrix * vec4(position,1.0);",
            "  vWorldPos = wp.xyz;",
            "  gl_Position = projectionMatrix * viewMatrix * wp;",
            "}"
        ].join("\n"),

        fragmentShader:[
            "uniform vec3 glowColor;",
            "varying vec3 vNormal;",
            "varying vec3 vWorldPos;",
            "void main(){",
            "  vec3 viewDir = normalize(cameraPosition - vWorldPos);",
            "  float intensity = pow(0.62 - dot(vNormal, viewDir), 2.6);",
            "  gl_FragColor = vec4(glowColor, 1.0) * clamp(intensity, 0.0, 1.4);",
            "}"
        ].join("\n"),

        side:T.BackSide,
        blending:T.AdditiveBlending,
        transparent:true,
        depthWrite:false

    });

    atmosphere = new T.Mesh(ag,am);

    scene.add(atmosphere);

    onDone && onDone();

}


function createSun(){

    /* key light from the front-top-right so the camera side is lit */

    var sunPos = new T.Vector3(20,14,18);

    var light = new T.DirectionalLight(0xfff2dc,2.6);

    light.position.copy(sunPos);

    /* soft ground shadows around the islands */

    light.castShadow = true;
    light.shadow.mapSize.set(1024,1024);
    light.shadow.camera.near = 1;
    light.shadow.camera.far = 60;
    light.shadow.camera.left = -8;
    light.shadow.camera.right = 8;
    light.shadow.camera.top = 8;
    light.shadow.camera.bottom = -8;
    light.shadow.bias = -0.0004;

    scene.add(light);

    /* cool sky/ground fill so the night side is never pitch black */

    var hemi = new T.HemisphereLight(0x8fb4ff,0x201a30,0.55);

    scene.add(hemi);

    scene.add(new T.AmbientLight(0x2a3a5c,0.45));

    sunSprite = new T.Sprite(new T.SpriteMaterial({
        map:makeGlowTexture("rgba(255,248,225,1)","rgba(255,225,170,.35)"),
        transparent:true,
        opacity:0.95,
        depthWrite:false,
        blending:T.AdditiveBlending,
        fog:false
    }));

    sunSprite.position.copy(sunPos);

    sunSprite.scale.set(16,16,1);

    scene.add(sunSprite);

}


/* =========================================================
   ATMOSPHERE — fireflies, dust, nebulae, shooting star
   ========================================================= */

function createFireflies(){

    var COUNT = 120;

    var RING = 4.05;

    var pos = new Float32Array(COUNT * 3);

    for(var i = 0; i < COUNT; i++){

        var a = Math.random() * Math.PI * 2;

        var r = RING + (Math.random() - 0.5) * 1.4;

        pos[i*3]   = Math.cos(a) * r;
        pos[i*3+1] = (Math.random() - 0.5) * 1.6 + 0.6;
        pos[i*3+2] = Math.sin(a) * r;

    }

    var geo = new T.BufferGeometry();

    geo.setAttribute("position",new T.BufferAttribute(pos,3));

    var mat = new T.PointsMaterial({
        size:0.09,
        map:makeGlowTexture(
            "rgba(255,240,200,1)",
            "rgba(255,220,150,.3)"
        ),
        color:new T.Color(0xffe9b8),
        transparent:true,
        opacity:0.75,
        depthWrite:false,
        blending:T.AdditiveBlending,
        sizeAttenuation:true
    });

    fireflies = new T.Points(geo,mat);

    scene.add(fireflies);

}


function createDust(){

    var COUNT = 130;

    var pos = new Float32Array(COUNT * 3);
    var col = new Float32Array(COUNT * 3);

    for(var i = 0; i < COUNT; i++){

        var r = 34 + Math.random() * 60;

        var theta = Math.random() * Math.PI * 2;

        var phi = Math.acos(2 * Math.random() - 1);

        pos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
        pos[i*3+1] = r * Math.sin(phi) * Math.sin(theta) * 0.55;
        pos[i*3+2] = r * Math.cos(phi);

        var b = 0.22 + Math.random() * 0.34;

        col[i*3]   = b * 0.85;
        col[i*3+1] = b * 0.9;
        col[i*3+2] = b;

    }

    var geo = new T.BufferGeometry();

    geo.setAttribute("position",new T.BufferAttribute(pos,3));
    geo.setAttribute("color",new T.BufferAttribute(col,3));

    var mat = new T.PointsMaterial({
        size:0.42,
        map:makeGlowTexture(),
        vertexColors:true,
        transparent:true,
        opacity:0.45,
        depthWrite:false,
        blending:T.AdditiveBlending,
        sizeAttenuation:true
    });

    dust = new T.Points(geo,mat);

    scene.add(dust);

}


function createNebulae(){

    var tints = [0x4a5aa8,0x7a4a9a,0xa87f4a];

    for(var n = 0; n < 3; n++){

        var tex = makeGlowTexture(
            "rgba(255,255,255,.55)",
            "rgba(255,255,255,.12)"
        );

        var sp = new T.Sprite(new T.SpriteMaterial({
            map:tex,
            color:tints[n],
            transparent:true,
            opacity:0.16,
            depthWrite:false,
            blending:T.AdditiveBlending
        }));

        var ang = (n / 3) * Math.PI * 2 + 1.1;

        sp.position.set(
            Math.cos(ang) * 70,
            (n - 1) * 16,
            Math.sin(ang) * 70
        );

        sp.scale.set(90,90,1);

        scene.add(sp);

    }

}


function spawnShoot(){

    if(shoot){
        scene.remove(shoot);
        shoot.material.dispose();
        shoot = null;
    }

    var sp = new T.Sprite(new T.SpriteMaterial({
        map:makeGlowTexture(
            "rgba(255,248,225,1)",
            "rgba(255,225,170,.3)"
        ),
        transparent:true,
        opacity:0,
        depthWrite:false,
        blending:T.AdditiveBlending
    }));

    sp.scale.set(3.2,0.55,1);

    sp.position.set(
        (Math.random() - 0.5) * 60,
        14 + Math.random() * 10,
        -24 - Math.random() * 14
    );

    sp.userData = {
        vx:(Math.random() - 0.5) * 0.9 - 0.35,
        vy:-0.55 - Math.random() * 0.4,
        life:0,
        max:80 + Math.random() * 40
    };

    scene.add(sp);

    shoot = sp;

}


function updateShoot(){

    if(!shoot) return;

    var u = shoot.userData;

    u.life++;

    shoot.position.x += u.vx;
    shoot.position.y += u.vy;

    shoot.material.opacity = Math.sin((u.life / u.max) * Math.PI) * 0.9;

    shoot.material.rotation = Math.atan2(u.vy,u.vx) - Math.PI / 2;

    if(u.life >= u.max){
        scene.remove(shoot);
        shoot.material.dispose();
        shoot = null;
    }

}


/* =========================================================
   FLOATING ISLANDS (procedural low-poly)
   ========================================================= */

var ROCK_MAT, GRASS_MAT, TRUNK_MAT, LEAF_MAT;

var ISLAND_DATA = [
    { id:"beginning", name:"البداية",        emoji:"🌲", beacon:0x9fe8b0 },
    { id:"music",     name:"أغانيك",        emoji:"🎧", beacon:0x8fd4ff },
    { id:"loves",     name:"بتحبي إيه",     emoji:"🌷", beacon:0xff9ec4 },
    { id:"birthday",  name:"عيد ميلادك",    emoji:"🎂", beacon:0xffd98a },
    { id:"memories",  name:"لحظات",         emoji:"💌", beacon:0xc9a0ff },
    { id:"message",   name:"رسائل",         emoji:"💬", beacon:0xff8f8f },
    { id:"surprise",  name:"مفاجأة",        emoji:"🎁", beacon:0xffc14d }
];


function createIslands(){

    ROCK_MAT = new T.MeshStandardMaterial({
        color:0x6b5d4d,
        roughness:0.95,
        flatShading:true
    });

    GRASS_MAT = new T.MeshStandardMaterial({
        color:0x6fae5c,
        roughness:0.85,
        flatShading:true
    });

    TRUNK_MAT = new T.MeshStandardMaterial({
        color:0x5c4632,
        roughness:1.0
    });

    LEAF_MAT = new T.MeshStandardMaterial({
        color:0x4f9a48,
        roughness:0.8,
        flatShading:true
    });

    islandGroup = new T.Group();

    var RING = 3.75;

    ISLAND_DATA.forEach(function(data,i){

        var angle = (i / ISLAND_DATA.length) * Math.PI * 2 + 0.35;

        var g = new T.Group();

        var scale = 0.82 + (i % 3) * 0.12;

        g.position.set(
            Math.cos(angle) * RING,
            Math.sin(i * 1.7) * 0.7,
            Math.sin(angle) * RING
        );

        g.rotation.y = Math.random() * Math.PI;

        g.scale.setScalar(0); /* revealed during cinematic */

        /* rock underside */

        var rockGeo = new T.ConeGeometry(1.0,1.7,8,1);

        jitterGeometry(rockGeo,0.2);

        rockGeo.rotateX(Math.PI);
        rockGeo.translate(0,-0.78,0);

        var rock = new T.Mesh(rockGeo,ROCK_MAT);

        rock.castShadow = true;
        rock.receiveShadow = true;

        g.add(rock);

        /* grass cap */

        var grassGeo = new T.CylinderGeometry(0.82,1.02,0.52,9,1);

        jitterGeometry(grassGeo,0.1);

        var grass = new T.Mesh(grassGeo,GRASS_MAT);

        grass.position.y = -0.02;
        grass.castShadow = true;
        grass.receiveShadow = true;

        g.add(grass);

        /* trees */

        var treeCount = (i % 2 === 0) ? 2 : 1;

        for(var t = 0; t < treeCount; t++){

            var tg = new T.Group();

            var trunk = new T.Mesh(
                new T.CylinderGeometry(0.05,0.07,0.42,5),
                TRUNK_MAT
            );

            trunk.position.y = 0.31;
            trunk.castShadow = true;

            tg.add(trunk);

            var leaves = new T.Mesh(
                new T.ConeGeometry(0.24,0.5,6),
                LEAF_MAT
            );

            leaves.position.y = 0.66;
            leaves.castShadow = true;

            tg.add(leaves);

            var ta = (t / treeCount) * Math.PI * 2 + i;

            tg.position.set(
                Math.cos(ta) * 0.42,
                0.24,
                Math.sin(ta) * 0.42
            );

            tg.scale.setScalar(0.7 + (t % 2) * 0.3);

            g.add(tg);

        }

        /* beacon crystal (glowing octahedron on a rock spire) */

        var spire = new T.Mesh(
            new T.ConeGeometry(0.14,0.7,5),
            ROCK_MAT
        );

        spire.position.set(0.55,0.5,-0.3);

        g.add(spire);

        var crystal = new T.Mesh(
            new T.OctahedronGeometry(0.17),
            new T.MeshStandardMaterial({
                color:0xfff6dd,
                emissive:data.beacon,
                emissiveIntensity:1.8,
                roughness:0.15,
                metalness:0.25,
                flatShading:true
            })
        );

        crystal.position.set(0.55,1.02,-0.3);

        g.add(crystal);

        var beacon = new T.Mesh(
            new T.SphereGeometry(0.1,12,12),
            new T.MeshStandardMaterial({
                color:data.beacon,
                emissive:data.beacon,
                emissiveIntensity:1.4,
                roughness:0.3
            })
        );

        beacon.position.set(-0.5,1.35,0.25);

        g.add(beacon);

        var beaconLight = new T.PointLight(data.beacon,0.65,5,2);

        beaconLight.position.set(0,1.3,0);

        g.add(beaconLight);

        /* soft glow halo under the island */

        var halo = new T.Sprite(new T.SpriteMaterial({
            map:makeGlowTexture(
                "rgba(255,240,205,.9)",
                "rgba(232,201,138,.28)"
            ),
            transparent:true,
            opacity:0.4,
            depthWrite:false,
            blending:T.AdditiveBlending
        }));

        halo.position.y = -1.15;
        halo.scale.set(3.4,1.7,1);

        g.add(halo);

        /* hanging rock shards */

        for(var s = 0; s < 2; s++){

            var shard = new T.Mesh(
                new T.ConeGeometry(0.12 + s * 0.05,0.5 + s * 0.3,5),
                ROCK_MAT
            );

            shard.geometry.rotateX(Math.PI);

            var sa = i * 2.1 + s * 2.4;

            shard.position.set(
                Math.cos(sa) * 0.55,
                -1.7 - s * 0.25,
                Math.sin(sa) * 0.55
            );

            shard.rotation.z = (Math.random() - 0.5) * 0.4;

            g.add(shard);

        }

        /* emoji billboard */

        var emojiSprite = new T.Sprite(new T.SpriteMaterial({
            map:makeEmojiTexture(data.emoji),
            transparent:true,
            depthWrite:false
        }));

        emojiSprite.position.y = 2.15;
        emojiSprite.scale.set(0.95,0.95,1);

        g.add(emojiSprite);

        /* invisible hit volume (generous click target) */

        var hit = new T.Mesh(
            new T.CylinderGeometry(1.5,1.7,3.2,10),
            new T.MeshBasicMaterial({
                transparent:true,
                opacity:0,
                depthWrite:false
            })
        );

        hit.position.y = -0.2;
        hit.userData.island = data.id;

        g.add(hit);

        /* visited ring */

        var ring = new T.Mesh(
            new T.TorusGeometry(1.35,0.045,8,40),
            new T.MeshBasicMaterial({
                color:0xf6e3b8,
                transparent:true,
                opacity:0,
                depthWrite:false,
                blending:T.AdditiveBlending
            })
        );

        ring.rotation.x = Math.PI / 2;
        ring.position.y = -0.05;

        g.add(ring);

        islandGroup.add(g);

        /* CSS3D label */

        var labelEl = document.createElement("div");

        labelEl.className = "isle-label";

        labelEl.innerHTML =
            '<span class="isle-label-emoji">' + data.emoji + '</span>' +
            '<span class="isle-label-name">' + data.name + '</span>';

        labelEl.style.pointerEvents = "auto";
        labelEl.style.cursor = "pointer";

        /* clicking the floating name enters the island (reliable path) */

        labelEl.addEventListener("pointerdown",function(e){
            e.stopPropagation();
            dragStart(e.clientX,e.clientY);
        });

        labelEl.addEventListener("pointermove",function(e){
            e.stopPropagation();
            dragMove(e.clientX,e.clientY);
        });

        labelEl.addEventListener("pointerup",function(e){
            e.stopPropagation();

            var wasDrag = drag.maxDist > 26;

            dragEnd();

            if(!wasDrag && state === "interactive" && !openIslandId){
                diveTo(data.id);
            }
        });

        /* the label lives in the CSS3D scene (rendered as real 3D text) */

        var labelObj = new T.CSS3DObject(labelEl);

        cssScene.add(labelObj);

        var island = {
            id:data.id,
            data:data,
            group:g,
            label:labelEl,
            labelObj:labelObj,
            ring:ring,
            beacon:beacon,
            crystal:crystal,
            hit:hit,
            visited:false,
            baseY:g.position.y,
            phase:Math.random() * Math.PI * 2
        };

        islands[data.id] = island;
        islandList.push(island);

    });

    scene.add(islandGroup);

    /* ------------------------------------------------
       PLANET LIGHT-PORTS (خريطة الكوكب)
       One glowing lamp floats above each island. A lamp
       is faint until its island is visited, then it
       ignites. Tapping a lamp sails straight to that
       island — the planet is the map/hub of the world.
       ------------------------------------------------ */

    var PORT_RING = RING;   /* one lamp floating above each island */

    ISLAND_DATA.forEach(function(data,i){

        var baseAngle = (i / ISLAND_DATA.length) * Math.PI * 2 + 0.35;

        var m = new T.Mesh(
            new T.SphereGeometry(0.17,12,10),
            new T.MeshBasicMaterial({
                color:data.beacon,
                transparent:true,
                opacity:0.18,
                depthWrite:false,
                blending:T.AdditiveBlending
            })
        );

        var islandG = islandGroup.children[i];

        m.position.set(
            Math.cos(baseAngle) * PORT_RING,
            (islandG ? islandG.position.y : 0) + 2.75,
            Math.sin(baseAngle) * PORT_RING
        );

        m.material.userData = { islandId:data.id };

        m.userData.islandId = data.id;

        islandGroup.add(m);

        markers[data.id] = m;

    });

}


/* =========================================================
   INTERACTION
   ========================================================= */

/* shared orbit-drag helpers (used by the canvas AND the labels) */

function dragStart(x,y){

    drag.active = true;
    drag.startX = x;
    drag.startY = y;
    drag.moved = false;
    drag.maxDist = 0;
    drag.theta0 = orbit.theta;
    drag.phi0 = orbit.phi;

}

function dragMove(x,y){

    if(!drag.active) return;

    var dx = x - drag.startX;
    var dy = y - drag.startY;

    var d = Math.abs(dx) + Math.abs(dy);

    if(d > drag.maxDist) drag.maxDist = d;

    if(d > 6) drag.moved = true;

    if(drag.moved && !openIslandId && state === "interactive"){

        orbit.theta = drag.theta0 - dx * 0.0065;

        orbit.phi = Math.min(
            1.45,
            Math.max(-0.2, drag.phi0 + dy * 0.0055)
        );

    }

}

function dragEnd(){
    drag.active = false;
}


function setupInteraction(){

    raycaster = new T.Raycaster();
    pointer = new T.Vector2();

    canvas.addEventListener("pointerdown",function(e){
        dragStart(e.clientX,e.clientY);
    });

    canvas.addEventListener("pointermove",function(e){

        if(state !== "interactive") return;

        if(drag.active){
            dragMove(e.clientX,e.clientY);
            return;
        }

        updateHover(e);

    });

    canvas.addEventListener("pointerup",function(e){

        var wasDrag = drag.maxDist > 26;

        dragEnd();

        window.__lastTap = { x:e.clientX, y:e.clientY, state:state, wasDrag:wasDrag, hits:null, action:null };

        if(state !== "interactive" && state !== "panel") return;

        /* forgiving tap: only a real drag cancels the click */

        if(wasDrag) return;

        var rect = canvas.getBoundingClientRect();

        pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

        raycaster.setFromCamera(pointer,camera);

        var hits = [];

        islandList.forEach(function(island){
            raycaster.intersectObject(island.hit,false).forEach(function(h){
                hits.push({ kind:"island", id:island.id, dist:h.distance });
            });
        });

        Object.keys(markers).forEach(function(id){
            raycaster.intersectObject(markers[id],false).forEach(function(h){
                hits.push({ kind:"marker", id:id, dist:h.distance });
            });
        });

        if(earth){
            raycaster.intersectObject(earth,false).forEach(function(h){
                hits.push({ kind:"planet", id:"planet", dist:h.distance });
            });
        }

        hits.sort(function(a,b){ return a.dist - b.dist; });

        if(!hits.length){ window.__lastTap.action = "none-hit"; return; }

        var top = hits[0];

        window.__lastTap.hits = hits.slice(0,3);
        window.__lastTap.action = top.kind;

        /* the planet is the hub: tap it to return to the world map */

        if(top.kind === "planet"){

            if(openIslandId) closePanel();
            else emit("planet");

            return;
        }

        /* island (or its light-port) → sail there */

        if(openIslandId && top.id === openIslandId) return;

        diveTo(top.id);

    });

    canvas.addEventListener("pointerleave",function(){

        dragEnd();

        if(hoveredIsland || hoveredPort || hoveredPlanet){

            hoveredIsland = null;
            hoveredPort = null;
            hoveredPlanet = false;

            canvas.style.cursor = "";
        }

    });

}


function updateHover(e){

    var rect = canvas.getBoundingClientRect();

    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

    raycaster.setFromCamera(pointer,camera);

    var found = null;
    var hoveringPort = null;
    var hoveringPlanet = false;
    var any = false;

    islandList.forEach(function(island){

        if(raycaster.intersectObject(island.hit,false).length){
            found = island;
            any = true;
        }

    });

    if(!any){
        Object.keys(markers).forEach(function(id){
            if(raycaster.intersectObject(markers[id],false).length){
                hoveringPort = id;
                any = true;
            }
        });
    }

    if(!any && earth && raycaster.intersectObject(earth,false).length){
        hoveringPlanet = true;
        any = true;
    }

    hoveredIsland = found;
    hoveredPort = hoveringPort;
    hoveredPlanet = hoveringPlanet;

    canvas.style.cursor = any ? "pointer" : "";

}


/* =========================================================
   CINEMATIC TIMELINE
   ========================================================= */

function playCinematic(){

    if(state === "cinematic") return;

    state = "cinematic";

    useCamAnim = true;

    setStageClass("cinematic");

    var tl = window.gsap.timeline({
        onComplete:function(){
            endCinematic();
        }
    });

    timeline = tl;

    /* start deep inside the galaxy */

    camAnim.x = 24;  camAnim.y = 7;  camAnim.z = 24;
    camAnim.lx = 0;  camAnim.ly = 0; camAnim.lz = 0;

    camera.fov = 60;
    camera.updateProjectionMatrix();

    /* beat 1 — drift through the galaxy (7s) */

    tl.to(camAnim,{
        duration:7,
        x:13, y:3.5, z:13,
        ease:"power1.inOut"
    },0);

    tl.to(camera,{
        duration:7,
        fov:50,
        ease:"power1.inOut",
        onUpdate:function(){ camera.updateProjectionMatrix(); }
    },0);

    /* beat 2 — fly toward Earth, sun reveals (6s) */

    tl.to(camAnim,{
        duration:6,
        x:6.5, y:1.4, z:7.5,
        ease:"power2.in"
    },6.4);

    /* beat 3 — arc over the surface (5s) */

    tl.to(camAnim,{
        duration:5.5,
        x:orbit.radius * Math.cos(orbit.theta),
        y:orbit.target.y + orbit.radius * Math.sin(orbit.phi),
        z:orbit.radius * Math.sin(orbit.theta),
        ease:"power2.inOut"
    },12);

    tl.to(camAnim,{
        duration:5.5,
        lx:orbit.target.x, ly:orbit.target.y, lz:orbit.target.z,
        ease:"power2.inOut"
    },12);

    /* islands rise as we arc (staggered) */

    islandList.forEach(function(island,i){

        tl.to(island.group.scale,{
            duration:1.1,
            x:1, y:1, z:1,
            ease:"back.out(1.5)"
        },12.4 + i * 0.26);

    });

    /* gentle galaxy fade once we are at the planet */

    tl.to(galaxy.material,{
        duration:4,
        opacity:0.35,
        ease:"power1.inOut"
    },11);

}


function endCinematic(){

    if(state !== "cinematic") return;

    /* derive orbit angles from final camera so nothing snaps */

    var dx = camera.position.x - orbit.target.x;
    var dy = camera.position.y - orbit.target.y;
    var dz = camera.position.z - orbit.target.z;

    orbit.radius = Math.max(8,Math.sqrt(dx*dx + dy*dy + dz*dz));

    orbit.theta = Math.atan2(dz,dx);

    orbit.phi = Math.asin(Math.min(1,Math.max(-1,dy / orbit.radius)));

    camera.fov = 50;
    camera.updateProjectionMatrix();

    useCamAnim = false;

    state = "interactive";

    setStageClass("interactive");

    emit("interactive");

}


function skipCinematic(){

    if(state !== "cinematic") return;

    if(timeline){
        timeline.progress(1);
        timeline.kill();
        timeline = null;
    }

    islandList.forEach(function(island){
        island.group.scale.setScalar(1);
    });

    endCinematic();

}


function setStageClass(stage){

    container.classList.remove(
        "stage-cinematic",
        "stage-interactive",
        "stage-panel"
    );

    container.classList.add("stage-" + stage);

}


/* =========================================================
   DIVE INTO AN ISLAND
   ========================================================= */

var diveFade = null;

function diveTo(id){

    var island = islands[id];

    if(!island) return;

    /* travel between islands is allowed while a panel is already open */

    if(openIslandId && id === openIslandId) return;

    openIslandId = id;

    state = "panel";

    setStageClass("panel");

    if(timeline){ timeline.kill(); timeline = null; }

    var ip = new T.Vector3();

    island.group.getWorldPosition(ip);

    var start = camera.position.clone();

    /* parking spot: in front of the island, slightly above, gazing at it */

    var dir = start.clone().sub(ip).normalize();

    var camTarget = ip.clone().add(dir.multiplyScalar(4.0));

    camTarget.y += 0.55;

    var lookTarget = ip.clone();

    lookTarget.y -= 0.2;

    camAnim.x = start.x;
    camAnim.y = start.y;
    camAnim.z = start.z;

    camAnim.lx = 0;
    camAnim.ly = 0;
    camAnim.lz = 0;

    useCamAnim = true;

    var diveDone = false;

    function completeDive(){
        if(diveDone) return;
        diveDone = true;
        emit("openPanel",id);
    }

    var safety = setTimeout(completeDive,5200);

    /* glide in an arc above the island ring, then settle */

    var wayX = (start.x + camTarget.x) / 2;
    var wayY = (start.y + camTarget.y) / 2 + 5.5;
    var wayZ = (start.z + camTarget.z) / 2;

    var tl = window.gsap.timeline({
        onComplete:function(){
            clearTimeout(safety);
            completeDive();
        }
    });

    timeline = tl;

    emit("travel");

    tl.to(camAnim,{
        duration:1.15,
        x:wayX,
        y:wayY,
        z:wayZ,
        ease:"power2.in"
    },0);

    tl.to(camAnim,{
        duration:1.4,
        x:camTarget.x, y:camTarget.y, z:camTarget.z,
        lx:lookTarget.x, ly:lookTarget.y, lz:lookTarget.z,
        ease:"power3.out"
    },1.1);

    /* a soft dark dip during the flight (space-fade, not a white wipe) */

    tl.to(diveFade,{
        duration:0.5,
        opacity:0.8,
        ease:"power2.in"
    },0.1);

    tl.to(diveFade,{
        duration:1.25,
        opacity:0,
        ease:"power2.out"
    },0.9);

}


function closePanel(){

    if(!openIslandId) return;

    var island = islands[openIslandId];

    openIslandId = null;

    if(timeline){ timeline.kill(); timeline = null; }

    var tl = window.gsap.timeline({
        onComplete:function(){

            state = "interactive";

            setStageClass("interactive");

            /* re-derive orbit from parked camera */

            var dx = camera.position.x - orbit.target.x;
            var dy = camera.position.y - orbit.target.y;
            var dz = camera.position.z - orbit.target.z;

            orbit.radius = Math.max(8,Math.sqrt(dx*dx + dy*dy + dz*dz));

            orbit.theta = Math.atan2(dz,dx);

            orbit.phi = Math.asin(Math.min(1,Math.max(-1,dy / orbit.radius)));

            useCamAnim = false;

            emit("closePanel");

        }
    });

    tl.to(diveFade,{
        duration:0.4,
        opacity:0.85,
        ease:"power2.in"
    },0);

    tl.to(camAnim,{
        duration:1.6,
        x:orbit.target.x + orbit.radius * Math.cos(orbit.theta) * Math.cos(orbit.phi),
        y:orbit.target.y + orbit.radius * Math.sin(orbit.phi),
        z:orbit.target.z + orbit.radius * Math.sin(orbit.theta) * Math.cos(orbit.phi),
        lx:orbit.target.x, ly:orbit.target.y, lz:orbit.target.z,
        ease:"power3.inOut"
    },0.15);

    tl.to(diveFade,{
        duration:0.55,
        opacity:0,
        ease:"power2.out"
    },1.35);

}


function setIslandVisited(id){

    var island = islands[id];

    if(!island || island.visited) return;

    island.visited = true;

    window.gsap.to(island.ring.material,{
        duration:0.9,
        opacity:0.85,
        ease:"power2.out"
    });

    island.beacon.material.emissiveIntensity = 2.2;

    /* the orbit light-port catches fire (map hub lights up) */

    var m = markers[id];

    if(m){

        window.gsap.fromTo(m.scale,
            { x:2.4, y:2.4, z:2.4 },
            { duration:0.8, x:1, y:1, z:1, ease:"back.out(2.6)" }
        );

        window.gsap.to(m.material,{
            duration:0.5,
            opacity:0.95
        });

    }

}


/* =========================================================
   PANELS
   Content panels are now plain DOM (glass dock in main.js),
   so they render reliably in every browser. The camera parks
   in front of the chosen island (see diveTo) while the dock
   floats over the world. Only the floating island-name labels
   still live in the CSS3D scene above.
   ========================================================= */

function updateLabels(){

    /* labels only make sense on the interactive stage */

    if(state !== "interactive"){

        islandList.forEach(function(island){
            if(island.labelObj) island.labelObj.visible = false;
        });

        return;

    }

    var camPosNow = camera.position;

    var centerDist = camPosNow.length();

    islandList.forEach(function(island){

        if(!island.labelObj) return;

        /* labels are hidden while an island panel is open */

        if(openIslandId){
            island.labelObj.visible = false;
            return;
        }

        var ip = new T.Vector3();

        island.group.getWorldPosition(ip);

        var dist = camPosNow.distanceTo(ip);

        /* hide the label if the island is behind the planet */

        var hidden = false;

        if(dist > centerDist + 0.4){

            var toIsland = ip.clone().sub(camPosNow).normalize();

            var toCenter = camPosNow.clone().multiplyScalar(-1).normalize();

            var ang = toIsland.dot(toCenter);

            var planetAng = Math.asin(2.28 / Math.max(2.28,dist));

            if(ang > Math.cos(planetAng)) hidden = true;

        }

        island.labelObj.visible = !hidden;

        if(hidden) return;

        /* anchor above the island, billboard to the camera */

        island.labelObj.position.set(ip.x,ip.y + 1.35,ip.z);

        island.labelObj.lookAt(
            camPosNow.x,
            camPosNow.y,
            camPosNow.z
        );

        /* constant apparent size at any distance */

        var lh = island.label.offsetHeight || 80;

        island.labelObj.scale.setScalar(
            fitScale(lh,0.055,dist,camera.fov)
        );

    });

}


/* =========================================================
   MAIN LOOP
   ========================================================= */

var clock = null;

function animate(){

    requestAnimationFrame(animate);

    if(!visible) return;

    window.__sceneFrames = (window.__sceneFrames || 0) + 1;

    try{

    animateBody();

    }
    catch(err){

        if(!window.__sceneErr){
            window.__sceneErr = String(err && err.message) + " @ " + String((err && err.stack || "").split("\n")[1] || "");
        }

    }

}


function animateBody(){

    var dt = clock ? clock.getDelta() : 0.016;

    var t = clock ? clock.getElapsedTime() : 0;


    /* camera */

    if(useCamAnim){

        camera.position.set(camAnim.x,camAnim.y,camAnim.z);

        camera.lookAt(camAnim.lx,camAnim.ly,camAnim.lz);

    }
    else{

        var tx = orbit.target.x + orbit.radius * Math.cos(orbit.phi) * Math.cos(orbit.theta);
        var ty = orbit.target.y + orbit.radius * Math.sin(orbit.phi);
        var tz = orbit.target.z + orbit.radius * Math.cos(orbit.phi) * Math.sin(orbit.theta);

        camera.position.lerp(new T.Vector3(tx,ty,tz),0.08);

        camera.lookAt(orbit.target.x,orbit.target.y,orbit.target.z);

    }


    /* world motion */

    if(earth) earth.rotation.y += dt * 0.035;

    if(clouds) clouds.rotation.y += dt * 0.048;

    if(galaxy) galaxy.rotation.y += dt * 0.012;

    if(stars) stars.rotation.y += dt * 0.005;

    if(sunSprite){
        var sp = sunSprite.material;
        if(sp) sp.opacity = 0.75 + Math.sin(t * 0.7) * 0.2;
    }

    /* fireflies swirl */

    if(fireflies){
        fireflies.rotation.y += dt * 0.05;
        fireflies.position.y = Math.sin(t * 0.5) * 0.2;
        fireflies.material.opacity = 0.65 + Math.sin(t * 1.4) * 0.2;
    }

    /* dust drifts */

    if(dust){
        dust.rotation.y -= dt * 0.004;
        dust.rotation.x += dt * 0.0015;
    }

    /* shooting star */

    shootTimer--;

    if(shootTimer <= 0){
        spawnShoot();
        shootTimer = 560 + Math.random() * 620;
    }

    updateShoot();


    /* islands bob + slow ring rotation */

    if(islandGroup){

        if(state === "interactive" || state === "cinematic"){
            islandGroup.rotation.y += dt * 0.02;
        }

        islandList.forEach(function(island,i){

            var grown = island.group.scale.x > 0.01;

            if(grown && !openIslandId){

                island.group.position.y =
                    island.baseY + Math.sin(t * 0.8 + island.phase) * 0.14;

                island.group.rotation.y += dt * 0.06;

            }

            if(island === hoveredIsland && grown && !openIslandId){
                island.beacon.scale.setScalar(1 + Math.sin(t * 5) * 0.18);
            }
            else{
                island.beacon.scale.setScalar(1);
            }

            /* orbit light-port pulse: alive for visited, dim shimmer otherwise */

            var port = markers[island.id];

            if(port){

                port.visible = !openIslandId;

                if(island.visited){

                    var hot = island === hoveredIsland ||
                              (hoveredPort === island.id && !openIslandId);

                    port.scale.setScalar(hot ? 1.35 : 1 + Math.sin(t * 3.1 + island.phase) * 0.2);

                    port.material.opacity = 0.95;

                }
                else if(state === "interactive"){

                    port.scale.setScalar(
                        hoveredPort === island.id
                            ? 1 + Math.sin(t * 6) * 0.2
                            : 0.72 + Math.sin(t * 1.7 + island.phase * 2) * 0.09
                    );

                    port.material.opacity = 0.18;

                }

            }

            /* crystal slow spin + pulse */

            if(island.crystal){
                island.crystal.rotation.y += dt * 1.1;
                island.crystal.position.y = 1.02 + Math.sin(t * 1.6 + island.phase) * 0.06;
            }

        });

    }


    /* island labels live in the CSS3D scene */

    if(islandGroup){

        updateLabels();

    }


    renderer.render(scene,camera);

    cssRenderer.render(cssScene,camera);

}


/* =========================================================
   INIT
   ========================================================= */

function init(wrap){

    container = wrap;

    canvas = document.getElementById("sceneCanvas");
    cssEl = document.getElementById("css3d");

    if(!canvas || !cssEl) return Promise.reject("missing canvas containers");

    renderer = new T.WebGLRenderer({
        canvas:canvas,
        antialias:true,
        alpha:false
    });

    renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.75));

    renderer.setSize(window.innerWidth,window.innerHeight);

    renderer.outputColorSpace = T.SRGBColorSpace;

    /* modern filmic look */

    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;

    renderer.debug.checkShaderErrors = false;

    cssRenderer = new T.CSS3DRenderer();

    cssRenderer.setSize(window.innerWidth,window.innerHeight);

    cssEl.appendChild(cssRenderer.domElement);

    scene = new T.Scene();

    cssScene = new T.Scene();

    camera = new T.PerspectiveCamera(
        50,
        window.innerWidth / window.innerHeight,
        0.1,
        600
    );

    camera.position.set(24,7,24);

    clock = new T.Clock();

    createGalaxy();

    createStars();

    createSun();

    createFireflies();

    createDust();

    createNebulae();

    diveFade = document.getElementById("diveFade");

    setupInteraction();

    window.addEventListener("resize",function(){

        camera.aspect = window.innerWidth / window.innerHeight;

        camera.updateProjectionMatrix();

        renderer.setSize(window.innerWidth,window.innerHeight);

        cssRenderer.setSize(window.innerWidth,window.innerHeight);

    });

    document.addEventListener("visibilitychange",function(){
        visible = !document.hidden;
    });


    /* start the render loop */

    animate();


    /* async textures */

    return new Promise(function(resolve){

        var loader = new T.TextureLoader();

        var remaining = 1;

        function done(){
            remaining--;
            if(remaining === 0) resolve();
        }

        createEarth(loader,done);

        createIslands();

    });

}


/* ---------------- public API ---------------- */

window.Scene = {

    init:init,

    playCinematic:playCinematic,

    skipCinematic:skipCinematic,

    closePanel:closePanel,

    setIslandVisited:setIslandVisited,

    __projectMarker:function(id){

        var m = markers[id];

        if(!m || !camera) return null;

        var v = new T.Vector3();

        m.getWorldPosition(v);

        v.project(camera);

        var rect = canvas.getBoundingClientRect();

        return [
            Math.round(((v.x * 0.5) + 0.5) * rect.width),
            Math.round((( -v.y * 0.5) + 0.5) * rect.height)
        ];

    },

    __raycastAt:function(cx,cy){

        var rect = canvas.getBoundingClientRect();

        pointer.x = ((cx - rect.left) / rect.width) * 2 - 1;
        pointer.y = -(((cy - rect.top) / rect.height) * 2 - 1);

        raycaster.setFromCamera(pointer,camera);

        var hits = [];

        islandList.forEach(function(island){
            raycaster.intersectObject(island.hit,false).forEach(function(h){
                hits.push({ kind:"island", id:island.id, dist:Math.round(h.distance*100)/100 });
            });
        });

        Object.keys(markers).forEach(function(id){
            raycaster.intersectObject(markers[id],false).forEach(function(h){
                hits.push({ kind:"marker", id:id, dist:Math.round(h.distance*100)/100 });
            });
        });

        if(earth){
            raycaster.intersectObject(earth,false).forEach(function(h){
                hits.push({ kind:"planet", id:"planet", dist:Math.round(h.distance*100)/100 });
            });
        }

        hits.sort(function(a,b){ return a.dist - b.dist; });

        return hits.slice(0,3);

    },

    getState:function(){ return state; },

    getOpenIsland:function(){ return openIslandId; },

    diveTo:diveTo,

    on:function(name,fn){
        if(listeners[name]) listeners[name].push(fn);
    },

    debug:function(){

        var out = {
            state:state,
            open:openIslandId,
            islands:islandList.length,
            markers:Object.keys(markers).length,
            cam:camera ? [camera.position.x,camera.position.y,camera.position.z].map(function(v){ return Math.round(v*100)/100; }) : null,
            centerDist:camera ? Math.round(camera.position.length()*100)/100 : null,
            lastErr:window.__sceneErr || null,
            frames:window.__sceneFrames || 0,
            labels:[]
        };

        islandList.forEach(function(island){

            var ip = null, dist = null;

            try{
                ip = new T.Vector3();
                island.group.getWorldPosition(ip);
                dist = camera.position.distanceTo(ip);
            }catch(e){}

            out.labels.push({
                id:island.id,
                hasObj:!!island.labelObj,
                vis:island.labelObj ? island.labelObj.visible : null,
                inDom:!!(island.label && island.label.parentElement),
                dist:dist === null ? null : Math.round(dist*100)/100
            });

        });

        return out;

    }

};


})();
