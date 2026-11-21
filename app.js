(() => {
  const $ = id => document.getElementById(id);
  const OWNER_EMAIL = "alunisigma@gmail.com";
  const cfg = window.ALUNISPEED_CONFIG || {};
  const configured = /^https:\/\/.+\.supabase\.co$/.test(cfg.SUPABASE_URL || "") && !!cfg.SUPABASE_ANON_KEY && !String(cfg.SUPABASE_ANON_KEY).includes("YOUR_PUBLIC_KEY");
  const db = configured && window.supabase ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  let user = null, isOwner = false, isPremium = false, localUrl = null, activePlaylistId = null, notificationChannel = null;
  let audioCtx = null, bassFilter = null, mediaSource = null, compressor = null;
  const inlineAudioGraphs = new WeakMap();
  const bassGainDb = value => (Math.min(Number(value) || 0, isPremium ? 250 : 75) / (isPremium ? 250 : 75)) * (isPremium ? 24 : 18);

  const msg = (id, text, error = false) => { const el = $(id); if (el) { el.textContent = text; el.style.color = error ? "#ff9baf" : "#8df0c2"; } };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const needDb = () => { if (!db) { msg("auth-message", "Sprawdź config.js: Project URL i klucz Publishable.", true); return false; } return true; };
  function showView(view) {
    ["home", "library", "notifications", "owner"].forEach(v => $(v + "-view").classList.toggle("hidden", v !== view));
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  }
  function setUser() {
    $("user-label").textContent = user ? user.email : "Niezalogowano";
    $("logout-btn").classList.toggle("hidden", !user);
    $("auth-open").classList.toggle("hidden", !!user);
    $("auth-panel").classList.toggle("hidden", !!user);
    $("owner-nav").classList.toggle("hidden", !isOwner);
    $("plan-label").textContent = isOwner ? "OWNER • PREMIUM" : (isPremium ? "PREMIUM" : "FREE");
    $("plan-note").textContent = isOwner ? "Bezterminowy dostęp właściciela." : "Odbieraj playlisty i słuchaj muzyki.";
    if (isOwner) document.body.classList.add("owner-theme"); else document.body.classList.remove("owner-theme");
  }
  async function auth(mode) {
    if (!needDb()) return;
    const email = $("email").value.trim(), password = $("password").value;
    try {
      if (mode === "signup") {
        const { error } = await db.auth.signUp({ email, password, options: { emailRedirectTo: "http://alunispeed.pl/" } });
        msg("auth-message", error ? error.message : "Konto utworzone. Sprawdź e-mail, aby potwierdzić rejestrację.", !!error);
      } else {
        const { data, error } = await db.auth.signInWithPassword({ email, password });
        if (error) msg("auth-message", error.message, true); else await applySession(data.user);
      }
    } catch (e) { msg("auth-message", e.message || "Nie udało się połączyć z Supabase.", true); }
  }
  async function applySession(nextUser) {
    user = nextUser || null;
    isOwner = !!user && user.email?.toLowerCase() === OWNER_EMAIL;
    isPremium = isOwner;
    setUser();
    if (!user || !db) return;
    try {
      await db.from("profiles").upsert({ id: user.id, email: user.email }, { onConflict: "id" });
      await Promise.all([loadPlaylists(), loadNotifications()]);
      if (notificationChannel) await db.removeChannel(notificationChannel);
      notificationChannel = db.channel("alunispeed-notifications-" + user.id)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: "recipient_user_id=eq." + user.id }, () => loadNotifications())
        .subscribe();
    } catch (e) { console.error(e); }
  }
  $("auth-form").addEventListener("submit", e => { e.preventDefault(); auth("login"); });
  $("signup-btn").addEventListener("click", () => auth("signup"));
  // Request a password recovery email.
  const resetBtn = $("reset-password-btn");
  if (resetBtn) resetBtn.addEventListener("click", async () => {
    if (!needDb()) return;
    const email = $("email").value.trim();
    if (!email) {
      msg("auth-message", "Wpisz najpierw adres e-mail konta.", true);
      $("email").focus();
      return;
    }
    resetBtn.disabled = true;
    msg("auth-message", "Wysyłam link do resetowania hasła…");
    try {
      const { error } = await db.auth.resetPasswordForEmail(email, {
        redirectTo: "https://alunisigma-dotcom.github.io/ALUNISPEED/"
      });
      msg("auth-message", error
        ? error.message
        : "Jeśli konto istnieje, wysłaliśmy link. Otwórz go i ustaw nowe hasło na stronie ALUNISPEED. Sprawdź też SPAM.");
    } catch (err) {
      msg("auth-message", err.message || "Nie udało się wysłać linku resetującego.", true);
    } finally {
      resetBtn.disabled = false;
    }
  });

  // After the recovery link opens the site, Supabase emits PASSWORD_RECOVERY.
  const resetForm = $("password-reset-form");
  if (resetForm) resetForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!needDb()) return;
    const password = $("new-password").value;
    const confirmation = $("confirm-new-password").value;
    if (password.length < 6) {
      msg("password-reset-message", "Hasło musi mieć co najmniej 6 znaków.", true);
      return;
    }
    if (password !== confirmation) {
      msg("password-reset-message", "Hasła nie są identyczne.", true);
      return;
    }
    const saveBtn = $("save-new-password-btn");
    saveBtn.disabled = true;
    msg("password-reset-message", "Zapisuję nowe hasło…");
    try {
      const { error } = await db.auth.updateUser({ password });
      if (error) throw error;
      resetForm.reset();
      $("password-reset-panel").classList.add("hidden");
      await db.auth.signOut();
      user = null; isOwner = false; isPremium = false;
      setUser();
      $("auth-panel").classList.remove("hidden");
      msg("auth-message", "Hasło zostało zmienione. Zaloguj się teraz nowym hasłem.");
    } catch (err) {
      msg("password-reset-message", err.message || "Nie udało się zmienić hasła.", true);
    } finally {
      saveBtn.disabled = false;
    }
  });

  $("logout-btn").addEventListener("click", async () => { if (db) { if (notificationChannel) await db.removeChannel(notificationChannel); await db.auth.signOut(); } notificationChannel = null; user = null; isOwner = false; isPremium = false; setUser(); showView("home"); });
  $("auth-open").addEventListener("click", () => $("auth-panel").scrollIntoView({ behavior: "smooth" }));
  document.querySelectorAll(".nav-btn").forEach(b => b.addEventListener("click", () => showView(b.dataset.view)));

  async function setupAudioGraph() {
    const audio = $("audio-player");
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      bassFilter = audioCtx.createBiquadFilter(); bassFilter.type = "lowshelf"; bassFilter.frequency.value = 120;
      compressor = audioCtx.createDynamicsCompressor(); compressor.threshold.value = -18; compressor.knee.value = 18; compressor.ratio.value = 2.5;
      mediaSource = audioCtx.createMediaElementSource(audio);
      mediaSource.connect(bassFilter); bassFilter.connect(compressor); compressor.connect(audioCtx.destination);
    }
    if (audioCtx.state === "suspended") await audioCtx.resume();
  }
  function applyBass(value) {
    const max = isPremium ? 250 : 75, v = Math.min(Number(value), max);
    $("bass-range").max = String(max); $("bass-value").textContent = v + "%";
    if (bassFilter && audioCtx) bassFilter.gain.setTargetAtTime((v / max) * (isPremium ? 24 : 18), audioCtx.currentTime, .08);
    $("bass-warning").classList.toggle("hidden", v <= 75);
  }
  $("bass-range").addEventListener("input", e => applyBass(e.target.value));
  $("speed-range").addEventListener("input", e => { const v = Number(e.target.value); $("speed-value").textContent = v.toFixed(2) + "×"; $("audio-player").playbackRate = v; });
  document.querySelectorAll("[data-speed]").forEach(b => b.addEventListener("click", () => { $("speed-range").value = b.dataset.speed; $("speed-range").dispatchEvent(new Event("input")); }));
  async function playUrl(url, title, bass = 0, blobUrl = null) {
    const audio = $("audio-player");
    // Release only the previous local file. Do not revoke the URL we are about to play.
    if (localUrl && localUrl !== blobUrl) URL.revokeObjectURL(localUrl);
    localUrl = blobUrl;
    audio.pause();
    audio.crossOrigin = "anonymous";
    audio.removeAttribute("src");
    audio.load();
    audio.src = url;
    audio.load();
    $("track-title").textContent = title;
    $("source-pill").textContent = blobUrl ? "LOCAL AUDIO" : "ALUNISPEED MUSIC";
    $("embed-container").classList.add("hidden");
    $("local-controls").classList.remove("hidden");
    $("speed-range").value = "1";
    $("speed-value").textContent = "1.00×";
    audio.playbackRate = 1;
    $("bass-range").value = String(bass);
    // Audio effects are optional: failure to create Web Audio must not prevent normal playback.
    try { await setupAudioGraph(); applyBass(bass); }
    catch (effectError) { console.warn("Efekty audio niedostępne; odtwarzam bez EQ.", effectError); }
    try {
      await audio.play();
      msg("player-message", "Odtwarzanie: " + title);
    } catch (playError) {
      console.warn("Autoplay zablokowany lub format nieobsługiwany.", playError);
      msg("player-message", "Plik załadowany. Naciśnij Play. Jeśli nadal nie działa, spróbuj przekonwertować plik do MP3.");
    }
  }
  $("audio-file").addEventListener("change", async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!(file.type.startsWith("audio/") || /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|webm)$/i.test(file.name))) {
      msg("player-message", "Wybierz plik audio (MP3, WAV, OGG, M4A lub FLAC).", true);
      e.target.value = "";
      return;
    }
    const blobUrl = URL.createObjectURL(file);
    try {
      await playUrl(blobUrl, file.name, 0, blobUrl);
      $("source-pill").textContent = "LOCAL AUDIO";
    } catch (err) {
      console.error(err);
      URL.revokeObjectURL(blobUrl);
      localUrl = null;
      msg("player-message", "Nie udało się załadować pliku. Spróbuj innego MP3 lub WAV.", true);
    }
  });

  async function loadPlaylists() {
    if (!user) return;

    // Load the user's own playlists and separately load playlists explicitly
    // shared with this account. This avoids relying on a broad "select all"
    // query and makes the recipient path explicit.
    const [ownResult, sharesResult] = await Promise.all([
      db.from("playlists")
        .select("id,name,owner_id,created_at")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false }),
      db.from("playlist_shares")
        .select("playlist_id")
        .eq("recipient_user_id", user.id)
    ]);

    if (ownResult.error) {
      console.error("Nie udało się pobrać własnych playlist:", ownResult.error);
      $("playlist-list").innerHTML = `<p class="muted">${esc(ownResult.error.message)}</p>`;
      return;
    }
    if (sharesResult.error) {
      console.error("Nie udało się pobrać udostępnionych playlist:", sharesResult.error);
      $("playlist-list").innerHTML = `<p class="muted">${esc(sharesResult.error.message)}</p>`;
      return;
    }

    const sharedIds = [...new Set((sharesResult.data || []).map(row => row.playlist_id).filter(Boolean))];
    let sharedPlaylists = [];
    if (sharedIds.length) {
      const sharedResult = await db.from("playlists")
        .select("id,name,owner_id,created_at")
        .in("id", sharedIds)
        .order("created_at", { ascending: false });

      if (sharedResult.error) {
        console.error("Nie udało się pobrać otrzymanych playlist:", sharedResult.error);
        $("playlist-list").innerHTML = `<p class="muted">${esc(sharedResult.error.message)}</p>`;
        return;
      }
      sharedPlaylists = sharedResult.data || [];
    }

    const byId = new Map();
    for (const playlist of [...(ownResult.data || []), ...sharedPlaylists]) {
      byId.set(playlist.id, playlist);
    }
    const data = [...byId.values()].sort((a, b) =>
      new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );

    if (!data.length) {
      $("playlist-list").innerHTML = '<p class="muted">Nie masz jeszcze playlist. Gdy OWNER coś Ci wyśle, pojawi się tutaj.</p>';
      return;
    }

    $("playlist-list").innerHTML = data.map(p => `<article class="playlist-card"><div class="card-top"><span class="eyebrow">ALUNISPEED PLAYLIST</span><span class="pill">${p.owner_id === user.id ? "WŁASNA" : "OTRZYMANA"}</span></div><h3>${esc(p.name)}</h3><p>Otwórz, aby zobaczyć utwory i ustawienia basu.</p><button class="button small" data-open-playlist="${p.id}">Otwórz playlistę</button></article>`).join("");
    document.querySelectorAll("[data-open-playlist]").forEach(b => b.addEventListener("click", () => openPlaylist(b.dataset.openPlaylist)));
  }
  async function setupInlineAudio(audio, initialBass) {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      if (!audioCtx) audioCtx = new Ctx();
      let graph = inlineAudioGraphs.get(audio);
      if (!graph) {
        const source = audioCtx.createMediaElementSource(audio);
        const filter = audioCtx.createBiquadFilter();
        filter.type = "lowshelf";
        filter.frequency.value = 110;
        source.connect(filter);
        filter.connect(audioCtx.destination);
        graph = { filter };
        inlineAudioGraphs.set(audio, graph);
      }
      graph.filter.gain.setTargetAtTime(bassGainDb(initialBass), audioCtx.currentTime, .06);
      if (audioCtx.state === "suspended") await audioCtx.resume();
      return graph;
    } catch (err) {
      console.warn("Inline bass EQ unavailable; native audio remains available.", err);
      return null;
    }
  }

  async function openPlaylist(id) {
    const { data: playlist, error } = await db.from("playlists").select("id,name,owner_id").eq("id", id).single();
    if (error) { msg("player-message", error.message, true); return; }
    const { data: items, error: itemError } = await db.from("playlist_items").select("id,title,object_path,mime_type,position").eq("playlist_id", id).order("position");
    if (itemError) { msg("player-message", itemError.message, true); return; }
    const { data: setting } = await db.from("user_playlist_settings").select("bass_percent").eq("user_id", user.id).eq("playlist_id", id).maybeSingle();
    const playlistBass = setting?.bass_percent ?? 0;
    const maxBass = isPremium ? 250 : 75;
    $("playlist-list").innerHTML = `<div class="playlist-detail"><button class="ghost" id="back-library">← Wróć do playlist</button><p class="eyebrow">NOWA WIADOMOŚĆ AUDIO</p><h2>${esc(playlist.name)}</h2><p class="muted">Otrzymana playlista — każdy utwór możesz odtworzyć bez opuszczania tej strony.</p><div class="control-block"><label>Bas całej playlisty <strong id="playlist-bass-value">${playlistBass}%</strong></label><input id="playlist-bass" type="range" min="0" max="${maxBass}" value="${playlistBass}"/><button class="button outline small" id="save-playlist-bass">Zapisz bas playlisty</button></div><div id="playlist-track-list" class="track-list"></div></div>`;
    $("back-library").addEventListener("click", loadPlaylists);
    const playlistSlider = $("playlist-bass");
    playlistSlider.addEventListener("input", () => {
      $("playlist-bass-value").textContent = playlistSlider.value + "%";
      document.querySelectorAll("[data-track-bass]").forEach(slider => {
        if (!slider.dataset.custom) { slider.value = playlistSlider.value; const audio = document.querySelector(`[data-voice-audio="${slider.dataset.trackBass}"]`); const graph = audio && inlineAudioGraphs.get(audio); if (graph && audioCtx) graph.filter.gain.setTargetAtTime(bassGainDb(slider.value), audioCtx.currentTime, .06); }
      });
    });
    $("save-playlist-bass").addEventListener("click", async () => { const v = Number(playlistSlider.value); const { error } = await db.from("user_playlist_settings").upsert({ user_id: user.id, playlist_id: id, bass_percent: v }, { onConflict: "user_id,playlist_id" }); msg("player-message", error ? error.message : "Zapisano bas playlisty.", !!error); });
    if (!items?.length) { $("playlist-track-list").innerHTML = '<p class="muted">Ta playlista nie ma jeszcze utworów.</p>'; showView("library"); return; }
    const { data: settings } = await db.from("user_track_settings").select("playlist_item_id,bass_percent").eq("user_id", user.id).in("playlist_item_id", items.map(x => x.id));
    const byItem = Object.fromEntries((settings || []).map(x => [x.playlist_item_id, x.bass_percent]));
    $("playlist-track-list").innerHTML = items.map((t, i) => {
      const initial = byItem[t.id] ?? playlistBass;
      return `<article class="voice-note"><div class="voice-note-head"><span class="voice-avatar">♫</span><div class="voice-note-title"><b>${i + 1}. ${esc(t.title)}</b><span class="muted tiny">${esc(t.mime_type || "Wiadomość audio")}</span></div><span class="pill">AUDIO</span></div><audio class="voice-audio" controls preload="none" data-voice-audio="${t.id}" aria-label="Odtwórz ${esc(t.title)}"></audio><label class="voice-bass">Bass Boost <strong data-bass-label="${t.id}">${initial}%</strong><input type="range" min="0" max="${maxBass}" value="${initial}" data-track-bass="${t.id}"/></label><span class="tiny muted" data-audio-status="${t.id}">Przygotowuję wiadomość audio…</span></article>`;
    }).join("");
    showView("library");
    for (const item of items) {
      const audio = document.querySelector(`[data-voice-audio="${item.id}"]`);
      const slider = document.querySelector(`[data-track-bass="${item.id}"]`);
      const status = document.querySelector(`[data-audio-status="${item.id}"]`);
      audio.crossOrigin = "anonymous";
      audio.addEventListener("play", async () => { const graph = await setupInlineAudio(audio, slider.value); if (graph && audioCtx.state === "suspended") await audioCtx.resume(); });
      audio.addEventListener("error", () => { status.textContent = "Nie udało się załadować audio. Spróbuj odświeżyć playlistę."; });
      slider.addEventListener("input", () => {
        slider.dataset.custom = "1";
        document.querySelector(`[data-bass-label="${item.id}"]`).textContent = slider.value + "%";
        const graph = inlineAudioGraphs.get(audio);
        if (graph && audioCtx) graph.filter.gain.setTargetAtTime(bassGainDb(slider.value), audioCtx.currentTime, .06);
      });
      slider.addEventListener("change", async () => {
        const { error } = await db.from("user_track_settings").upsert({ user_id: user.id, playlist_item_id: item.id, bass_percent: Number(slider.value) }, { onConflict: "user_id,playlist_item_id" });
        if (error) msg("player-message", error.message, true);
      });
      try {
        const { data: signed, error } = await db.storage.from("music").createSignedUrl(item.object_path, 3600);
        if (error) throw error;
        if (!signed?.signedUrl) throw new Error("Brak linku do pliku audio.");
        audio.src = signed.signedUrl;
        audio.load();
        status.textContent = "Gotowe — naciśnij Play, aby odsłuchać.";
      } catch (err) {
        status.textContent = "Błąd audio: " + (err.message || "nieznany błąd");
      }
    }
    activePlaylistId = id;
  }

  async function loadNotifications() {
    if (!user) return;
    const { data, error } = await db.from("notifications").select("id,message,playlist_id,read_at,created_at").order("created_at", { ascending: false }).limit(30);
    if (error) { console.error(error); return; }
    const unread = (data || []).filter(n => !n.read_at).length;
    $("notification-count").textContent = unread; $("notification-count").classList.toggle("hidden", unread === 0);
    $("notification-list").innerHTML = data?.length ? data.map(n => `<article class="notification-card ${n.read_at ? "read" : "unread"}"><div><b>${n.read_at ? "Powiadomienie" : "✦ Nowe powiadomienie"}</b><p>${esc(n.message)}</p><span class="tiny muted">${new Date(n.created_at).toLocaleString("pl-PL")}</span></div><div class="notification-actions">${n.playlist_id ? `<button class="button small" data-notif-open="${n.id}" data-playlist="${n.playlist_id}">Otwórz playlistę</button>` : ""}</div></article>`).join("") : '<p class="muted">Nie masz nowych powiadomień.</p>';
    document.querySelectorAll("[data-notif-open]").forEach(b => b.addEventListener("click", async () => { await db.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", b.dataset.notifOpen); await loadNotifications(); showView("library"); await openPlaylist(b.dataset.playlist); }));
  }

  $("send-playlist-form").addEventListener("submit", async e => {
    e.preventDefault(); if (!isOwner || !user) { msg("owner-message", "Brak uprawnień OWNER.", true); return; }
    const name = $("owner-playlist-name").value.trim(), email = $("recipient-email").value.trim().toLowerCase(), files = [...$("owner-audio-files").files];
    if (!files.length) { msg("owner-message", "Wybierz co najmniej jeden plik.", true); return; }
    if (files.some(f => !(f.type.startsWith("audio/") || /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|webm)$/i.test(f.name)))) { msg("owner-message", "Wszystkie pliki muszą być plikami audio.", true); return; }
    let uploadStage = "sprawdzanie odbiorcy";
    msg("owner-message", "Sprawdzam odbiorcę…");
    try {
      uploadStage = "sprawdzanie odbiorcy";
      const { data: recipient, error: findError } = await db.from("profiles").select("id,email").eq("email", email).maybeSingle();
      if (findError) throw findError;
      if (!recipient) throw new Error("Nie znaleziono zarejestrowanego użytkownika o takim e-mailu.");

      uploadStage = "tworzenie playlisty";
      msg("owner-message", "Tworzę playlistę…");
      const { data: playlist, error: pError } = await db.from("playlists").insert({ owner_id: user.id, user_id: user.id, name }).select("id").single();
      if (pError) throw pError;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
        const objectPath = `${playlist.id}/${crypto.randomUUID()}-${safeName}`;
        uploadStage = "wysyłanie pliku do Storage";
        msg("owner-message", `Wysyłam plik ${i + 1}/${files.length}…`);
        const { error: uploadError } = await db.storage.from("music").upload(objectPath, file, { contentType: file.type || "application/octet-stream", upsert: false });
        if (uploadError) throw uploadError;

        uploadStage = "dodawanie utworu do playlisty";
        msg("owner-message", `Dodaję utwór ${i + 1}/${files.length}…`);
        const { error: itemError } = await db.from("playlist_items").insert({ playlist_id: playlist.id, title: file.name, object_path: objectPath, mime_type: file.type || "audio", position: i });
        if (itemError) throw itemError;
      }

      uploadStage = "udostępnianie playlisty";
      msg("owner-message", "Udostępniam playlistę odbiorcy…");
      const { error: shareError } = await db.from("playlist_shares").insert({ playlist_id: playlist.id, recipient_user_id: recipient.id, shared_by: user.id });
      if (shareError) throw shareError;

      uploadStage = "tworzenie powiadomienia";
      msg("owner-message", "Tworzę powiadomienie…");
      const { error: noteError } = await db.from("notifications").insert({ recipient_user_id: recipient.id, playlist_id: playlist.id, message: `Otrzymałeś nową playlistę „${name}” od ALUNISPEED.` });
      if (noteError) throw noteError;

      msg("owner-message", `Gotowe! Playlista „${name}” została wysłana do ${email}.`);
      $("send-playlist-form").reset();
    } catch (err) {
      console.error("ALUNISPEED playlist send failed at:", uploadStage, err);
      msg("owner-message", `${uploadStage}: ${err.message || "Nie udało się wysłać playlisty."}`, true);
    }
  });

  async function init() {
    if (!db) { setUser(); msg("auth-message", "Uzupełnij config.js danymi Supabase.", true); return; }
    // Register BEFORE getSession(): Supabase may process the recovery URL during
    // initialization and emit PASSWORD_RECOVERY immediately.
    let recoveryMode = false;
    db.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        recoveryMode = true;
        $("password-reset-panel").classList.remove("hidden");
        $("auth-panel").classList.add("hidden");
        $("password-reset-panel").scrollIntoView({ behavior: "smooth", block: "center" });
      }
      // Keep the authenticated session, but do not let the recovery screen
      // disappear while the user is choosing a new password.
      if (event === "SIGNED_OUT") {
        recoveryMode = false;
        $("password-reset-panel").classList.add("hidden");
      }
      applySession(session?.user || null).then(() => {
        if (recoveryMode) {
          $("password-reset-panel").classList.remove("hidden");
          $("auth-panel").classList.add("hidden");
        }
      });
    });
    const { data, error } = await db.auth.getSession(); if (error) console.error(error);
    await applySession(data.session?.user || null);
  }
  init();
})();
