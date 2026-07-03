# Guia de Implementação — Rotas de Geração de Imagem (Vertex AI)

> Documento para ser entregue a um agente Claude reproduzir/portar essas rotas em outro projeto.
> Stack de origem: **NestJS 11 + Prisma + Google Vertex AI** (Imagen + Gemini Image).
> O backend funciona como um **proxy autenticado** para a API do Vertex AI, com rotação de
> múltiplas contas GCP (OAuth2 refresh token) para distribuir cota e contornar erros de billing.

---

## 1. Visão geral da arquitetura

```
Cliente
  │  POST /api/image/generate           (Imagen)
  │  POST /api/image/generate-gemini    (Gemini Image)
  │  header: x-api-key
  ▼
ApiKeyGuard ──► ImageController ──► ImageService
                                       │
                                       ▼
                              VertexService.proxyRequest()
                                       │  (monta URL, injeta Bearer token, retry)
                                       ▼
                            AccountManagerService.acquireAccount()
                                       │  (round-robin entre contas GCP, refresh OAuth2)
                                       ▼
                       https://aiplatform.googleapis.com/v1/projects/{PROJECT_ID}/...
```

Peças necessárias (todas documentadas abaixo):

| Componente | Função |
|---|---|
| `ImageController` | Expõe as 2 rotas HTTP |
| `ImageService` | Monta o body no formato do Vertex e interpreta a resposta |
| `VertexService` | Proxy genérico: autentica, faz a chamada HTTP, retry em erro de billing |
| `AccountManagerService` | Carrega contas GCP do banco, rotaciona, faz refresh do access token OAuth2 |
| `ApiKeyGuard` | Protege todas as rotas via header `x-api-key` |
| DTOs + `class-validator` | Validação/whitelisting do payload |

Dependência mínima do módulo de imagem: **só precisa do `VertexService`**.
Se o projeto de destino já tiver autenticação Vertex própria, você só precisa portar
`ImageController` + `ImageService` + DTOs e adaptar a chamada ao seu cliente Vertex.

---

## 2. Dependências (package.json)

```jsonc
{
  "dependencies": {
    "@nestjs/common": "^11",
    "@nestjs/core": "^11",
    "@nestjs/config": "^4",
    "@nestjs/swagger": "^11",
    "@prisma/client": "^6",
    "axios": "^1",
    "class-transformer": "^0.5",
    "class-validator": "^0.15",
    "google-auth-library": "^10",
    "reflect-metadata": "^0.2",
    "rxjs": "^7"
  }
}
```

Variáveis de ambiente:

```env
API_KEY=<chave-que-o-cliente-envia-no-header-x-api-key>
DATABASE_URL=<conexão-do-prisma>   # usado pelo AccountManager para carregar contas GCP
```

---

## 3. Endpoint 1 — `POST /api/image/generate` (Imagen)

Gera imagens **a partir de texto** usando os modelos Imagen / nano-banana do Vertex AI.
Retorna **a resposta crua do Vertex AI** (`:predict`), que contém as imagens em base64.

### Request body (`GenerateImageDto`)

| Campo | Tipo | Obrigatório | Default | Vira (param Vertex) |
|---|---|---|---|---|
| `prompt` | string | ✅ | — | `instances[0].prompt` |
| `count` | number | ❌ | `1` | `parameters.sampleCount` |
| `model` | string | ❌ | (defina, ex. `nano-banana-2` / `imagen-3.0-generate-002`) | path do modelo |
| `aspect_ratio` | string | ❌ | — | `parameters.aspectRatio` (ex. `16:9`) |
| `negative_prompt` | string | ❌ | — | `parameters.negativePrompt` |
| `language` | string | ❌ | — | `parameters.language` |
| `person_generation` | enum `dont_allow`/`allow_adult`/`allow_all` | ❌ | — | `parameters.personGeneration` |
| `safety_setting` | enum `block_low_and_above`/`block_medium_and_above`/`block_only_high`/`block_none` | ❌ | — | `parameters.safetySetting` |
| `sample_image_size` | enum `1K`/`2K` | ❌ | — | `parameters.sampleImageSize` |
| `seed` | number | ❌ | — | `parameters.seed` |
| `enhance_prompt` | boolean | ❌ | — | `parameters.enhancePrompt` |
| `add_watermark` | boolean | ❌ | — | `parameters.addWatermark` |
| `mime_type` | string | ❌ | — | `parameters.outputOptions.mimeType` |
| `location` | string | ❌ | `global` | região no path / endpoint |

