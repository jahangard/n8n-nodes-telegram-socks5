# معماری فنی — n8n-nodes-telegram-socks5

این سند سطح پایین‌تر از README اصلی است و برای مشارکت‌کنندگان (Contributors) و توسعه‌دهندگانی نوشته شده که می‌خواهند رفتار داخلی کد را بدون نیاز به خواندن کامل سورس درک کنند.

## 1. جریان داده (Data Flow) کامل

```
INodeExecutionData[] (items)
        │
        ▼
execute(this: IExecuteFunctions)
        │
        ├─ this.getCredentials('telegramSocks5Api')   ← یک‌بار در ابتدای اجرا
        ├─ createTelegramClient(credentials)            ← یک AxiosInstance مشترک برای همه items
        │
        └─ for (i = 0; i < items.length; i++)
                ├─ this.getNodeParameter(...، i)         ← خواندن پارامترهای هر آیتم (پشتیبانی از Expression)
                ├─ ساخت body (JSON) یا form (multipart)
                ├─ client.post(endpoint, body|form)
                ├─ موفق  → returnData.push({ json, pairedItem })
                └─ ناموفق → continueOnFail ? push error-item : throw NodeApiError
        │
        ▼
return [returnData]   ← فرمت استاندارد خروجی یک نود n8n با یک output واحد (Main)
```

نکتهٔ کلیدی: `createTelegramClient` **یک‌بار در خارج از حلقه** فراخوانی می‌شود، نه به ازای هر آیتم. این تصمیم عمدی است تا:

- هزینه ساخت Agent/Socket جدید به ازای هر آیتم تکرار نشود.
- در صورت نامعتبر بودن تنظیمات پروکسی، خطا **قبل از** پردازش هر آیتمی throw شود (fail-fast) به‌جای اینکه هر آیتم جداگانه با خطای یکسان مواجه شود.

## 2. لایه Transport: `createTelegramClient`

```typescript
function createTelegramClient(credentials: TelegramSocks5Credentials): AxiosInstance
```

### ورودی
شیء `credentials` که مستقیماً حاصل `this.getCredentials('telegramSocks5Api')` است و به تایپ داخلی `TelegramSocks5Credentials` cast می‌شود (چون تایپ رسمی برگشتی از `getCredentials` به‌صورت `ICredentialDataDecryptedObject` عمومی است).

### خروجی
یک نمونهٔ `AxiosInstance` با:
- `baseURL` از پیش تنظیم‌شده روی `https://api.telegram.org/bot<TOKEN>`
- `timeout: 60000` (۶۰ ثانیه)
- در صورت `useProxy=true`: `httpAgent` و `httpsAgent` هر دو به یک نمونه Agent مشترک اشاره می‌کنند (چون تمام ترافیک به سمت Telegram روی HTTPS است، ولی برخی پیاده‌سازی‌های Agent به `httpAgent` هم برای CONNECT اولیه نیاز دارند).
- `proxy: false` صراحتاً ست می‌شود تا مکانیزم native پروکسی Axios (که فقط HTTP proxy را از طریق env vars مثل `HTTP_PROXY` می‌شناسد) فعال نشود و با Agent injected تداخل نکند.

### ساخت URL پروکسی

```typescript
const auth = user && pass
  ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@`
  : '';

// SOCKS5
`socks5h://${auth}${host}:${port}`

