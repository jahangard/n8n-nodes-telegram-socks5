# Technical Architecture — n8n-nodes-telegram-socks5

**Author:** Mehdi Jahangard ([mehdi.jahangard@gmail.com](mailto:mehdi.jahangard@gmail.com))

This document goes deeper than the main README and is intended for contributors and developers who want to understand the internal behavior of the code without reading through the entire source.

## 1. Full Data Flow

```
INodeExecutionData[] (items)
        │
        ▼
execute(this: IExecuteFunctions)
        │
        ├─ this.getCredentials('telegramSocks5Api')   ← once at the start of execution
        ├─ createTelegramClient(credentials)            ← a single AxiosInstance shared by all items
        │
        └─ for (i = 0; i < items.length; i++)
                ├─ this.getNodeParameter(..., i)         ← read per-item parameters (supports Expressions)
                ├─ build body (JSON) or form (multipart)
                ├─ client.post(endpoint, body|form)
                ├─ success → returnData.push({ json, pairedItem })
                └─ failure → continueOnFail ? push error-item : throw NodeApiError
        │
        ▼
return [returnData]   ← standard n8n node output format, single Main output
```

Key detail: `createTelegramClient` is called **once, outside the loop**, not per item. This is a deliberate choice so that:

- The cost of creating a new Agent/socket isn't repeated for every item.
- If the proxy configuration is invalid, the error is thrown **before** any item is processed (fail-fast) instead of every item independently hitting the same error.

## 2. Transport Layer: `createTelegramClient`

```typescript
function createTelegramClient(credentials: TelegramSocks5Credentials): AxiosInstance
```

### Input
The `credentials` object, taken directly from `this.getCredentials('telegramSocks5Api')` and cast to the internal `TelegramSocks5Credentials` type (since the official return type of `getCredentials` is a generic `ICredentialDataDecryptedObject`).

### Output
An `AxiosInstance` with:
- `baseURL` pre-set to `https://api.telegram.org/bot<TOKEN>`
- `timeout: 60000` (60 seconds)
- If `useProxy=true`: both `httpAgent` and `httpsAgent` point to the same Agent instance (since all traffic to Telegram is over HTTPS, but some Agent implementations also need `httpAgent` for the initial CONNECT).
- `proxy: false` is set explicitly so Axios's own native proxy mechanism (which only recognizes HTTP proxies via env vars like `HTTP_PROXY`) doesn't activate and conflict with the injected Agent.

### Building the proxy URL

```typescript
const auth = user && pass
  ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@`
  : '';

// SOCKS5
`socks5h://${auth}${host}:${port}`

// HTTP
`http://${auth}${host}:${port}`
```

`encodeURIComponent` is applied to the username/password so that special characters (`@`, `:`, `/`) in the auth credentials don't break the Agent URL structure.

## 3. Node UI Layer: `INodeTypeDescription`

UI fields are controlled with `displayOptions.show` so that only fields relevant to the selected `operation` are shown. Mapping table:

| operation | fields shown |
|---|---|
| `sendMessage` | `chatId`, `text`, `parseMode`, `replyToMessageId`, `additionalFields` |
| `sendPhoto` / `sendDocument` | `chatId`, `binaryData`, (`binaryPropertyName` or `fileUrl`), `caption`, `additionalFields` |

This follows n8n's official guidance for multi-operation nodes (the `resource`/`operation` pattern), with the difference that since this node only has a single conceptual `resource` (message/file), `resource` was omitted and `operation` is used directly — which is acceptable under `eslint-plugin-n8n-nodes-base` rules and removes unnecessary UI overhead.

## 4. camelCase → snake_case Conversion for Additional Fields

```typescript
key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
```

Since n8n's internal parameters are defined in camelCase (`disableNotification`) but the Telegram Bot API expects snake_case (`disable_notification`), this conversion is applied automatically when building the `FormData` for `sendPhoto`/`sendDocument`. For `sendMessage` this conversion is done explicitly (not via regex) in the body, since the field count is small and fixed.

> Developer note: if you add a new Additional Field whose name doesn't follow the simple camelCase → snake_case pattern (e.g. contains digits or an acronym like `URLPreview`), you must add the mapping manually in `execute()` — don't rely on the regex.

## 5. Binary Data Handling

```typescript
const binaryData = this.helpers.assertBinaryData(i, binaryPropertyName);
const buffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);
form.append(fieldName, buffer, {
    filename: binaryData.fileName ?? 'file',
    contentType: binaryData.mimeType,
});
```

- `assertBinaryData` guarantees the Binary Property exists; otherwise it throws a readable `NodeOperationError` (not an opaque `TypeError`).
- `getBinaryDataBuffer` loads the entire file into memory as a `Buffer`. For very large files (several hundred MB and up) this can put pressure on memory usage — which is why streaming upload is on the Roadmap (see the Roadmap section in the main README).

## 6. Error Mapping

```
AxiosError
   │
   ├─ error.response?.data.description   (Telegram's official error message, e.g. "Bad Request: chat not found")
   │
   ▼
NodeApiError(node, rawResponseData, { message, description, itemIndex })
```

This mapping ensures:
1. The error message shown in the n8n execution UI is exactly what Telegram returned (not a generic Axios message like `Request failed with status code 400`).
2. `itemIndex` identifies exactly which input item caused the error (important when running a batch of multiple items).
3. The raw response data stays available for debugging.

## 7. Coding Conventions

- All `.ts` files must pass `eslint-plugin-n8n-nodes-base` rules (`npm run lint`).
- `any` is used only at boundaries with incompletely typed third-party libraries (e.g. `error.response?.data as any` when passing to `NodeApiError`); explicit typing is required everywhere else.
- All user-facing strings (labels, descriptions) in `INodeTypeDescription` must be clear and in English (per n8n Community Node conventions), even though this project's documentation is written in a different language for the maintainer's convenience.
