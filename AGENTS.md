# Istruzioni per gli agenti

## Regola permanente: pipeline dei file derivati

La **fonte di verità** è `titles/<slug>.json` (più `meta.json`). Ogni altro file di dati è **generato**: non va mai modificato a mano.

Dopo **OGNI** modifica a `titles/*.json` o `meta.json`, esegui obbligatoriamente questi comandi **in quest'ordine**:

```bash
node build-db.mjs                 # 1. rigenera db.json
node to-pictorium-snapshot.mjs    # 2. rigenera anime-filler-own-map.json
```

Poi valida:

```bash
node build-db.mjs --check         # fallisce se db.json è stantio
node validate-db.mjs db.json
node --test
```

## Avvertenza critica: non fermarti a db.json

**MAI fermarsi a `db.json`.** Rigenera **SEMPRE** anche `anime-filler-own-map.json`. Se lo snapshot non viene rigenerato, Pictorium locale **resta fermo al giorno prima**: `generatedAt` e `sourceSha256` rimangono obsoleti e i dati mostrati non riflettono la modifica appena fatta. `db.json` aggiornato ma snapshot vecchio = pipeline incompleta.

## Ruolo dei file

| File | Ruolo |
| --- | --- |
| `titles/<slug>.json` | **Sorgente**: qui si modifica |
| `db.json` | **Generato** da `build-db.mjs` — mai editare a mano |
| `anime-filler-own-map.json` | **Generato** da `to-pictorium-snapshot.mjs` — snapshot `schemaVersion: 2` per Pictorium |

## Check locale in Pictorium

1. Copia `anime-filler-own-map.json` in `src/generated/` del progetto Pictorium locale.
2. Ricarica Pictorium per verificare i dati aggiornati.
3. In alternativa, disabilita il refresh automatico delle 24h (`PICTORIUM_FILLER_OWN_URL=off`), altrimenti Pictorium può sovrascrivere la copia locale con lo snapshot pubblico remoto.

Pictorium legge lo snapshot locale da `src/generated/` come fonte preferita; lo snapshot pubblico CC BY 4.0 è solo fallback e non viene mai unito a runtime.
