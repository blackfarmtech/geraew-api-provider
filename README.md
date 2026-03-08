 Guia de Integração — API de Geração de Mídia                                                                                                                             
                                                                                                                                                                           
  Base URL: http://localhost:3001/api                                                                                                                                     
                                                                                                                                                                           
  ---                                                       
  1. VÍDEO (Assíncrono — requer polling)

  1.1 Text-to-Video

  POST /api/videos/generate
  {
    "prompt": "A cat playing piano in a jazz bar",
    "aspectRatio": "16:9",
    "resolution": "720p",
    "durationSeconds": 8,
    "personGeneration": "allow_all"
  }

  ┌──────────────────┬────────┬─────────────┬────────────────────────┬───────────┐
  │      Campo       │  Tipo  │ Obrigatório │        Valores         │  Default  │
  ├──────────────────┼────────┼─────────────┼────────────────────────┼───────────┤
  │ prompt           │ string │ sim         │ —                      │ —         │
  ├──────────────────┼────────┼─────────────┼────────────────────────┼───────────┤
  │ aspectRatio      │ string │ não         │ 16:9, 9:16             │ 16:9      │
  ├──────────────────┼────────┼─────────────┼────────────────────────┼───────────┤
  │ resolution       │ string │ não         │ 720p, 1080p, 4k        │ 720p      │
  ├──────────────────┼────────┼─────────────┼────────────────────────┼───────────┤
  │ durationSeconds  │ number │ não         │ 4, 6, 8                │ 8         │
  ├──────────────────┼────────┼─────────────┼────────────────────────┼───────────┤
  │ personGeneration │ string │ não         │ allow_all, allow_adult │ allow_all │
  └──────────────────┴────────┴─────────────┴────────────────────────┴───────────┘

  1080p e 4k exigem durationSeconds: 8.

  Resposta:
  { "name": "projects/.../operations/abc-123" }

  ---
  1.2 Image-to-Video

  POST /api/videos/generate-from-image
  {
    "prompt": "The scene comes alive with movement",
    "imageBase64": "<BASE64_SEM_PREFIXO>",
    "imageMimeType": "image/png",
    "aspectRatio": "16:9",
    "resolution": "720p",
    "durationSeconds": 8
  }

  ┌─────────────────┬────────┬─────────────┬─────────────────────────────────────────┐
  │      Campo      │  Tipo  │ Obrigatório │                  Notas                  │
  ├─────────────────┼────────┼─────────────┼─────────────────────────────────────────┤
  │ prompt          │ string │ sim         │                                         │
  ├─────────────────┼────────┼─────────────┼─────────────────────────────────────────┤
  │ imageBase64     │ string │ sim         │ Base64 puro, sem data:image/png;base64, │
  ├─────────────────┼────────┼─────────────┼─────────────────────────────────────────┤
  │ imageMimeType   │ string │ não         │ Default: image/png                      │
  ├─────────────────┼────────┼─────────────┼─────────────────────────────────────────┤
  │ aspectRatio     │ string │ não         │ Default: 16:9                           │
  ├─────────────────┼────────┼─────────────┼─────────────────────────────────────────┤
  │ resolution      │ string │ não         │ Default: 720p                           │
  ├─────────────────┼────────┼─────────────┼─────────────────────────────────────────┤
  │ durationSeconds │ number │ não         │ Default: 8                              │
  └─────────────────┴────────┴─────────────┴─────────────────────────────────────────┘

  ---
  1.3 Geração com Referências

  POST /api/videos/generate-with-references
  {
    "prompt": "This character dances in a park",
    "referenceImages": [
      { "base64": "<BASE64>", "mimeType": "image/png", "referenceType": "asset" },
      { "base64": "<BASE64>", "mimeType": "image/jpeg", "referenceType": "asset" }
    ],
    "aspectRatio": "16:9",
    "resolution": "720p"
  }

  ┌─────────────────────────────────┬────────┬─────────────┬────────────────────┐
  │              Campo              │  Tipo  │ Obrigatório │       Notas        │
  ├─────────────────────────────────┼────────┼─────────────┼────────────────────┤
  │ prompt                          │ string │ sim         │                    │
  ├─────────────────────────────────┼────────┼─────────────┼────────────────────┤
  │ referenceImages                 │ array  │ sim         │ Min: 1, Max: 3     │
  ├─────────────────────────────────┼────────┼─────────────┼────────────────────┤
  │ referenceImages[].base64        │ string │ sim         │                    │
  ├─────────────────────────────────┼────────┼─────────────┼────────────────────┤
  │ referenceImages[].mimeType      │ string │ não         │ Default: image/png │
  ├─────────────────────────────────┼────────┼─────────────┼────────────────────┤
  │ referenceImages[].referenceType │ string │ não         │ Default: asset     │
  └─────────────────────────────────┴────────┴─────────────┴────────────────────┘

  ---
  1.4 Estender Vídeo

  POST /api/videos/extend
  {
    "prompt": "The camera pulls back revealing the city",
    "videoUri": "projects/.../generatedVideos/abc.mp4",
    "aspectRatio": "16:9"
  }

  ┌─────────────┬────────┬─────────────┐
  │    Campo    │  Tipo  │ Obrigatório │
  ├─────────────┼────────┼─────────────┤
  │ prompt      │ string │ sim         │
  ├─────────────┼────────┼─────────────┤
  │ videoUri    │ string │ sim         │
  ├─────────────┼────────┼─────────────┤
  │ aspectRatio │ string │ não         │
  └─────────────┴────────┴─────────────┘

  O videoUri é obtido do polling quando o vídeo anterior completa.

  ---
  1.5 Polling do Status

  GET /api/videos/status?operationName=projects/.../operations/abc-123

  Em progresso:
  { "name": "projects/.../operations/abc-123", "done": false }

  Concluído:
  {
    "name": "projects/.../operations/abc-123",
    "done": true,
    "response": {
      "generateVideoResponse": {
        "generatedSamples": [
          { "video": { "uri": "https://..." } }
        ]
      }
    }
  }

  Erro:
  {
    "name": "...",
    "done": true,
    "error": { "code": 400, "message": "Content policy violation" }
  }

  Fazer polling a cada 10 segundos. Geração leva de 30s a 6min.

  ---
  1.6 Stream/Download do Vídeo

  GET /api/videos/stream?operationName=projects/.../operations/abc-123

  Retorna o vídeo como stream com Content-Type: video/mp4.

  ---
  2. IMAGEM (Síncrono)

  2.1 Gerar / Editar Imagem

  POST /api/images/generate

  Text-to-Image:
  {
    "prompt": "A watercolor sunset over mountains",
    "aspectRatio": "1:1",
    "imageSize": "2K"
  }

  Edição (imagem + prompt):
  {
    "prompt": "Remove the background and add a beach",
    "imageBase64": "<BASE64_SEM_PREFIXO>",
    "imageMimeType": "image/png",
    "aspectRatio": "16:9",
    "imageSize": "2K"
  }

  ┌───────────────┬────────┬─────────────┬───────────────────────────────────────────────┬─────────┐
  │     Campo     │  Tipo  │ Obrigatório │                    Valores                    │ Default │
  ├───────────────┼────────┼─────────────┼───────────────────────────────────────────────┼─────────┤
  │ prompt        │ string │ sim         │ —                                             │ —       │
  ├───────────────┼────────┼─────────────┼───────────────────────────────────────────────┼─────────┤
  │ imageBase64   │ string │ não         │ Base64 puro                                   │ —       │
  ├───────────────┼────────┼─────────────┼───────────────────────────────────────────────┼─────────┤
  │ imageMimeType │ string │ não         │ image/png, image/jpeg, image/webp             │ —       │
  ├───────────────┼────────┼─────────────┼───────────────────────────────────────────────┼─────────┤
  │ aspectRatio   │ string │ não         │ 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9 │ 1:1     │
  ├───────────────┼────────┼─────────────┼───────────────────────────────────────────────┼─────────┤
  │ imageSize     │ string │ não         │ 512px, 1K, 2K, 4K                             │ 1K      │
  └───────────────┴────────┴─────────────┴───────────────────────────────────────────────┴─────────┘

  Se imageBase64 for enviado → edição. Sem ele → geração do zero.

  Resposta:
  {
    "imageData": "<BASE64_DA_IMAGEM_GERADA>",
    "mimeType": "image/png",
    "text": "Descrição opcional do modelo"
  }

  ---
  3. FLUXO DE INTEGRAÇÃO

  VÍDEO:
  1. POST /api/videos/generate       → { name: "op-123" }
  2. GET  /api/videos/status?operationName=op-123  (loop a cada 10s)
  3. Quando done=true → extrair response.generateVideoResponse.generatedSamples[0].video.uri
  4. GET  /api/videos/stream?operationName=op-123  → MP4 stream

  IMAGEM:
  1. POST /api/images/generate        → { imageData, mimeType }
  2. Decodificar imageData (base64)   → pronto

  ---
  4. ERROS

  Todos os endpoints retornam erros no formato:

  {
    "statusCode": 400,
    "message": "Resolution 1080p and 4k require durationSeconds to be 8"
  }

  ┌────────┬─────────────────────────────────────────────────┐
  │ Status │                      Causa                      │
  ├────────┼─────────────────────────────────────────────────┤
  │ 400    │ Validação (campos inválidos, regras de negócio) │
  ├────────┼─────────────────────────────────────────────────┤
  │ 502    │ Erro na API Gemini upstream                     │
  └────────┴─────────────────────────────────────────────────┘

✻ Worked for 38s                                      