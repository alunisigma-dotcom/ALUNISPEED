# ALUNISPEED — OWNER + playlist sharing

## Co zawiera paczka
- `index.html` — odtwarzacz, biblioteka, powiadomienia i OWNER PANEL.
- `app.js` — logowanie Supabase, wysyłanie playlist, odbieranie powiadomień, odtwarzanie i ustawienia basu.
- `styles.css` — styl VIP/OWNER.
- `supabase.sql` — tabele, prywatny bucket Storage i polityki RLS.
- `config.example.js` — przykład konfiguracji; nie zastępuje Twojego `config.js`.

## Instalacja
1. Zrób kopię aktualnego repozytorium.
2. Podmień na GitHubie `index.html`, `app.js` i `styles.css`.
3. Zachowaj swój istniejący `config.js` z Project URL i kluczem Publishable. Nie publikuj klucza Secret/service_role.
4. W Supabase → SQL Editor uruchom `supabase.sql`.
5. W Supabase → Authentication → URL Configuration ustaw Site URL na `https://alunisigma-dotcom.github.io/ALUNISPEED/` i dodaj ten sam adres do Redirect URLs.
6. Upewnij się, że konto `alunisigma@gmail.com` istnieje i jest potwierdzone. RLS przyznaje uprawnienia OWNER wyłącznie na podstawie e-maila z uwierzytelnionego tokenu.
7. Odśwież stronę przez Ctrl+F5.

## Jak wysłać playlistę
1. Zaloguj się na `alunisigma@gmail.com`.
2. Otwórz OWNER PANEL.
3. Podaj nazwę playlisty, e-mail zarejestrowanego odbiorcy i wybierz pliki audio.
4. Kliknij „WYŚLIJ PLAYLISTĘ”.
5. Odbiorca zobaczy powiadomienie po zalogowaniu i playlistę w „Moje playlisty”.

## Ważne
- OWNER PANEL jest ograniczony po stronie bazy przez RLS; ukrycie przycisku w HTML nie jest zabezpieczeniem.
- Audio jest przechowywane w prywatnym bucket `music`, a odtwarzanie korzysta z krótkotrwałych podpisanych linków.
- Wysyłaj tylko muzykę, do której masz prawa lub zgodę na dystrybucję. Limit jednego pliku to 50 MB.
- Bas playlisty i bas pojedynczego utworu są osobistymi ustawieniami odbiorcy. To przetwarzanie dźwięku w odtwarzaczu ALUNISPEED, nie całego systemu.
- W tej wersji OWNER ma Premium bezterminowe. Pozostałe płatności/subskrypcje nie są aktywowane.
- Jeśli masz już tabele o tych samych nazwach ze starszym, innym schematem, najpierw sprawdź ich strukturę przed uruchomieniem SQL; nie usuwaj istniejących danych.
