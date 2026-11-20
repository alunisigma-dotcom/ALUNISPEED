# ALUNISPEED — pliki startowe

## Co jest w paczce
- `index.html` — układ strony
- `styles.css` — wygląd
- `app.js` — odtwarzacz, logowanie, playlisty i suwaki
- `config.js` — konfiguracja Supabase
- `supabase.sql` — tabele i zabezpieczenia bazy
- Zakładka `Import Music` — rozpoznaje i otwiera linki w oficjalnych odtwarzaczach

## Uruchomienie
1. Rozpakuj ZIP.
2. Otwórz `index.html` w przeglądarce albo opublikuj folder przez GitHub Pages.
3. Aby włączyć konta i zapis playlist, utwórz projekt w Supabase.
4. W Supabase otwórz SQL Editor, wklej zawartość `supabase.sql` i uruchom.
5. W ustawieniach projektu skopiuj Project URL oraz anon/public key.
6. Wklej je do `config.js` w pola `SUPABASE_URL` i `SUPABASE_ANON_KEY`.

Nie umieszczaj klucza `service_role` w plikach strony.

## Odtwarzanie i efekty
- YouTube, Spotify i SoundCloud są odtwarzane przez oficjalne osadzone odtwarzacze.
- Serwisy te nie udostępniają stronie uniwersalnego sterowania prędkością ani basem. Nie próbujemy obchodzić ich ograniczeń.
- Własne pliki audio mają regulację prędkości oraz Bass Boost przez Web Audio API.
- Bass Boost powyżej 75% pokazuje ostrzeżenie. To ostrzeżenie nie jest pomiarem bezpieczeństwa; głośność słuchawek ustawiaj rozsądnie.

## Ważne przed uruchomieniem publicznym
To jest prototyp frontendowy. Nie ma jeszcze produkcyjnego backendu dla limitu 15 utworów dziennie, płatności 1 zł/miesiąc, Premium ani jednorazowego kodu `ALUNISTAR244`. Te rzeczy trzeba wdrożyć po stronie serwera, aby użytkownik nie mógł ich sobie sam odblokować przez zmianę JavaScriptu. Płatności wymagają też konfiguracji operatora i spełnienia jego warunków. Nie przechowuj danych kart płatniczych na własnym serwerze.


## Import Music
Zakładka Import Music przyjmuje linki Spotify, YouTube i SoundCloud oraz otwiera je w oficjalnym osadzonym odtwarzaczu. Nie pobiera plików MP3 z tych serwisów.
