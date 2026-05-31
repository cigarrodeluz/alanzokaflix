# alanzoka — acervo completo

Site de fã, moderno e fluido, com **TODOS** os vídeos dos dois canais do alanzoka
(`@alanzoka` e `@livesalanzoka`) — busca, filtro, ordenação e player do YouTube embutido,
sem sair do site.

## Rodar
É um site estático. Sirva a pasta com qualquer servidor:

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

(Precisa de um servidor por causa do `fetch` do `data/videos.json`.)

## Atualizar o acervo
Os vídeos ficam em cache em `data/videos.json`. Para regerar com os vídeos mais recentes:

```bash
python3 -m venv .venv
./.venv/bin/pip install yt-dlp
./.venv/bin/python scripts/fetch_videos.py
```

O script usa o `yt-dlp` (sem precisar de chave da API do YouTube) para puxar a lista
completa de uploads de cada canal.

## Análise inteligente (datas, descrições e grupos)
- **Agrupamento em séries/temas** — `data/groups.json`. Detecta jogos e temas
  (Melhores Clipes, Xracing sustos de moto, etc.) pelo segmento recorrente dos títulos:
  ```bash
  ./.venv/bin/python scripts/group_videos.py
  ```
- **Datas + descrições** — `data/meta.json` (`{id:[data, descrição]}`).
  - Caminho lento, sem chave (roda em segundo plano, retomável): vários workers
    ```bash
    for i in 0 1 2 3 4; do nohup ./.venv/bin/python scripts/enrich_videos.py 5 $i & done
    ./.venv/bin/python scripts/merge_meta.py   # junta o que já foi coletado
    ```
    O YouTube limita a taxa, então leva horas para os ~7.880 vídeos. O site usa o que
    estiver em `data/meta.json` e ignora o resto sem quebrar.
  - Caminho rápido, com chave da API (recomendado, ~158 chamadas):
    ```bash
    export YT_API_KEY=sua_chave
    python3 scripts/enrich_api.py && ./.venv/bin/python scripts/merge_meta.py
    ```

## Como funciona
- `index.html` / `css/styles.css` / `js/app.js` — front-end estático (sem build).
- `data/videos.json` — `{id, título, duração, views, canal, ordem}` de cada vídeo.
- Thumbnails: `https://i.ytimg.com/vi/<id>/mqdefault.jpg`. Player: `youtube.com/embed/<id>`.
- Fluidez com ~7.880 vídeos: renderização em lotes (scroll infinito via `IntersectionObserver`)
  + thumbnails com `loading="lazy"` + `content-visibility:auto`.
