# Geração de Imagens — Documentação de Implementação

Este documento descreve como as rotas de geração de imagens estão implementadas no backend (NestJS) e como consumi-las.

## Visão geral

O módulo `ImageModule` (`backend/src/image`) expõe duas rotas que geram imagens através do **Google Vertex AI**:

| Rota | Modelo | Caso de uso |
|------|--------|-------------|
| `POST /api/image/generate` | Imagen (`:predict`) | Geração pura text-to-image |
| `POST /api/image/generate-gemini` | Gemini Image (`:streamGenerateContent`) | Geração e **edição** com imagens de referência |

Toda chamada à Vertex AI passa pelo `VertexService.proxyRequest`, que cuida de autenticação, rotação de contas GCP e retries.

```
Controller (image.controller.ts)
   └─> ImageService (image.service.ts)   ← monta o payload da Vertex
         └─> VertexService.proxyRequest   ← auth, rotação de conta, retry
               └─> Vertex AI (googleapis.com)
```

## Configuração global

Definida em `backend/src/main.ts`:

- **Prefixo global**: `/api` → todas as rotas começam com `/api`.
- **Autenticação**: header `x-api-key` (declarado no Swagger via `@ApiSecurity('x-api-key')`).
- **Validação**: `ValidationPipe({ transform: true, whitelist: true })` — campos não declarados no DTO são descartados; tipos são convertidos automaticamente.
- **Limite de body**: `50mb` (necessário para imagens em base64).
- **Porta**: `8012`. Swagger em `http://localhost:8012/docs`.

---

## 1. `POST /api/image/generate` — Imagen

Gera imagens text-to-image usando o endpoint `:predict` do Imagen e retorna a **resposta crua da Vertex AI**.

### DTO de entrada — `GenerateImageDto`

| Campo | Tipo | Obrigatório | Vira (parâmetro Vertex) | Observações |
|-------|------|-------------|-------------------------|-------------|
| `prompt` | string | ✅ | `instances[0].prompt` | Prompt de texto |
| `count` | number | — | `sampleCount` (default `1`) | Quantidade de imagens |
| `model` | string | — | path do modelo | Ex.: `nano-banana-2` |
| `aspect_ratio` | string | — | `aspectRatio` | Ex.: `16:9` |
| `negative_prompt` | string | — | `negativePrompt` | O que evitar |
| `language` | string | — | `language` | Ex.: `pt` |
| `person_generation` | enum | — | `personGeneration` | `dont_allow` \| `allow_adult` \| `allow_all` |
| `safety_setting` | enum | — | `safetySetting` | `block_low_and_above` \| `block_medium_and_above` \| `block_only_high` \| `block_none` |
| `sample_image_size` | enum | — | `sampleImageSize` | `1K` \| `2K` |
| `seed` | number | — | `seed` | Reprodutibilidade |
| `enhance_prompt` | boolean | — | `enhancePrompt` | |
| `add_watermark` | boolean | — | `addWatermark` | |
| `mime_type` | string | — | `outputOptions.mimeType` | Ex.: `image/png` |
| `location` | string | — | região / default `global` | |

### Payload montado para a Vertex

```jsonc
// POST /v1/projects/{PROJECT_ID}/locations/{location}/publishers/google/models/{model}:predict
{
  "instances": [{ "prompt": "A futuristic cityscape at sunset, cyberpunk style" }],
  "parameters": {
    "sampleCount": 1,
    "aspectRatio": "16:9"
    // demais parâmetros adicionados condicionalmente quando enviados
  }
}
```

> `{PROJECT_ID}` é substituído pelo `VertexService` com base na conta GCP adquirida em runtime.

### Exemplo de requisição

```bash
curl -X POST http://localhost:8012/api/image/generate \
  -H "Content-Type: application/json" \
  -H "x-api-key: SUA_CHAVE" \
  -d '{
    "prompt": "A futuristic cityscape at sunset, cyberpunk style",
    "count": 1,
    "model": "nano-banana-2",
    "aspect_ratio": "16:9"
  }'
```

A resposta é a saída direta da Vertex AI (`predictions` com as imagens em base64).

---

## 2. `POST /api/image/generate-gemini` — Gemini Image

Gera **ou edita** imagens usando o endpoint `:streamGenerateContent` do Gemini. Suporta enviar imagens de referência para edição. A resposta é **normalizada** em uma lista de `parts`.

### DTO de entrada — `GenerateGeminiImageDto`