// HTTP
`http://${auth}${host}:${port}`
```

`encodeURIComponent` روی username/password اعمال می‌شود تا کاراکترهای خاص (`@`, `:`, `/`) در اطلاعات احراز هویت، ساختار URL Agent را نشکنند.

## 3. لایه Node UI: `INodeTypeDescription`

فیلدهای UI با `displayOptions.show` کنترل می‌شوند تا فقط فیلدهای مرتبط با `operation` انتخاب‌شده نمایش داده شوند. جدول نگاشت:

| operation | فیلدهای نمایش داده شده |
|---|---|
| `sendMessage` | `chatId`, `text`, `parseMode`, `replyToMessageId`, `additionalFields` |
| `sendPhoto` / `sendDocument` | `chatId`, `binaryData`, (`binaryPropertyName` یا `fileUrl`), `caption`, `additionalFields` |

این الگو مطابق با راهنمای رسمی n8n برای نودهای چند-عملیاتی (`resource`/`operation` pattern) است، با این تفاوت که چون این نود فقط یک `resource` (پیام/فایل) دارد، از `resource` صرف‌نظر و مستقیماً از `operation` استفاده شده — که مطابق قوانین `eslint-plugin-n8n-nodes-base` (قانون `node-param-resource-without-no-data-expression` و مشابه) قابل قبول است چون overhead غیرضروری UI را حذف می‌کند.

## 4. تبدیل camelCase → snake_case برای Additional Fields

```typescript
key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
```

چون پارامترهای داخلی n8n به‌صورت camelCase تعریف می‌شوند (`disableNotification`) اما Telegram Bot API انتظار snake_case دارد (`disable_notification`)، این تبدیل به‌صورت خودکار در زمان ساخت `FormData` برای `sendPhoto`/`sendDocument` انجام می‌شود. برای `sendMessage` این تبدیل به‌صورت صریح (نه Regex) در body انجام شده چون تعداد فیلدها کم و ثابت است.

> نکته برای توسعه‌دهندگان: اگر Additional Field جدیدی اضافه می‌کنید که نام آن از الگوی ساده camelCase → snake_case پیروی نمی‌کند (مثلاً دارای اعداد یا acronym مثل `URLPreview`)، باید نگاشت را به‌صورت دستی در `execute()` اضافه کنید؛ به رگکس تکیه نکنید.

## 5. مدیریت Binary Data

```typescript
const binaryData = this.helpers.assertBinaryData(i, binaryPropertyName);
const buffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);
form.append(fieldName, buffer, {
    filename: binaryData.fileName ?? 'file',
    contentType: binaryData.mimeType,
});
```

- `assertBinaryData` تضمین می‌کند که Binary Property موجود است، در غیر این صورت یک `NodeOperationError` خوانا (نه یک `TypeError` مبهم) throw می‌کند.
- `getBinaryDataBuffer` کل فایل را به‌صورت `Buffer` در حافظه بارگذاری می‌کند. برای فایل‌های بسیار بزرگ (چند صد مگابایت به بالا) این می‌تواند فشار حافظه ایجاد کند — به همین دلیل Streaming آپلود در Roadmap قرار دارد (نگاه کنید به بخش Roadmap در README اصلی).

## 6. نگاشت خطا

```
AxiosError
   │
   ├─ error.response?.data.description   (پیام رسمی خطای Telegram، مثل "Bad Request: chat not found")
   │
   ▼
NodeApiError(node, rawResponseData, { message, description, itemIndex })
```

این نگاشت باعث می‌شود:
1. پیام خطا در UI اجرای n8n دقیقاً همان چیزی باشد که Telegram برگردانده (نه یک پیام عمومی Axios مثل `Request failed with status code 400`).
2. `itemIndex` مشخص کند دقیقاً کدام آیتم ورودی باعث خطا شده (مهم در اجرای Batch روی چند آیتم).
3. داده خام پاسخ (`raw response data`) برای Debug در دسترس بماند.

## 7. قراردادهای کدنویسی (Coding Conventions)

- تمام فایل‌های `.ts` باید از قوانین `eslint-plugin-n8n-nodes-base` عبور کنند (`npm run lint`).
- از `any` فقط در نقاط مرزی (boundary) با تایپ‌های ناقص کتابخانه‌های شخص ثالث استفاده شده (مثل `error.response?.data as any` هنگام پاس دادن به `NodeApiError`)؛ در بقیه کد تایپ صریح الزامی است.
- تمام رشته‌های قابل‌نمایش به کاربر (labels، descriptions) باید در `description` (سند INodeTypeDescription) واضح و به انگلیسی باشند (طبق استاندارد Community Nodes n8n)، حتی اگر مستندات پروژه به فارسی نوشته شده باشد.
