(() => {
  const $ = id => document.getElementById(id);
  const cfg = window.ALUNISPEED_CONFIG || {};
  const configured = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_URL.startsWith("WKLEJ_") && !cfg.SUPABASE_ANON_KEY.startsWith("WKLEJ_");
  const db = configured && window.supabase ? window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY) : null;
  let user=null, tracks=[], playlists=[], currentTrack=null, localUrl=null;
  let audioCtx=null, sourceNode=null, bassFilter=null, audioGain=null, mediaSource=null;

  const msg=(id,text,error=false)=>{ $(id).textContent=text; $(id).style.color=error?"#ff9baf":"#8df0c2"; };
  const setUser=()=>{$("user-label").textContent=user?user.email:"Niezalogowano";$("logout-btn").classList.toggle("hidden",!user);$("auth-open").classList.toggle("hidden",!!user);$("auth-panel").classList.toggle("hidden",!!user);};
  const needDb=()=>{if(!db){msg("auth-message","Skonfiguruj Supabase w config.js — zobacz README.md.",true);return false;}return true;};

  async function auth(mode){
    if(!needDb())return;
    const email=$("email").value.trim(),password=$("password").value;
    if(mode==="signup"){
      const {error}=await db.auth.signUp({email,password});
      msg("auth-message",error?error.message:"Konto utworzone. Sprawdź e-mail, jeśli wymagane jest potwierdzenie.");
    }else{
      const {data,error}=await db.auth.signInWithPassword({email,password});
      if(error)msg("auth-message",error.message,true);else{user=data.user;setUser();await refresh();}
    }
  }
  $("auth-form").addEventListener("submit",e=>{e.preventDefault();auth("login");});
  $("signup-btn").addEventListener("click",()=>auth("signup"));
  $("logout-btn").addEventListener("click",async()=>{if(db)await db.auth.signOut();user=null;tracks=[];playlists=[];setUser();render();});
  $("auth-open").addEventListener("click",()=>$("auth-panel").scrollIntoView({behavior:"smooth"}));

  async function refresh(){
    if(!db||!user)return;
    const [p,t]=await Promise.all([db.from("playlists").select("*").order("created_at",{ascending:false}),db.from("saved_tracks").select("*").order("created_at",{ascending:false})]);
    if(p.error||t.error){msg("player-message",(p.error||t.error).message,true);return;}
    playlists=p.data||[];tracks=t.data||[];render();
  }
  function render(){
    $("track-count").textContent=tracks.length;$("playlist-count").textContent=playlists.length;
    $("library-list").innerHTML=tracks.length?tracks.map(t=>`<div class="list-item"><span>${escapeHtml(t.title||t.url)}</span><span>${escapeHtml(t.source||"Link")}</span></div>`).join(""):"<p class='muted'>Brak zapisanych utworów. Dodaj link i zapisz go do playlisty.</p>";
    $("playlist-list").innerHTML=playlists.length?playlists.map(p=>`<article class="playlist-card"><h3>${escapeHtml(p.name)}</h3><p>Twoja playlista</p></article>`).join(""):"<p class='muted'>Nie masz jeszcze playlist.</p>";
  }
  function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  document.querySelectorAll(".nav-btn").forEach(b=>b.addEventListener("click",()=>{["home","library","playlists"].forEach(v=>$(v+"-view").classList.toggle("hidden",v!==b.dataset.view));document.querySelectorAll(".nav-btn").forEach(x=>x.classList.toggle("active",x===b));}));

  function parseUrl(raw){
    let u;try{u=new URL(raw);}catch{throw Error("Wklej poprawny link https://");}
    const host=u.hostname.replace(/^www\./,"");
    if(host==="youtu.be"||host.endsWith("youtube.com")){
      const id=host==="youtu.be"?u.pathname.slice(1):(u.searchParams.get("v")||u.pathname.split("/").filter(Boolean).pop());
      if(!id||!/^[\w-]{6,}$/.test(id))throw Error("Nie rozpoznano filmu YouTube.");
      return {source:"YouTube",id,url:raw,title:"YouTube"};
    }
    if(host.endsWith("spotify.com")){
      const m=u.pathname.match(/\/(track|episode|album|playlist)\/([A-Za-z0-9]+)/);
      if(!m)throw Error("Wklej prawidłowy link do Spotify.");
      return {source:"Spotify",id:m[2],kind:m[1],url:raw,title:"Spotify"};
    }
    if(host.endsWith("soundcloud.com")){
      if(!u.pathname.split("/").filter(Boolean).length)throw Error("Nieprawidłowy link SoundCloud.");
      return {source:"SoundCloud",url:raw,title:"SoundCloud"};
    }
    throw Error("Obsługujemy linki YouTube, Spotify i SoundCloud.");
  }
  function stopLocal(){
    $("audio-player").pause();
    if(localUrl){URL.revokeObjectURL(localUrl);localUrl=null;}
    $("audio-player").removeAttribute("src");
    $("local-controls").classList.add("hidden");
    $("embed-container").classList.remove("hidden");
    $("bass-warning").classList.add("hidden");
  }
  function showEmbed(track){
    stopLocal();$("embed-container").classList.remove("hidden");
    $("track-title").textContent=track.title;$("source-pill").textContent=track.source.toUpperCase();
    $("save-track-btn").disabled=false;currentTrack=track;
    if(track.source==="YouTube"){
      $("embed-container").innerHTML=`<iframe title="YouTube player" src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(track.id)}?playsinline=1" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    }else if(track.source==="Spotify"){
      $("embed-container").innerHTML=`<iframe title="Spotify player" src="https://open.spotify.com/embed/${track.kind}/${track.id}?utm_source=generator" height="232" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>`;
    }else{
      $("embed-container").innerHTML=`<iframe title="SoundCloud player" height="166" scrolling="no" allow="autoplay" src="https://w.soundcloud.com/player/?url=${encodeURIComponent(track.url)}&color=%239b6bf2&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&visual=true"></iframe>`;
    }
    msg("player-message","Odtwarzacz gotowy. Sterowanie prędkością i basem zależy od możliwości serwisu.");
  }
  $("add-link-btn").addEventListener("click",()=>{
    try{const t=parseUrl($("track-url").value.trim());showEmbed(t);}
    catch(e){msg("player-message",e.message,true);}
  });

  async function setupAudioGraph(){
    const audio=$("audio-player");
    if(!audioCtx){
      audioCtx=new (window.AudioContext||window.webkitAudioContext)();
      bassFilter=audioCtx.createBiquadFilter();bassFilter.type="lowshelf";bassFilter.frequency.value=120;
      audioGain=audioCtx.createGain();mediaSource=audioCtx.createMediaElementSource(audio);
      mediaSource.connect(bassFilter);bassFilter.connect(audioGain);audioGain.connect(audioCtx.destination);
    }
    if(audioCtx.state==="suspended")await audioCtx.resume();
  }
  function setBass(value){
    const v=Number(value);$("bass-value").textContent=v+"%";
    // Map 0..100% to 0..+15 dB low-shelf boost. Warning appears above 75%.
    if(bassFilter)bassFilter.gain.value=(v/100)*15;
    $("bass-warning").classList.toggle("hidden",v<=75);
  }
  $("bass-range").addEventListener("input",e=>setBass(e.target.value));
  $("bass-reset").addEventListener("click",()=>{$("bass-range").value=0;setBass(0);});
  $("speed-range").addEventListener("input",e=>{const v=Number(e.target.value);$("speed-value").textContent=v.toFixed(2)+"×";$("audio-player").playbackRate=v;});
  document.querySelectorAll("[data-speed]").forEach(b=>b.addEventListener("click",()=>{$("speed-range").value=b.dataset.speed;$("speed-range").dispatchEvent(new Event("input"));}));

  $("audio-file").addEventListener("change",async e=>{
    const file=e.target.files[0];if(!file)return;
    if(!file.type.startsWith("audio/")){msg("player-message","Wybierz plik audio.",true);return;}
    stopLocal();currentTrack={source:"Plik lokalny",title:file.name,url:"local:"+file.name};
    localUrl=URL.createObjectURL(file);$("audio-player").src=localUrl;
    $("track-title").textContent=file.name;$("source-pill").textContent="LOCAL AUDIO";
    $("embed-container").classList.add("hidden");$("local-controls").classList.remove("hidden");
    $("save-track-btn").disabled=true; // local file blobs cannot be synced as a playlist link
    $("speed-range").value=1;$("speed-range").dispatchEvent(new Event("input"));
    $("bass-range").value=0;setBass(0);
    try{await setupAudioGraph();await $("audio-player").play();msg("player-message","Plik gotowy. Możesz regulować tempo i bas.");}
    catch(err){msg("player-message","Przeglądarka nie uruchomiła odtwarzania automatycznie. Naciśnij Play.",true);}
  });

  $("create-playlist-btn").addEventListener("click",async()=>{
    if(!needDb()||!user)return msg("player-message","Zaloguj się, aby tworzyć playlisty.",true);
    const name=$("playlist-name").value.trim();if(!name)return;
    const {error}=await db.from("playlists").insert({user_id:user.id,name});
    if(error)msg("player-message",error.message,true);else{$("playlist-name").value="";await refresh();}
  });
  $("save-track-btn").addEventListener("click",()=>{
    if(!currentTrack)return;
    if(!db||!user){msg("player-message","Zaloguj się i skonfiguruj Supabase, aby zapisywać utwory.",true);return;}
    $("modal-playlists").innerHTML=playlists.length?playlists.map(p=>`<button class="modal-choice" data-id="${p.id}">${escapeHtml(p.name)}</button>`).join(""):"<p class='muted'>Najpierw utwórz playlistę.</p>";
    $("playlist-modal").classList.remove("hidden");
    document.querySelectorAll(".modal-choice").forEach(b=>b.addEventListener("click",async()=>{
      const {error}=await db.from("saved_tracks").insert({user_id:user.id,playlist_id:b.dataset.id,title:currentTrack.title,url:currentTrack.url,source:currentTrack.source});
      if(error)msg("player-message",error.message,true);else{msg("player-message","Utwór zapisany w playliście.");await refresh();}
      $("playlist-modal").classList.add("hidden");
    }));
  });
  $("modal-close").addEventListener("click",()=>$("playlist-modal").classList.add("hidden"));
  $("playlist-modal").addEventListener("click",e=>{if(e.target.id==="playlist-modal")$("playlist-modal").classList.add("hidden");});

  if(db){
    db.auth.getSession().then(async({data})=>{user=data.session?.user||null;setUser();if(user)await refresh();});
    db.auth.onAuthStateChange((_event,session)=>{user=session?.user||null;setUser();if(user)refresh();});
  }else{setUser();msg("auth-message","Tryb podglądu: dodaj dane Supabase w config.js, aby włączyć konta i zapis playlist.");}
  render();
})();