| Campo | Tipo | Obrigatório | Observações |
|-------|------|-------------|-------------|
| `prompt` | string | ✅ | Prompt de texto |
| `model` | enum | — | `gemini-3-pro-image-preview` \| `gemini-3.1-flash-image-preview` |
| `aspect_ratio` | enum | — | `1:1`, `3:2`, `2:3`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9` |
| `image_size` | string | — | `imageConfig.imageSize` |
| `mime_type` | string | — | `imageConfig.imageOutputOptions.mimeType` |
| `images` | `GeminiInputImage[]` | — | Imagens de referência para edição |

`GeminiInputImage`:

| Campo | Tipo | Obrigatório | Observações |
|-------|------|-------------|-------------|
| `base64` | string | ✅ | Imagem codificada em base64 |
| `mime_type` | string | — | Default `image/png` |

### Como o payload é montado (`image.service.ts`)

- `generationConfig` fixo: `temperature: 1`, `maxOutputTokens: 32768`, `topP: 0.95`, `responseModalities: ['IMAGE']`, mais o `imageConfig` derivado do DTO.
- `personGeneration` default = `ALLOW_ALL`.
- `safetySettings`: todas as categorias de harm com threshold `OFF`.
- As imagens de `images[]` viram `parts` com `inlineData` (vêm **antes** do texto), seguidas do `{ text: prompt }`.

```jsonc
// POST .../models/{model}:streamGenerateContent
{
  "contents": [{
    "role": "user",
    "parts": [
      { "inlineData": { "mimeType": "image/png", "data": "<base64>" } }, // se houver imagens
      { "text": "Transform this photo into a watercolor painting" }
    ]
  }],
  "generationConfig": { /* ... */ },
  "safetySettings": [ /* OFF em todas as categorias */ ]
}
```

### Normalização da resposta

`streamGenerateContent` retorna um **array de chunks**. O service itera todos os chunks e os candidatos, montando:

```jsonc
{
  "parts": [
    { "type": "text", "text": "Here is your image" },
    { "type": "image", "base64": "<...>", "mimeType": "image/png" }
  ]
}
```

Se nenhum candidato com `content.parts` for retornado, lança `400 BadRequest` (`"No content generated. Try a different prompt."`).

### Exemplo de requisição (edição com imagem de referência)

```bash
curl -X POST http://localhost:8012/api/image/generate-gemini \
  -H "Content-Type: application/json" \
  -H "x-api-key: SUA_CHAVE" \
  -d '{
    "prompt": "Transform this photo into a watercolor painting",
    "model": "gemini-3-pro-image-preview",
    "aspect_ratio": "1:1",
    "images": [{ "base64": "<BASE64_DA_IMAGEM>", "mime_type": "image/png" }]
  }'
```

---

## Autenticação e rotação de contas (`VertexService.proxyRequest`)

Toda chamada de imagem delega para `proxyRequest`, que:

1. Adquire uma conta GCP (`accountManager.acquireAccount()`) → retorna `accountId`, `token` (Bearer) e `projectId`.
2. Substitui `{PROJECT_ID}` no path.
3. Faz a chamada HTTP (`axios`) com `Authorization: Bearer <token>`, timeout de 800s.
4. Em erro `403`/`429`, verifica se é problema de billing via `handleBillingError`. Se for, **troca de conta e tenta de novo** (até `MAX_RETRIES = 3`).
5. Loga sucesso/falha no banco via `LoggingService` usando o `requestLogId` da requisição.

### Códigos de erro relevantes

| Status | Significado |
|--------|-------------|
| `400` | Dados inválidos ou nenhum conteúdo gerado (Gemini) |
| `403` | Forbidden não relacionado a billing |
| `503` | Contas GCP indisponíveis |
| `502` | Falha genérica na Vertex / max retries excedido |

---

## Como adicionar uma nova rota de imagem

1. **DTO**: crie em `backend/src/image/dto/` com decorators `class-validator` + `@ApiProperty`/`@ApiPropertyOptional` para o Swagger.
2. **Service**: adicione um método em `ImageService` que monta o `body` e o `path` da Vertex e chama `this.vertexService.proxyRequest(...)`. Passe sempre o `requestLogId`.
3. **Controller**: adicione o handler `@Post(...)` em `ImageController` com `@ApiOperation`/`@ApiResponse`, recebendo `@Body() dto` e `@Req() req`, e passando `req['requestLogId']` ao service.
4. O `ValidationPipe` global já valida/transforma o DTO automaticamente — não é preciso configurar nada por rota.

> Obs.: `ImageModule` não importa `VertexModule` porque `VertexModule` é declarado como `@Global()` (`backend/src/vertex/vertex.module.ts`) e registrado no `AppModule`. Por isso `VertexService` pode ser injetado diretamente no `ImageService` sem import adicional.