### Body montado para o Vertex AI

```json
{
  "instances": [{ "prompt": "<prompt>" }],
  "parameters": {
    "sampleCount": 1,
    "aspectRatio": "16:9",
    "negativePrompt": "blurry, low quality",
    "personGeneration": "allow_all",
    "outputOptions": { "mimeType": "image/png" }
  }
}
```

### URL chamada

```
POST https://aiplatform.googleapis.com/v1/projects/{PROJECT_ID}/locations/{location}/publishers/google/models/{model}:predict
```

---

## 4. Endpoint 2 — `POST /api/image/generate-gemini` (Gemini Image)

Gera **ou edita** imagens usando os modelos **Gemini Image** (`gemini-3-pro-image-preview`,
`gemini-3.1-flash-image-preview`). Suporta enviar imagens de referência em base64 para edição.
Diferente do Imagen, este endpoint **interpreta a resposta** e retorna um array normalizado de `parts`.

### Request body (`GenerateGeminiImageDto`)

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| `prompt` | string | ✅ | Instrução de geração/edição |
| `model` | enum `gemini-3-pro-image-preview` / `gemini-3.1-flash-image-preview` | ❌ | |
| `aspect_ratio` | enum `1:1`,`3:2`,`2:3`,`3:4`,`4:3`,`4:5`,`5:4`,`9:16`,`16:9`,`21:9` | ❌ | `imageConfig.aspectRatio` |
| `image_size` | string | ❌ | `imageConfig.imageSize` |
| `mime_type` | string | ❌ | `imageConfig.imageOutputOptions.mimeType` |
| `person_generation` | string | ❌ | default `ALLOW_ALL` |
| `images[]` | `{ base64, mime_type? }` | ❌ | imagens de referência p/ edição |

