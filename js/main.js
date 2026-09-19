/* =========================================================
   FARIDA WORLD — EXPERIENCE GLUE
   ========================================================= */

(function(){

"use strict";


/* =========================================================
   WORDMARK — staggered 3D letter reveal
   ========================================================= */

document.querySelectorAll(".wm-word").forEach(function(word){

    var text = word.textContent;

    word.textContent = "";

    text.split("").forEach(function(ch,i){

        var span = document.createElement("span");

        span.className = "ch";
        span.textContent = ch;
        span.style.animationDelay = (i * 55 + 220) + "ms";

        word.appendChild(span);

    });

});


/* =========================================================
   GLOBAL ERROR REPORTER — shows errors on screen
   ========================================================= */

window.addEventListener("error",function(e){

    var box = document.getElementById("errBox");

    if(!box){
        box = document.createElement("div");
        box.id = "errBox";
        document.body.appendChild(box);
    }

    var msg = String((e && e.message) || "unknown error");

    var where = "";

    if(e && e.filename){
        var short = String(e.filename).split("/").pop();
        where = " @ " + short + ":" + (e.lineno || "?");
    }

    box.style.display = "block";

    box.textContent = "⚠ " + msg + where +
        "\n(ابعتلي الرسالة دي علشان أصلحها)";

});


/* =========================================================
   START FLOW
   ========================================================= */

var startScreen = document.getElementById("start");
var introModal  = document.getElementById("intro");
var sceneWrap   = document.getElementById("sceneWrap");

var sceneBooted = false;
var sceneReady  = false;
var pendingCinematic = false;
var hintShown   = false;


function startJourney(){

    introModal.classList.add("show");

    unlockAudio();

}

window.startJourney = startJourney;


function enterWorld(){

    introModal.classList.remove("show");

    startScreen.classList.add("hide");


    /* ambient theme song straight away (inside the gesture) */

    playTrack(TRACKS[0],true);


    /* show the 3D world; play the cinematic as soon as it is ready */

    sceneWrap.classList.add("active");

    if(sceneReady){
        sceneWrap.classList.remove("loading");
        window.Scene.playCinematic();
    }
    else{
        sceneWrap.classList.add("loading");
        pendingCinematic = true;
    }

}

window.enterWorld = enterWorld;


/* boot the 3D world behind the start screen (live galaxy backdrop) */

function bootScene(){

    if(sceneBooted || !window.Scene) return;

    sceneBooted = true;

    window.Scene.on("openPanel",handleOpenPanel);

    window.Scene.on("closePanel",handleClosePanel);

    window.Scene.on("travel",function(){
        dock.classList.add("flying");
    });

    /* الكوكب هو الخريطة — اللحظة اللي بتدوسي عليها تشرح إزاي تستخدميها */

    window.Scene.on("planet",function(){
        if(visited.size >= 7){
            launchConfetti(location.protocol === "file:" ? 40 : 150);
            toast("🌍 كل كوكبك نور.. أي نقطة ضوء حواليك توصلكي لجزيرة");
        }
        else{
            toast("🌍 دي خريطة عالمك — اضغطي على أي نقطة ضوء حوالين الكوكب تاخدك لجزيرة");
        }
    });

    window.Scene.on("interactive",function(){

        if(!hintShown){
            hintShown = true;
            toast("دوسي على أي جزيرة علشان تدخليها ✦");
        }

    });

    try{

        window.Scene.init(sceneWrap).then(function(){

            sceneReady = true;

            applyStoredVisited();

            if(pendingCinematic){
                pendingCinematic = false;
                sceneWrap.classList.remove("loading");
                window.Scene.playCinematic();
            }

        }).catch(function(err){

            sceneWrap.classList.remove("loading");

            toast("المشهد 3D محتاج متصفح حديث 🌙");

            console.log("scene init failed:",err);

        });

    }
    catch(err){

        sceneWrap.classList.remove("loading");

        toast("تعذر تشغيل المشهد 3D");

        console.log("scene boot failed:",err);

    }

}

bootScene();


/* =========================================================
   AUDIO SYSTEM
   ========================================================= */

var mainAudio = document.getElementById("mainAudio");

var TRACKS = [
    { id:"badi",    title:"بدي دوب",          artist:"إليسا • الأغنية الأساسية", icon:"🎵", src:"sound/badi-doub.mp3",  loop:true,  volume:0.22 },
    { id:"elissa1", title:"أغنية إليسا",      artist:"Elissa",                    icon:"🎶", src:"sound/elissa-1.mp3",   loop:false, volume:0.7  },
    { id:"elissa2", title:"أغنية إليسا",      artist:"Elissa",                    icon:"🎶", src:"sound/elissa-2.mp3",   loop:false, volume:0.7  },
    { id:"haifa",   title:"أغنية هيفاء وهبي", artist:"Haifa Wehbe",               icon:"💗", src:"sound/haifa-1.mp3",    loop:false, volume:0.7  },
    { id:"hamo",    title:"طب ب بحبك",        artist:"حمو المرشدي",               icon:"❤️", src:"sound/hamo.mp3",       loop:false, volume:0.75 }
];

var currentIndex = 0;
var isPlaying = false;

var btnPlay      = document.getElementById("btnPlay");
var btnPrev      = document.getElementById("btnPrev");
var btnNext      = document.getElementById("btnNext");
var nowTitle     = document.getElementById("currentSongTitle");
var nowArtist    = document.getElementById("currentSongArtist");
var playerBox    = document.getElementById("player");
var seekBar      = document.getElementById("seek");
var seekFill     = document.getElementById("seekFill");
var seekThumb    = document.getElementById("seekThumb");
var timeCurrent  = document.getElementById("timeCurrent");
var timeTotal    = document.getElementById("timeTotal");
var songListEl   = document.getElementById("songList");


/* webaudio for the visualizer.
   IMPORTANT: on file:// pages the element source outputs ZEROES due to
   CORS, so the analyser is only used over http(s). Everything else —
   seeking, play/pause — works either way. */
var USE_WEBAUDIO = (location.protocol === "http:" || location.protocol === "https:");

var audioCtx = null;
var analyser = null;
var sourceNode = null;
var freqData = null;

function unlockAudio(){

    if(audioCtx || !USE_WEBAUDIO) return;

    try{

        var AC = window.AudioContext || window.webkitAudioContext;

        if(!AC) return;

        audioCtx = new AC();

        analyser = audioCtx.createAnalyser();

        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.8;

        sourceNode = audioCtx.createMediaElementSource(mainAudio);

        sourceNode.connect(analyser);
        analyser.connect(audioCtx.destination);

        freqData = new Uint8Array(analyser.frequencyBinCount);

    }
    catch(err){
        analyser = null;
    }

}

function resumeCtx(){

    if(audioCtx && audioCtx.state === "suspended"){
        audioCtx.resume().catch(function(){});
    }

}


function fmt(t){

    if(!isFinite(t)) return "0:00";

    var m = Math.floor(t / 60);
    var s = Math.floor(t % 60);

    return m + ":" + String(s).padStart(2,"0");

}


function playTrack(track){

    if(!track) return;

    var i = TRACKS.indexOf(track);

    if(i > -1) currentIndex = i;

    mainAudio.pause();
    mainAudio.currentTime = 0;

    mainAudio.src = track.src;
    mainAudio.loop = !!track.loop;
    mainAudio.volume = track.volume;

    mainAudio.load();

    nowTitle.textContent = track.title;
    nowArtist.textContent = track.artist;

    updatePlayerUI();

    resumeCtx();

    var pr = mainAudio.play();

    if(pr && pr.then){

        pr.then(function(){
            isPlaying = true;
            updatePlayerUI();
        }).catch(function(){
            isPlaying = false;
            updatePlayerUI();
        });

    }
    else{

        isPlaying = true;
        updatePlayerUI();

    }

}


function togglePlay(){

    if(mainAudio.paused){

        resumeCtx();

        var pr = mainAudio.play();

        if(pr && pr.then){
            pr.then(function(){
                isPlaying = true;
                updatePlayerUI();
            }).catch(function(){});
        }
        else{
            isPlaying = true;
            updatePlayerUI();
        }

    }
    else{

        mainAudio.pause();

        isPlaying = false;
        updatePlayerUI();

    }

}


function updatePlayerUI(){

    btnPlay.textContent = isPlaying ? "⏸" : "▶";

    playerBox.classList.toggle("paused",!isPlaying);

    var current = TRACKS[currentIndex];

    songListEl.querySelectorAll(".song").forEach(function(el){

        var on = (el.dataset.song === current.id);

        el.classList.toggle("playing",on);

        var st = el.querySelector(".song-state");

        if(st) st.textContent = on && isPlaying ? "NOW PLAYING" : "";

    });

}


function playSong(id){

    var track = null;

    TRACKS.forEach(function(t){
        if(t.id === id) track = t;
    });

    if(!track) return;

    playTrack(track);

}

window.playSong = playSong;

window.playBadiDoub = function(){
    playTrack(TRACKS[0]);
};


/* player controls */

btnPlay.addEventListener("click",togglePlay);

btnPrev.addEventListener("click",function(){
    currentIndex = (currentIndex - 1 + TRACKS.length) % TRACKS.length;
    playTrack(TRACKS[currentIndex]);
});

btnNext.addEventListener("click",function(){
    currentIndex = (currentIndex + 1) % TRACKS.length;
    playTrack(TRACKS[currentIndex]);
});


/* song list */

songListEl.querySelectorAll(".song").forEach(function(el){
    el.addEventListener("click",function(){
        playSong(el.dataset.song);
    });
});


/* audio events */

mainAudio.addEventListener("timeupdate",function(){

    var d = mainAudio.duration;

    if(d && isFinite(d)){

        var p = (mainAudio.currentTime / d) * 100;

        seekFill.style.width = p + "%";

        seekThumb.style.left = p + "%";

    }

    timeCurrent.textContent = fmt(mainAudio.currentTime);

});

mainAudio.addEventListener("loadedmetadata",function(){
    timeTotal.textContent = fmt(mainAudio.duration);
});

mainAudio.addEventListener("play",function(){
    isPlaying = true;
    updatePlayerUI();
});

mainAudio.addEventListener("pause",function(){
    isPlaying = false;
    updatePlayerUI();
});

mainAudio.addEventListener("ended",function(){

    if(!mainAudio.loop){
        currentIndex = (currentIndex + 1) % TRACKS.length;
        playTrack(TRACKS[currentIndex]);
    }

});


/* seek bar */

function seekTo(e){

    var r = seekBar.getBoundingClientRect();

    var p = (e.clientX - r.left) / r.width;

    p = Math.min(1,Math.max(0,p));

    if(mainAudio.duration && isFinite(mainAudio.duration)){
        mainAudio.currentTime = p * mainAudio.duration;
    }

}

seekBar.addEventListener("pointerdown",function(e){

    seekBar.classList.add("active");

    seekTo(e);

    seekBar.setPointerCapture(e.pointerId);

});

seekBar.addEventListener("pointermove",function(e){

    if(seekBar.classList.contains("active")){
        seekTo(e);
    }

});

seekBar.addEventListener("pointerup",function(){
    seekBar.classList.remove("active");
});

seekBar.addEventListener("pointercancel",function(){
    seekBar.classList.remove("active");
});


/* =========================================================
   VISUALIZER
   ========================================================= */

(function(){

    var vc = document.getElementById("vizCanvas");
    var vctx = vc.getContext("2d");

    var dpr = Math.min(window.devicePixelRatio,2);

    var phase = 0;

    var vMusicBox = document.getElementById("music").querySelector(".box");

    function draw(){

        requestAnimationFrame(draw);

        if(!vMusicBox || !vMusicBox.classList.contains("in-world")) return;

        var w = vc.clientWidth;
        var h = vc.clientHeight;

        if(vc.width !== Math.floor(w * dpr)){
            vc.width = Math.floor(w * dpr);
            vc.height = Math.floor(h * dpr);
        }

        vctx.clearRect(0,0,vc.width,vc.height);

        vctx.setTransform(dpr,0,0,dpr,0,0);

        var bars = 26;

        var bw = w / bars;

        phase += isPlaying ? 0.05 : 0.015;

        var data = null;

        if(analyser && isPlaying){
            analyser.getByteFrequencyData(freqData);
            data = freqData;
        }

        for(var b = 0; b < bars; b++){

            var v;

            if(data){

                var di = Math.floor((b / bars) * (data.length * 0.72));

                v = data[di] / 255;

                v = Math.max(v,0.04);

            }
            else{

                v = 0.12 + Math.abs(
                    Math.sin(phase + b * 0.55) *
                    Math.sin(phase * 0.6 + b * 0.31)
                ) * 0.28;

                if(isPlaying) v *= 2.1;

            }

            var bh = Math.max(2,v * h * 0.92);

            var x = b * bw + bw * 0.18;

            var yC = h / 2;

            var grad = vctx.createLinearGradient(0,yC - bh,0,yC + bh);

            grad.addColorStop(0,"rgba(246,227,184,.15)");
            grad.addColorStop(0.5,"rgba(232,201,138,.85)");
            grad.addColorStop(1,"rgba(246,227,184,.15)");

            vctx.fillStyle = grad;

            var bwid = bw * 0.64;

            var radius = bwid / 2;

            var top = yC - bh / 2;

            vctx.beginPath();

            if(vctx.roundRect){
                vctx.roundRect(x,top,bwid,bh,radius);
            }
            else{
                vctx.rect(x,top,bwid,bh);
            }

            vctx.fill();

        }

    }

    draw();

})();


/* =========================================================
   ISLAND PANELS — content shows in the glass dock
   ========================================================= */

var ISLAND_ORDER = ["beginning","music","loves","birthday","memories","message","surprise"];

var ISLAND_NAMES = {
    beginning:"البداية 🌙",
    music:"أغانيك 🎧",
    loves:"بتحبي إيه 🌷",
    birthday:"عيد ميلادك 🎂",
    memories:"لحظاتنا 💌",
    message:"رسالة ليكي 💌",
    surprise:"المفاجأة 🎁"
};

var dock        = document.getElementById("islandDock");
var dockContent = dock.querySelector(".dock-content");
var dockEmoji   = document.getElementById("dockEmoji");
var dockName    = document.getElementById("dockName");
var dockNextName    = document.getElementById("dockNextName");
var dockPrev    = document.getElementById("dockPrev");
var dockNext    = document.getElementById("dockNext");
var dockClose   = document.getElementById("dockClose");

window.__dock = dock; /* diagnostics */


function islandAdjacent(id,step){

    var i = ISLAND_ORDER.indexOf(id);

    if(i === -1) return null;

    return ISLAND_ORDER[(i + step + ISLAND_ORDER.length) % ISLAND_ORDER.length];

}


function updateDockUI(id){

    var name = ISLAND_NAMES[id] || id;

    dockName.textContent = name.split(" ")[0] || name;

    dockEmoji.textContent = id === "music" ? "🎧"
        : id === "beginning" ? "🌙"
        : id === "loves" ? "🌷"
        : id === "birthday" ? "🎂"
        : id === "memories" ? "💌"
        : id === "message" ? "💌"
        : id === "surprise" ? "🎁" : "✦";

    var nextId = islandAdjacent(id,1);

    dockNextName.textContent = nextId
        ? ((ISLAND_NAMES[nextId].split(" ")[0]) || ISLAND_NAMES[nextId])
        : "—";

    dockPrev.disabled = false;
    dockNext.disabled = false;

}


function handleOpenPanel(id){

    var win = document.getElementById(id);

    if(!win) return;

    var box = win.querySelector(".box");

    if(!box) return;

    box.dataset.windowOf = id;

    /* if another island's box is still parked in the dock, return it first */

    var parked = dockContent.querySelector(".box");

    if(parked && parked !== box && parked.dataset.windowOf){

        var oldWin = document.getElementById(parked.dataset.windowOf);

        if(oldWin) oldWin.appendChild(parked);

        parked.classList.remove("in-world");

        stopTypewriter();

    }

    dockContent.appendChild(box);

    box.classList.add("in-world");

    dock.classList.remove("flying");
    dock.classList.add("open");

    updateDockUI(id);

    markVisited(id);

    revealContent(box);

    if(id === "message"){
        startTypewriter(box);
    }

    if(id === "surprise"){
        startTypewriter(box,function(){
            launchConfetti(170);
        });
    }

}


function handleClosePanel(){

    dock.classList.remove("open","flying");

    var parked = dockContent.querySelector(".box");

    if(parked && parked.dataset.windowOf){

        var oldWin = document.getElementById(parked.dataset.windowOf);

        if(oldWin) oldWin.appendChild(parked);

        parked.classList.remove("in-world");

    }

    stopTypewriter();

}


/* travel between islands (dock dims while the camera flies) */

dockPrev.addEventListener("click",function(){
    var cur = dock && window.Scene ? window.Scene.getOpenIsland() : null;
    if(!cur) return;
    var n = islandAdjacent(cur,-1);
    if(n) window.Scene.diveTo(n);
});

dockNext.addEventListener("click",function(){
    var cur = dock && window.Scene ? window.Scene.getOpenIsland() : null;
    if(!cur) return;
    var n = islandAdjacent(cur,1);
    if(n) window.Scene.diveTo(n);
});

dockClose.addEventListener("click",closeWindows);


function closeWindows(){

    if(window.Scene && window.Scene.getState() === "panel"){
        window.Scene.closePanel();
    }

}

window.closeWindows = closeWindows;


/* close buttons inside the panels */

document.querySelectorAll(".close").forEach(function(btn){
    btn.addEventListener("click",closeWindows);
});


/* Escape */

document.addEventListener("keydown",function(e){

    if(e.key === "Escape"){
        closeWindows();
    }

});


/* skip cinematic */

var skipBtn = document.getElementById("skipBtn");

if(skipBtn){
    skipBtn.addEventListener("click",function(){
        if(window.Scene) window.Scene.skipCinematic();
    });
}


/* staggered content reveal */

function revealContent(box){

    var items = box.querySelectorAll(".rise");

    items.forEach(function(el,i){

        setTimeout(function(){
            el.classList.add("in");
        },120 + i * 75);

    });

}


/* =========================================================
   EXPLORED ISLANDS
   ========================================================= */

var VISIT_KEY = "fw_visited_3d";

var visited = new Set();

try{

    JSON.parse(localStorage.getItem(VISIT_KEY) || "[]").forEach(function(id){
        visited.add(id);
    });

}
catch(err){}


function applyStoredVisited(){

    visited.forEach(function(id){
        if(window.Scene) window.Scene.setIslandVisited(id);
    });

    updateProgress();

}


function markVisited(id){

    if(visited.has(id)) return;

    visited.add(id);

    if(window.Scene) window.Scene.setIslandVisited(id);

    updateProgress();

    try{
        localStorage.setItem(VISIT_KEY,JSON.stringify(Array.from(visited)));
    }
    catch(err){}

    if(visited.size === 7){
        toast("✦ كل جزر عالمك اتكتشفت ✦");
    }

}


function updateProgress(){

    var fill = document.getElementById("progressFill");
    var label = document.getElementById("progressLabel");

    if(!fill || !label) return;

    var p = Math.min(visited.size,7) / 7 * 100;

    fill.style.width = p + "%";

    label.textContent = visited.size + " / 7";

}


/* =========================================================
   COUNTDOWN
   ========================================================= */

var birthday = new Date("2026-09-19T20:30:00+03:00").getTime();

var lastSeconds = -1;

function updateTimer(){

    var now = new Date().getTime();

    var diff = birthday - now;

    var dEl = document.getElementById("days");
    var hEl = document.getElementById("hours");
    var mEl = document.getElementById("minutes");
    var sEl = document.getElementById("seconds");

    if(diff <= 0){

        dEl.textContent = "00";
        hEl.textContent = "00";
        mEl.textContent = "00";
        sEl.textContent = "00";

        return;

    }

    var days = Math.floor(diff / (1000 * 60 * 60 * 24));

    var hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    var minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    var seconds = Math.floor((diff % (1000 * 60)) / 1000);

    dEl.textContent = String(days).padStart(2,"0");
    hEl.textContent = String(hours).padStart(2,"0");
    mEl.textContent = String(minutes).padStart(2,"0");
    sEl.textContent = String(seconds).padStart(2,"0");

    if(seconds !== lastSeconds){

        lastSeconds = seconds;

        sEl.parentElement.classList.remove("tick");

        void sEl.parentElement.offsetWidth;

        sEl.parentElement.classList.add("tick");

    }

}

updateTimer();

setInterval(updateTimer,1000);


/* =========================================================
   TYPEWRITER
   ========================================================= */

var typeTimer = null;
var typeSkipHandler = null;

var MESSAGE_STORED =
    "يمكن الكلام مهما كان مش هيقدر يوصف " +
    "قد إيه وجودك فرق معايا " +
    "بس اللي أعرفه إنك من أجمل الحاجات " +
    "اللي حصلتلي " +
    "وكل مرة بشوفك فيها " +
    "بحس إن الدنيا بقت أحلى " +
    "ربنا يخليكي دايمًا مبسوطة " +
    "ويفضل في بينا ضحك وحكايات " +
    "وذكريات حلوة كتير " +
    "وكل سنة وانتي طيبة يا فرودتي 🥹❤️";

var SURPRISE_TEXT =
    "خليكي لحد النهاية...\n" +
    "لأن الجزيرة دي مخبية حاجة مختلفة 🌙✨\n" +
    "وكل سنة وانتي طيبة 🎂❤️";


function startTypewriter(box,onDone){

    stopTypewriter();

    var holder = box.querySelector(".type-text");

    if(!holder) return;

    /* the box is inside the 3D panel — use the recorded source island */

    var raw = (box.dataset.windowOf === "message") ? MESSAGE_STORED : SURPRISE_TEXT;

    var skip = box.querySelector(".type-skip");

    var pos = 0;

    var speed = 30;

    holder.innerHTML = '<span class="caret"></span>';

    if(skip) skip.classList.add("show");


    function render(){

        holder.innerHTML =
            raw.slice(0,pos).replace(/\n/g,"<br>") +
            '<span class="caret"></span>';

    }


    function finish(){

        clearTimeout(typeTimer);

        holder.innerHTML = raw.replace(/\n/g,"<br>");

        if(skip) skip.classList.remove("show");

        detachSkip();

        if(onDone) onDone();

    }


    function detachSkip(){

        if(typeSkipHandler && holder){
            holder.removeEventListener("click",typeSkipHandler);
            if(skip) skip.removeEventListener("click",typeSkipHandler);
        }

        typeSkipHandler = null;

    }


    typeSkipHandler = function(e){

        e.stopPropagation();

        if(pos < raw.length){
            finish();
        }

    };

    holder.addEventListener("click",typeSkipHandler);

    if(skip) skip.addEventListener("click",typeSkipHandler);


    function step(){

        if(pos >= raw.length){
            finish();
            return;
        }

        var ch = raw.charAt(pos);

        pos++;

        render();

        var wait = speed;

        if(ch === "\n") wait = 520;
        else if("،.؟!".indexOf(ch) > -1) wait = 260;
        else if(ch === " ") wait = speed * 0.6;

        typeTimer = setTimeout(step,wait);

    }

    typeTimer = setTimeout(step,420);

}


function stopTypewriter(){

    clearTimeout(typeTimer);

    typeTimer = null;

}


/* re-trigger surprise confetti by tapping the gift */

var giftOrb = document.querySelector("#surprise .gift-orb");

if(giftOrb){

    giftOrb.addEventListener("click",function(){
        launchConfetti(140);
    });

}


/* =========================================================
   CONFETTI
   ========================================================= */

var cCanvas = document.getElementById("confettiCanvas");
var cCtx = cCanvas.getContext("2d");

var cParts = [];
var cRunning = false;

var CONFETTI_COLORS = [
    "#f6e3b8","#e8c98a","#c9a35c",
    "#f2c3cf","#e29aac","#ffffff"
];

function sizeConfettiCanvas(){

    cCanvas.width = window.innerWidth;
    cCanvas.height = window.innerHeight;

}

sizeConfettiCanvas();

window.addEventListener("resize",sizeConfettiCanvas);


function launchConfetti(count){

    var cx = window.innerWidth / 2;

    var spread = window.innerWidth * 0.42;

    for(var i = 0; i < count; i++){

        cParts.push({

            x:cx + (Math.random() - 0.5) * spread,
            y:-20 - Math.random() * 90,

            vx:(Math.random() - 0.5) * 7,
            vy:Math.random() * 2 + 1.5,

            w:5 + Math.random() * 6,
            h:8 + Math.random() * 10,

            rot:Math.random() * Math.PI * 2,
            vRot:(Math.random() - 0.5) * 0.22,

            color:CONFETTI_COLORS[
                Math.floor(Math.random() * CONFETTI_COLORS.length)
            ],

            sway:Math.random() * Math.PI * 2,
            swaySpeed:0.02 + Math.random() * 0.03

        });

    }

    if(!cRunning){
        cRunning = true;
        confettiLoop();
    }

}


function confettiLoop(){

    requestAnimationFrame(confettiLoop);

    cCtx.clearRect(0,0,cCanvas.width,cCanvas.height);

    for(var i = cParts.length - 1; i >= 0; i--){

        var p = cParts[i];

        p.vy += 0.11;

        p.x += p.vx + Math.sin(p.sway) * 0.8;
        p.y += p.vy;

        p.rot += p.vRot;
        p.sway += p.swaySpeed;

        if(p.y > cCanvas.height + 40){
            cParts.splice(i,1);
            continue;
        }

        cCtx.save();

        cCtx.translate(p.x,p.y);
        cCtx.rotate(p.rot);

        cCtx.fillStyle = p.color;

        cCtx.fillRect(-p.w / 2,-p.h / 2,p.w,p.h);

        cCtx.restore();

    }

    if(cParts.length === 0){
        cRunning = false;
        cCtx.clearRect(0,0,cCanvas.width,cCanvas.height);
    }

}


/* keep the audio context alive across gestures (autoplay policies) */

document.addEventListener("pointerdown",function(){
    resumeCtx();
});


/* =========================================================
   TOAST
   ========================================================= */

var toastEl = document.getElementById("toast");
var toastTimer = null;

function toast(msg){

    if(!toastEl) return;

    toastEl.textContent = msg;

    toastEl.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(function(){
        toastEl.classList.remove("show");
    },3000);

}


/* =========================================================
   START PARALLAX — content drifts gently with the pointer
   ========================================================= */

(function(){

    var inner = document.querySelector(".start-inner");

    if(!inner) return;

    var ox = 0, oy = 0, tx = 0, ty = 0;

    (function loop(){

        requestAnimationFrame(loop);

        ox += (tx - ox) * 0.05;
        oy += (ty - oy) * 0.05;

        inner.style.transform =
            "translate3d(" + ox + "px," + oy + "px,0)";

    })();

    window.addEventListener("pointermove",function(e){

        tx = (e.clientX / window.innerWidth - 0.5) * 14;
        ty = (e.clientY / window.innerHeight - 0.5) * 10;

    });

})();


})();
