(() => {
  const $ = id => document.getElementById(id);
  const cfg = window.ALUNISPEED_CONFIG || {};
  const configured = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_URL.startsWith("WKLEJ_") && !cfg.SUPABASE_ANON_KEY.startsWith("WKLEJ_");
  const db = configured && window.supabase ? window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY) : null;
  let user=null, localUrl=null, isPremium=false;
  let audioCtx=null, sourceNode=null, bassFilter=null, audioGain=null, mediaSource=null, compressor=null;

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
      if(error)msg("auth-message",error.message,true);else{user=data.user;setUser();}
    }
  }
  $("auth-form").addEventListener("submit",e=>{e.preventDefault();auth("login");});
  $("signup-btn").addEventListener("click",()=>auth("signup"));
  $("logout-btn").addEventListener("click",async()=>{if(db)await db.auth.signOut();user=null;setUser();});
  $("auth-open").addEventListener("click",()=>$("auth-panel").scrollIntoView({behavior:"smooth"}));
  function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  document.querySelectorAll(".nav-btn").forEach(b=>b.addEventListener("click",()=>{["home","library"].forEach(v=>$(v+"-view").classList.toggle("hidden",v!==b.dataset.view));document.querySelectorAll(".nav-btn").forEach(x=>x.classList.toggle("active",x===b));}));
  function stopLocal(){
    $("audio-player").pause();
    if(localUrl){URL.revokeObjectURL(localUrl);localUrl=null;}
    $("audio-player").removeAttribute("src");
    $("local-controls").classList.add("hidden");
    $("embed-container").classList.remove("hidden");
    $("bass-warning").classList.add("hidden");
  }

  async function setupAudioGraph(){
    const audio=$("audio-player");
    if(!audioCtx){
      audioCtx=new (window.AudioContext||window.webkitAudioContext)();
      bassFilter=audioCtx.createBiquadFilter();bassFilter.type="lowshelf";bassFilter.frequency.value=120;
      audioGain=audioCtx.createGain();
      compressor=audioCtx.createDynamicsCompressor();
      compressor.threshold.value=-18; compressor.knee.value=18;
      compressor.ratio.value=2.5; compressor.attack.value=0.008; compressor.release.value=0.18;
      mediaSource=audioCtx.createMediaElementSource(audio);
      mediaSource.connect(bassFilter);bassFilter.connect(compressor);compressor.connect(audioGain);audioGain.connect(audioCtx.destination);
    }
    if(audioCtx.state==="suspended")await audioCtx.resume();
  }
  function setBass(value){
    const max=isPremium?250:75;
    const v=Math.min(Number(value),max);
    $("bass-range").max=String(max);
    $("bass-value").textContent=v+"%";
    $("bass-tier").textContent=isPremium?"PREMIUM: do 250%":"FREE: do 75%";
    // Bass percentage maps to a conservative maximum of +12 dB, not raw system volume.
    if(bassFilter)bassFilter.gain.setTargetAtTime((v/max)*12,audioCtx.currentTime,0.08);
    $("bass-warning").classList.toggle("hidden",v<=75);
    if(v>75) $("bass-warning").textContent="⚠️ Mocny Bass Boost może zniekształcać dźwięk i zwiększać obciążenie słuchu. Zmniejsz głośność urządzenia.";
  }
  $("bass-range").addEventListener("input",e=>setBass(e.target.value));
  $("bass-reset").addEventListener("click",()=>{$("bass-range").value=0;setBass(0);});
  $("speed-range").addEventListener("input",e=>{const v=Number(e.target.value);$("speed-value").textContent=v.toFixed(2)+"×";$("audio-player").playbackRate=v;});
  document.querySelectorAll("[data-speed]").forEach(b=>b.addEventListener("click",()=>{$("speed-range").value=b.dataset.speed;$("speed-range").dispatchEvent(new Event("input"));}));

  $("audio-file").addEventListener("change",async e=>{
    const file=e.target.files[0];if(!file)return;
    if(!file.type.startsWith("audio/")){msg("player-message","Wybierz plik audio.",true);return;}
    stopLocal();
    localUrl=URL.createObjectURL(file);$("audio-player").src=localUrl;
    $("track-title").textContent=file.name;$("source-pill").textContent="LOCAL AUDIO";
    $("embed-container").classList.add("hidden");$("local-controls").classList.remove("hidden");
    $("speed-range").value=1;$("speed-range").dispatchEvent(new Event("input"));
    $("bass-range").value=0;setBass(0);
    try{await setupAudioGraph();await $("audio-player").play();msg("player-message","Plik gotowy. Możesz regulować tempo i bas.");}
    catch(err){msg("player-message","Przeglądarka nie uruchomiła odtwarzania automatycznie. Naciśnij Play.",true);}
  });
  $("premium-info-btn").addEventListener("click",()=>{
    msg("premium-message","Premium za 1 zł/miesiąc będzie odblokowywać rozszerzony Bass Boost do 250% i dodatkowe przetwarzanie audio. Płatności i weryfikacja subskrypcji nie są jeszcze podłączone.");
  });

  if(db){
    db.auth.getSession().then(({data})=>{user=data.session?.user||null;setUser();});
    db.auth.onAuthStateChange((_event,session)=>{user=session?.user||null;setUser();});
  }else{setUser();msg("auth-message","Tryb podglądu: dodaj dane Supabase w config.js, aby włączyć konta.");}
})();