### Body montado para o Vertex AI

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        { "inlineData": { "mimeType": "image/png", "data": "<base64-da-imagem-de-referência>" } },
        { "text": "<prompt>" }
      ]
    }
  ],
  "generationConfig": {
    "temperature": 1,
    "maxOutputTokens": 32768,
    "topP": 0.95,
    "responseModalities": ["IMAGE"],
    "imageConfig": {
      "aspectRatio": "16:9",
      "personGeneration": "ALLOW_ALL",
      "imageOutputOptions": { "mimeType": "image/png" }
    }
  },
  "safetySettings": [
    { "category": "HARM_CATEGORY_HATE_SPEECH",       "threshold": "OFF" },
    { "category": "HARM_CATEGORY_DANGEROUS_CONTENT",  "threshold": "OFF" },
    { "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",  "threshold": "OFF" },
    { "category": "HARM_CATEGORY_HARASSMENT",         "threshold": "OFF" }
  ]
}
```

> Observação: as imagens de referência entram **antes** do `{ text: prompt }` dentro de `parts`.

### URL chamada

```
POST https://aiplatform.googleapis.com/v1/projects/{PROJECT_ID}/locations/global/publishers/google/models/{model}:streamGenerateContent
```

> `:streamGenerateContent` retorna um **array de chunks**. O serviço concatena todos os `parts`
> de todos os chunks.

### Resposta normalizada retornada ao cliente

```json
{
  "parts": [
    { "type": "text",  "text": "Here is your image" },
    { "type": "image", "base64": "<...>", "mimeType": "image/png" }
  ]
}
```

Se nenhum candidato com `content.parts` voltar ⇒ `400 Bad Request` ("No content generated").

---

## 5. Código completo

### 5.1 `image/dto/generate-image.dto.ts`

```ts
import { IsString, IsOptional, IsNumber, IsBoolean, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GenerateImageDto {
  @ApiProperty({ description: 'Prompt de texto para gerar a imagem', example: 'A futuristic cityscape at sunset, cyberpunk style' })
  @IsString()
  prompt: string;

  @ApiPropertyOptional({ description: 'Quantidade de imagens a gerar', default: 1, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  count?: number;

  @ApiPropertyOptional({ description: 'Modelo do Imagen', default: 'nano-banana-2' })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({ description: 'Proporção da imagem', example: '16:9' })
  @IsOptional()
  @IsString()
  aspect_ratio?: string;

  @ApiPropertyOptional({ description: 'Prompt negativo (o que evitar)', example: 'blurry, low quality' })
  @IsOptional()
  @IsString()
  negative_prompt?: string;

  @ApiPropertyOptional({ description: 'Idioma do prompt', example: 'pt' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ description: 'Política de geração de pessoas', enum: ['dont_allow', 'allow_adult', 'allow_all'] })
  @IsOptional()
  @IsIn(['dont_allow', 'allow_adult', 'allow_all'])
  person_generation?: string;

  @ApiPropertyOptional({ description: 'Nível de filtragem de segurança', enum: ['block_low_and_above', 'block_medium_and_above', 'block_only_high', 'block_none'] })
  @IsOptional()
  @IsIn(['block_low_and_above', 'block_medium_and_above', 'block_only_high', 'block_none'])
  safety_setting?: string;

  @ApiPropertyOptional({ description: 'Tamanho da amostra de imagem', enum: ['1K', '2K'] })
  @IsOptional()
  @IsIn(['1K', '2K'])
  sample_image_size?: string;

  @ApiPropertyOptional({ description: 'Seed para reprodutibilidade', example: 42 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  seed?: number;

  @ApiPropertyOptional({ description: 'Melhorar o prompt automaticamente' })
  @IsOptional()
  @IsBoolean()
  enhance_prompt?: boolean;

  @ApiPropertyOptional({ description: 'Adicionar marca d\'água à imagem' })
  @IsOptional()
  @IsBoolean()
  add_watermark?: boolean;

  @ApiPropertyOptional({ description: 'MIME type da imagem de saída', example: 'image/png' })
  @IsOptional()
  @IsString()
  mime_type?: string;

  @ApiPropertyOptional({ description: 'Região do Vertex AI', default: 'us-central1' })
  @IsOptional()
  @IsString()
  location?: string;
}
```

### 5.2 `image/dto/generate-gemini-image.dto.ts`

```ts
import { IsString, IsOptional, IsIn, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GeminiInputImage {
  @ApiProperty({ description: 'Imagem em base64' })
  @IsString()
  base64: string;

  @ApiPropertyOptional({ description: 'MIME type da imagem', default: 'image/png', example: 'image/png' })
  @IsOptional()
  @IsString()
  mime_type?: string;
}

export class GenerateGeminiImageDto {
  @ApiProperty({ description: 'Prompt de texto para gerar/editar a imagem', example: 'Transform this photo into a watercolor painting' })
  @IsString()
  prompt: string;

  @ApiPropertyOptional({ description: 'Modelo Gemini a utilizar' })
  @IsOptional()
  @IsString()
  @IsIn(['gemini-3-pro-image-preview', 'gemini-3.1-flash-image-preview'])
  model?: string;

  @ApiPropertyOptional({ description: 'Proporção da imagem', enum: ['1:1', '3:2', '2:3', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'] })
  @IsOptional()
  @IsIn(['1:1', '3:2', '2:3', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'])
  aspect_ratio?: string;

  @ApiPropertyOptional({ description: 'Tamanho da imagem de saída' })
  @IsOptional()
  @IsString()
  image_size?: string;

  @ApiPropertyOptional({ description: 'MIME type da imagem de saída', example: 'image/png' })
  @IsOptional()
  @IsString()
  mime_type?: string;

  @ApiPropertyOptional({ description: 'Imagens de input para edição/referência', type: [GeminiInputImage] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GeminiInputImage)
  images?: GeminiInputImage[];
}
```

### 5.3 `image/image.controller.ts`

```ts
import { Controller, Post, Body, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity } from '@nestjs/swagger';
import { Request } from 'express';
import { ImageService } from './image.service';
import { GenerateImageDto } from './dto/generate-image.dto';
import { GenerateGeminiImageDto } from './dto/generate-gemini-image.dto';

@ApiTags('Image')
@ApiSecurity('x-api-key')
@Controller('image')
export class ImageController {
  constructor(private readonly imageService: ImageService) {}

  @Post('generate')
  @ApiOperation({ summary: 'Gerar imagem (Imagen)', description: 'Gera imagens usando o modelo Imagen do Vertex AI. Retorna a resposta direta da API Vertex AI com as imagens geradas.' })
  @ApiResponse({ status: 201, description: 'Imagem gerada com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados de entrada inválidos' })
  @ApiResponse({ status: 503, description: 'Contas GCP indisponíveis' })
  async generate(@Body() dto: GenerateImageDto, @Req() req: Request) {
    return this.imageService.generateImage(dto, req['requestLogId']);
  }

  @Post('generate-gemini')
  @ApiOperation({ summary: 'Gerar imagem (Gemini)', description: 'Gera ou edita imagens usando o modelo Gemini. Suporta envio de imagens de referência para edição. Retorna partes de texto e imagem.' })
  @ApiResponse({ status: 201, description: 'Imagem gerada com sucesso', schema: { example: { parts: [{ type: 'text', text: 'Here is your image' }, { type: 'image', base64: '...', mimeType: 'image/png' }] } } })
  @ApiResponse({ status: 400, description: 'Nenhum conteúdo gerado ou dados inválidos' })
  @ApiResponse({ status: 503, description: 'Contas GCP indisponíveis' })
  async generateGemini(@Body() dto: GenerateGeminiImageDto, @Req() req: Request) {
    return this.imageService.generateGeminiImage(dto, req['requestLogId']);
  }
}
```

> `req['requestLogId']` é opcional — vem de um interceptor de logging. Se o projeto de destino
> não tiver esse interceptor, basta remover o segundo argumento das chamadas.

### 5.4 `image/image.service.ts`

```ts
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VertexService } from '../vertex/vertex.service';

const DEFAULT_LOCATION = 'global';

@Injectable()
export class ImageService {
  private readonly logger = new Logger(ImageService.name);

  constructor(
    private readonly vertexService: VertexService,
    private readonly configService: ConfigService,
  ) {}

  async generateImage(dto: {
    prompt: string;
    count?: number;
    model?: string;
    aspect_ratio?: string;
    negative_prompt?: string;
    language?: string;
    person_generation?: string;
    safety_setting?: string;
    sample_image_size?: string;
    seed?: number;
    enhance_prompt?: boolean;
    add_watermark?: boolean;
    mime_type?: string;
    location?: string;
  }, requestLogId?: string) {
    const location = dto.location || DEFAULT_LOCATION;
    const model = dto.model;

    const parameters: Record<string, any> = {
      sampleCount: dto.count || 1,
    };

    if (dto.aspect_ratio) parameters.aspectRatio = dto.aspect_ratio;
    if (dto.negative_prompt) parameters.negativePrompt = dto.negative_prompt;
    if (dto.language) parameters.language = dto.language;
    if (dto.person_generation) parameters.personGeneration = dto.person_generation;
    if (dto.safety_setting) parameters.safetySetting = dto.safety_setting;
    if (dto.sample_image_size) parameters.sampleImageSize = dto.sample_image_size;
    if (dto.seed !== undefined) parameters.seed = dto.seed;
    if (dto.enhance_prompt !== undefined) parameters.enhancePrompt = dto.enhance_prompt;
    if (dto.add_watermark !== undefined) parameters.addWatermark = dto.add_watermark;
    if (dto.mime_type) {
      parameters.outputOptions = { mimeType: dto.mime_type };
    }

    const body = {
      instances: [{ prompt: dto.prompt }],
      parameters,
    };

    const path =
      '/v1/projects/{PROJECT_ID}/locations/' +
      `${location}/publishers/google/models/${model}:predict`;

    return this.vertexService.proxyRequest('POST', path, body, location, false, requestLogId);
  }

  async generateGeminiImage(dto: {
    prompt: string;
    model?: string;
    aspect_ratio?: string;
    image_size?: string;
    mime_type?: string;
    person_generation?: string;
    images?: Array<{ base64: string; mime_type?: string }>;
  }, requestLogId?: string) {
    const location = DEFAULT_LOCATION;
    const model = dto.model;

    const imageConfig: Record<string, any> = {};
    if (dto.aspect_ratio) imageConfig.aspectRatio = dto.aspect_ratio;
    if (dto.image_size) imageConfig.imageSize = dto.image_size;
    if (dto.mime_type) {
      imageConfig.imageOutputOptions = { mimeType: dto.mime_type };
    }

    imageConfig.personGeneration = dto.person_generation || 'ALLOW_ALL';

    const generationConfig: Record<string, any> = {
      temperature: 1,
      maxOutputTokens: 32768,
      topP: 0.95,
      responseModalities: ['IMAGE'],
      imageConfig,
    };

    const safetySettings = [
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'OFF' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'OFF' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'OFF' },
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'OFF' },
    ];

    const userParts: any[] = [];
    if (dto.images?.length) {
      for (const img of dto.images) {
        userParts.push({
          inlineData: {
            mimeType: img.mime_type || 'image/png',
            data: img.base64,
          },
        });
      }
    }
    userParts.push({ text: dto.prompt });

    const body: Record<string, any> = {
      contents: [{ role: 'user', parts: userParts }],
      generationConfig,
      safetySettings,
    };

    const path =
      '/v1/projects/{PROJECT_ID}/locations/' +
      `${location}/publishers/google/models/${model}:streamGenerateContent`;

    const data = await this.vertexService.proxyRequest(
      'POST', path, body, location, false, requestLogId,
    );

    // streamGenerateContent retorna um array de chunks
    const chunks = Array.isArray(data) ? data : [data];
    const candidate = chunks[0]?.candidates?.[0];
    if (!candidate?.content?.parts) {
      throw new BadRequestException('No content generated. Try a different prompt.');
    }

    const parts: Array<
      | { type: 'text'; text: string }
      | { type: 'image'; base64: string; mimeType: string }
    > = [];

    for (const chunk of chunks) {
      const cand = chunk?.candidates?.[0];
      if (!cand?.content?.parts) continue;
      for (const part of cand.content.parts) {
        if (part.text) {
          parts.push({ type: 'text', text: part.text });
        }
        if (part.inlineData) {
          parts.push({
            type: 'image',
            base64: part.inlineData.data,
            mimeType: part.inlineData.mimeType,
          });
        }
      }
    }

    return { parts };
  }
}
```

### 5.5 `image/image.module.ts`

```ts
import { Module } from '@nestjs/common';
import { ImageController } from './image.controller';
import { ImageService } from './image.service';

@Module({
  controllers: [ImageController],
  providers: [ImageService],
})
export class ImageModule {}
```

> `VertexService` é provido por um módulo `@Global()` (ver §6), por isso não precisa
> ser importado aqui explicitamente.

---

## 6. Infraestrutura de suporte (proxy + contas GCP)

> Se o projeto de destino **já** tem uma forma de chamar o Vertex AI autenticado, pule esta
> seção e apenas substitua `this.vertexService.proxyRequest(...)` pela sua chamada equivalente.
> O contrato esperado é: `proxyRequest(method, path, body, location, useRegionalEndpoint, requestLogId)`
> onde `path` contém o placeholder `{PROJECT_ID}` e o retorno é o `response.data` cru do Vertex.

### 6.1 `vertex/vertex.service.ts` — proxy genérico com retry

```ts
import { Injectable, HttpException, Logger } from '@nestjs/common';
import axios from 'axios';
import { AccountManagerService } from '../account-manager/account-manager.service';
import { LoggingService } from '../logging/logging.service';

@Injectable()
export class VertexService {
  private readonly logger = new Logger(VertexService.name);
  private static readonly MAX_RETRIES = 3;

  constructor(
    private readonly accountManager: AccountManagerService,
    private readonly loggingService: LoggingService,
  ) {}

  async proxyRequest(
    method: string,
    path: string,
    body: any,
    location: string,
    useRegionalEndpoint = false,
    requestLogId?: string,
  ): Promise<any> {
    for (let attempt = 1; attempt <= VertexService.MAX_RETRIES; attempt++) {
      const { id: accountId, token, projectId } =
        await this.accountManager.acquireAccount();
      const resolvedPath = path.replace(/\{PROJECT_ID\}/g, projectId);
      const baseUrl = useRegionalEndpoint
        ? `https://${location}-aiplatform.googleapis.com`
        : `https://aiplatform.googleapis.com`;
      const url = `${baseUrl}${resolvedPath}`;

      try {
        const response = await axios({
          method,
          url,
          data: body || undefined,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 800_000,
        });
        return response.data;
      } catch (error) {
        const status = error.response?.status;
        const errorData = error.response?.data;
        const errorText = JSON.stringify(errorData || '');

        this.logger.warn(
          `Request failed (attempt ${attempt}, account=${accountId}): status=${status} error=${errorText.substring(0, 200)}`,
        );

        // 403/429: pode ser billing — desativa a conta e tenta a próxima
        if (status === 403 || status === 429) {
          const isBilling = await this.accountManager.handleBillingError(errorText, accountId);
          if (isBilling) continue;
          throw new HttpException(errorData?.error?.message || 'Forbidden', 403);
        }

        throw new HttpException(errorData?.error?.message || 'Vertex AI request failed', status || 502);
      }
    }
    throw new HttpException('Max retries exceeded', 502);
  }
}
```

> O `LoggingService` foi omitido das chamadas acima por brevidade. No projeto original
> cada sucesso/falha também grava em banco. Remova ou substitua pelo seu logger.

### 6.2 `vertex/vertex.module.ts`

```ts
import { Global, Module } from '@nestjs/common';
import { VertexService } from './vertex.service';

@Global()
@Module({
  providers: [VertexService],
  exports: [VertexService],
})
export class VertexModule {}
```

### 6.3 `account-manager/account-manager.service.ts` — rotação de contas GCP

Responsabilidades:
1. Carrega do banco (Prisma) todas as contas com `active = true`.
2. `acquireAccount()` → round-robin entre as contas, devolvendo `{ id, token, projectId }`.
3. Faz **refresh do access token OAuth2** (via `google-auth-library`) com cache de 5 min de margem.
4. `handleBillingError()` → detecta frases de billing, **desativa a conta no banco** e remove da rotação.

```ts
import { Injectable, OnModuleInit, Logger, ServiceUnavailableException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../prisma/prisma.service';

interface AccountInfo {
  dbId: string;
  projectId: string;
  oauth2Client: OAuth2Client;
  accessToken: string | null;
  tokenExpiry: number;
}

@Injectable()
export class AccountManagerService implements OnModuleInit {
  private readonly logger = new Logger(AccountManagerService.name);
  private accounts = new Map<string, AccountInfo>();
  private accountIds: string[] = [];
  private activeIndex = 0;
  private refreshPromises = new Map<string, Promise<void>>();

  constructor(private readonly prisma: PrismaService) {}

  private static readonly BILLING_PHRASES = [
    'billing account not found',
    'free trial has expired',
    'billingnotenabled',
    'billing is not enabled',
    'billing disabled',
    'this api method requires billing',
    'cloud billing is not enabled',
    'project has been suspended',
    'the project to be billed is associated with an absent billing account',
  ];

  async onModuleInit() {
    await this.reloadAccounts();
  }

  async reloadAccounts() {
    const rows = await this.prisma.googleCredential.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });

    this.accounts.clear();
    this.accountIds = [];
    this.activeIndex = 0;
    this.refreshPromises.clear();

    for (const row of rows) {
      const oauth2Client = new OAuth2Client(row.clientId, row.clientSecret);
      oauth2Client.setCredentials({ refresh_token: row.refreshToken });

      this.accounts.set(row.name, {
        dbId: row.id,
        projectId: row.quotaProjectId,
        oauth2Client,
        accessToken: null,
        tokenExpiry: 0,
      });
      this.accountIds.push(row.name);
    }

    if (this.accounts.size === 0) {
      this.logger.warn('No active credentials found in database');
    }
  }

  async acquireAccount(): Promise<{ id: string; token: string; projectId: string }> {
    if (this.accountIds.length === 0) {
      throw new ServiceUnavailableException('No GCP accounts configured');
    }

    const id = this.accountIds[this.activeIndex];
    this.activeIndex = (this.activeIndex + 1) % this.accountIds.length;

    const account = this.accounts.get(id);
    if (!account) {
      throw new ServiceUnavailableException('All GCP accounts are exhausted');
    }

    const token = await this.ensureToken(id, account);
    return { id, token, projectId: account.projectId };
  }

  private async ensureToken(accountId: string, account: AccountInfo): Promise<string> {
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;

    if (account.accessToken && account.tokenExpiry - now > fiveMinutes) {
      return account.accessToken;
    }

    // dedup de refresh concorrente para a mesma conta
    const existing = this.refreshPromises.get(accountId);
    if (existing) {
      await existing;
      return account.accessToken!;
    }

    const promise = this.refreshToken(accountId, account);
    this.refreshPromises.set(accountId, promise);
    try {
      await promise;
    } finally {
      this.refreshPromises.delete(accountId);
    }
    return account.accessToken!;
  }

  private async refreshToken(accountId: string, account: AccountInfo): Promise<void> {
    const { credentials } = await account.oauth2Client.refreshAccessToken();
    account.accessToken = credentials.access_token!;
    account.tokenExpiry = credentials.expiry_date || Date.now() + 3600 * 1000;
  }

  async handleBillingError(errorText: string, accountId: string): Promise<boolean> {
    const lower = (errorText || '').toLowerCase();
    const isBilling = AccountManagerService.BILLING_PHRASES.some((p) => lower.includes(p));
    if (!isBilling) return false;

    const account = this.accounts.get(accountId);
    if (account) {
      await this.prisma.googleCredential.update({
        where: { id: account.dbId },
        data: { active: false },
      });
      this.accounts.delete(accountId);
      const idx = this.accountIds.indexOf(accountId);
      if (idx !== -1) {
        this.accountIds.splice(idx, 1);
        if (idx < this.activeIndex && this.activeIndex > 0) this.activeIndex -= 1;
      }
    }

    if (this.accountIds.length === 0) {
      throw new ServiceUnavailableException(
        'All GCP accounts are exhausted. No billing credits remaining.',
      );
    }
    this.activeIndex = this.activeIndex % this.accountIds.length;
    return true;
  }
}
```

```ts
// account-manager/account-manager.module.ts
import { Global, Module } from '@nestjs/common';
import { AccountManagerService } from './account-manager.service';

@Global()
@Module({
  providers: [AccountManagerService],
  exports: [AccountManagerService],
})
export class AccountManagerModule {}
```

### 6.4 Modelo Prisma das credenciais

```prisma
model GoogleCredential {
  id             String   @id @default(uuid()) @db.Uuid
  name           String   @unique
  clientId       String   @map("client_id")
  clientSecret   String   @map("client_secret")
  refreshToken   String   @map("refresh_token")
  quotaProjectId String   @map("quota_project_id")
  active         Boolean  @default(true)
  createdAt      DateTime @default(now()) @map("created_at")

  @@map("google_credentials")
}
```

Cada linha = uma conta GCP com OAuth2 (client_id + client_secret + refresh_token) e o
`quota_project_id` que vira o `{PROJECT_ID}` no path do Vertex.

---

## 7. Autenticação das rotas — `ApiKeyGuard`

Registrado globalmente (`APP_GUARD`), todas as rotas exigem o header `x-api-key`
igual à env `API_KEY`.

```ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];
    const validKey = this.configService.get<string>('API_KEY');

    if (!validKey) throw new UnauthorizedException('API_KEY not configured on server');
    if (apiKey !== validKey) throw new UnauthorizedException('Invalid or missing API key');
    return true;
  }
}
```

---

## 8. Registro no `AppModule` e bootstrap

```ts
// app.module.ts (trechos relevantes)
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AccountManagerModule,  // @Global
    VertexModule,          // @Global
    ImageModule,
    // ...
  ],
  providers: [
    { provide: APP_GUARD, useClass: ApiKeyGuard },
  ],
})
export class AppModule {}
```

```ts
// main.ts (trechos relevantes)
app.use(json({ limit: '50mb' }));          // imagens base64 são grandes!
app.setGlobalPrefix('api');                // => rotas viram /api/image/...
app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
app.enableCors({
  origin: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
});
```

> **Importante:** o limite do body JSON precisa ser alto (`50mb`) porque tanto o input
> (imagens de referência) quanto o output (imagens geradas) trafegam em base64.

---

## 9. Exemplos de chamada (cURL)

### Imagen — texto → imagem

```bash
curl -X POST http://localhost:8012/api/image/generate \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{
    "prompt": "A futuristic cityscape at sunset, cyberpunk style",
    "model": "imagen-3.0-generate-002",
    "count": 1,
    "aspect_ratio": "16:9",
    "mime_type": "image/png"
  }'
```

### Gemini — edição com imagem de referência

```bash
curl -X POST http://localhost:8012/api/image/generate-gemini \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{
    "prompt": "Transform this photo into a watercolor painting",
    "model": "gemini-3-pro-image-preview",
    "aspect_ratio": "1:1",
    "images": [{ "base64": "<BASE64_DA_IMAGEM>", "mime_type": "image/png" }]
  }'
