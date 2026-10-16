#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
if [[ $EUID -eq 0 ]]; then
  echo 'Esegui come utente normale, senza sudo.' >&2
  exit 1
fi
if ! command -v gnome-shell >/dev/null || ! command -v gnome-extensions >/dev/null; then
  echo 'Serve GNOME Shell con gnome-extensions.' >&2
  exit 1
fi
major="$(gnome-shell --version | grep -oE '[0-9]+' | head -n1)"
if [[ "$major" != 46 ]]; then
  echo "Questa versione è progettata per GNOME Shell 46; rilevata: $major" >&2
  exit 1
fi
uuid='keychron-batteries-widget@fglabs.local'
dest="$HOME/.local/share/gnome-shell/extensions/$uuid"
backup_dir="${XDG_STATE_HOME:-$HOME/.local/state}/cello/backups"
if [[ -d "$dest" ]]; then
  mkdir -p "$backup_dir"
  archive="$backup_dir/extension-$(date +%Y%m%d-%H%M%S)-$$.tar.gz"
  tar -czf "$archive" -C "$(dirname "$dest")" "$uuid"
  echo "Versione precedente salvata in: $archive"
fi
mkdir -p "$dest" "${XDG_CONFIG_HOME:-$HOME/.config}"
install -m 644 extension/metadata.json extension/extension.js extension/batterySource.js extension/stylesheet.css extension/LICENSE "$dest/"
cp -R extension/locale "$dest/"
# Preserve the user's placement and appearance across upgrades.
if [[ ! -f "${XDG_CONFIG_HOME:-$HOME/.config}/keychron-batteries-widget.json" ]]; then
  printf '{"position":"top-left","appearance":"auto"}\n' > "${XDG_CONFIG_HOME:-$HOME/.config}/keychron-batteries-widget.json"
fi
if gnome-extensions enable "$uuid"; then
  echo 'File di Cello aggiornati; estensione abilitata.'
else
  echo 'Aggiornata. Se non la vedi subito, esci e rientra nella sessione.'
fi
cat <<'INFO'

Cello installato.
- Anelli di carica, percentuali e icone in stile Batterie di iOS
- Aspetto automatico dallo sfondo, oppure chiaro/scuro dal menu
- Tasto destro o pulsante ⋮ per posizione, aspetto e aggiornamento
- Dimensioni adattive all'area utile del desktop

Su Wayland, dopo un aggiornamento esci e rientra nella sessione:
GNOME mantiene in memoria il codice JavaScript già caricato.
INFO