```

Resposta Gemini:

```json
{
  "parts": [
    { "type": "image", "base64": "<...>", "mimeType": "image/png" }
  ]
}
```

---

## 10. Checklist de portabilidade para o agente

- [ ] Copiar `image/` (controller, service, module, 2 DTOs).
- [ ] Garantir um cliente Vertex equivalente a `VertexService.proxyRequest(method, path, body, location, useRegionalEndpoint, requestLogId)`.
  - Se não houver: portar `VertexModule` + `AccountManagerModule` + modelo Prisma `GoogleCredential`.
  - Se já houver auth Vertex: adaptar as 2 chamadas `proxyRequest` no `ImageService`.
- [ ] Registrar `ImageModule` no `AppModule`.
- [ ] Garantir `ApiKeyGuard` (ou a auth existente do projeto de destino).
- [ ] Definir `app.setGlobalPrefix('api')` e `json({ limit: '50mb' })`.
- [ ] Definir env `API_KEY` (e `DATABASE_URL` se usar o AccountManager).
- [ ] Popular ao menos 1 conta GCP (OAuth2) na tabela `google_credentials`.
- [ ] Definir os nomes de modelo válidos para Imagen e Gemini no ambiente de destino.
- [ ] Se não usar o interceptor de logging, remover `req['requestLogId']` / `requestLogId`.

---

## 11. Notas e pegadinhas

- **Imagen** usa `:predict` e retorna o JSON **cru** do Vertex (imagens em `predictions[].bytesBase64Encoded`). O backend **não** transforma — o cliente lida com o formato do Vertex.
- **Gemini** usa `:streamGenerateContent`, que retorna um **array de chunks**; é obrigatório iterar todos os chunks e concatenar os `parts`. O backend **normaliza** para `{ parts: [...] }`.
- `location` default é `global` para ambos. Imagen aceita override via campo `location`; Gemini é fixo em `global` no código original.
- As `safetySettings` estão **todas em `OFF`** no Gemini e `personGeneration: ALLOW_ALL` — ajuste conforme a política do projeto de destino.
- `model` **não tem default no service** — se o DTO não enviar, a URL fica inválida. Garanta um default (no DTO ou no service) no projeto de destino.
- O retry só re-tenta automaticamente em **erro de billing** (403/429 com frases conhecidas), trocando de conta. Outros erros sobem direto como `HttpException`.
- Timeout do axios é **800s** (geração de imagem/vídeo pode ser lenta).
```
